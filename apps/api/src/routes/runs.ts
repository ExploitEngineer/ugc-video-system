// /runs routes — create, poll, artifacts, and feedback/cancel gating.
//
// Responses always go through the mappers (lib/mappers.ts) so the frontend
// only ever sees the @ugc/shared DTO shapes. The confirm-mode gate has a SINGLE
// action: `POST /feedback` (free text; blank = continue), legal only from
// `awaiting_confirmation`. Cancel works from any non-terminal status.

import type { AssetKind } from "@ugc/shared";
import {
  createRunInputSchema,
  detectPlaceholders,
  feedbackInputSchema,
  isMultiSegment,
  regenerateVideoInputSchema,
  runTemplateSchema,
  segmentCountFor,
} from "@ugc/shared";
import type { Run, RunDetail, RunTemplate } from "@ugc/shared";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import sharp from "sharp";
import {
  gateForCurrentStep,
  getOpenAI,
  interpretFeedback,
  resumeStepForVideoRegen,
  rewindStepForTemplateRegen,
} from "../agents/creative-direction/index.js";
import { getAdType } from "../agents/ad-types/registry.js";
import {
  getTemplate,
  incrementTemplateUse,
  parseMetadata,
  parseStructure,
} from "../agents/template/library.js";
import { closeInFlightStepsOnCancel } from "../agents/events.js";
import { persistAsset } from "../agents/persist.js";
import { env } from "../config/index.js";
import { db, schema } from "../db/index.js";
import { badRequest, unprocessable } from "../lib/errors.js";
import { normalizePersonImage } from "../lib/image/normalize.js";
import { createLogger } from "../lib/log.js";
import { toAssetDto, toRunDto } from "../lib/mappers.js";
import {
  notifyListChanged,
  notifyRunChanged,
  offListChanged,
  offRunChanged,
  onListChanged,
  onRunChanged,
} from "../lib/run-events.js";
import { assertStatus, getRunOr404, loadRunDetail } from "../lib/runs.js";
import { deleteRunObjects, uploadAsset } from "../lib/storage.js";
import { extractAudio } from "../lib/video/merge.js";

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_VIDEO_MIME = ["video/mp4"];
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB — headroom for a ~60s 1080p client-side MP4 export

// Coarse request-body caps enforced by `bodyLimit` middleware BEFORE
// `parseBody` buffers the whole body into memory (the DoS backstop; the
// per-field validate* checks below remain the exact limits). Headroom over the
// per-file limit covers multipart boundaries/overhead.
const MAX_CREATE_BODY_BYTES = 12 * 1024 * 1024; // 10MB image + overhead
const MAX_EDITED_VIDEO_BODY_BYTES = 210 * 1024 * 1024; // 200MB video + overhead
const bodyTooLarge = (c: Context) =>
  c.json({ error: "Upload too large.", code: "PAYLOAD_TOO_LARGE" }, 413);

const log = createLogger("runs");

export const runs = new Hono();

// ── SSE plumbing (live updates; replaces client polling) ──────────────
// The in-process bus (lib/run-events) signals a change; this handler re-reads
// the authoritative snapshot from the DB and writes ONE frame. A 250ms tick
// coalesces the 2-4 emits a single step produces; a ~10s backstop re-read covers
// any missed signal (or a second worker process); a ~20s heartbeat keeps
// intermediaries from idle-closing the connection.
const SSE_TICK_MS = 250;
const SSE_BACKSTOP_TICKS = 40; // 40 × 250ms ≈ 10s
const SSE_HEARTBEAT_TICKS = 80; // 80 × 250ms ≈ 20s

/**
 * Generic snapshot streamer. Subscribe to the bus, then each tick probe a CHEAP
 * change key (`readSig`); only when it moves do we build + push the full payload
 * (`load`). This keeps the expensive read (5 queries + Zod + JSON.stringify of
 * the growing run history) off every backstop tick and every idle frame — it
 * runs once per ACTUAL change, not per tick × open client. Shared by both SSE
 * routes below.
 */
function streamSnapshots<T>(
  c: Context,
  opts: {
    subscribe: (cb: () => void) => void;
    unsubscribe: (cb: () => void) => void;
    /** Cheap change key (tiny query). `null` ⇒ gone (e.g. deleted mid-stream). */
    readSig: () => Promise<string | null>;
    /** Full payload build — runs ONLY when `readSig` moved. */
    load: () => Promise<T>;
    /** Terminal + settled → send a final `done` event and close the stream. */
    done?: (data: T) => boolean;
  },
) {
  return streamSSE(c, async (stream) => {
    let dirty = true; // force the initial frame
    const onChange = () => {
      dirty = true;
    };
    opts.subscribe(onChange);
    stream.onAbort(() => opts.unsubscribe(onChange));

    let lastSig = "";
    let tick = 0;
    try {
      while (!stream.aborted && !stream.closed) {
        // Probe the cheap signature when a signal arrived or on the backstop.
        if (dirty || tick % SSE_BACKSTOP_TICKS === 0) {
          dirty = false;
          const sig = await opts.readSig().catch(() => null);
          if (sig !== null && sig !== lastSig) {
            lastSig = sig;
            // Only NOW pay for the full payload build.
            const data = await opts.load().catch(() => null);
            if (data !== null) {
              await stream.writeSSE({
                event: "snapshot",
                data: JSON.stringify(data),
              });
              if (opts.done?.(data)) {
                await stream.writeSSE({ event: "done", data: "{}" });
                break;
              }
            }
          }
        }
        if (tick % SSE_HEARTBEAT_TICKS === 0) {
          await stream.writeSSE({ event: "ping", data: "" });
        }
        tick++;
        await stream.sleep(SSE_TICK_MS);
      }
    } finally {
      opts.unsubscribe(onChange);
    }
  });
}

/** The `GET /runs` list payload — shared by the list route + its stream. Selects
 *  only the columns `toRunDto` reads, NOT the heavy jsonb
 *  (`narrativeOutline`/`productUse`/`visualStyle`) the list DTO never carries. */
async function loadRunList(): Promise<Run[]> {
  const rows = await db
    .select({
      id: schema.runs.id,
      projectId: schema.runs.projectId,
      prompt: schema.runs.prompt,
      adStyle: schema.runs.adStyle,
      adType: schema.runs.adType,
      adTypeSource: schema.runs.adTypeSource,
      mode: schema.runs.mode,
      aspectRatio: schema.runs.aspectRatio,
      duration: schema.runs.duration,
      pipeline: schema.runs.pipeline,
      criticEnabled: schema.runs.criticEnabled,
      characterEnabled: schema.runs.characterEnabled,
      status: schema.runs.status,
      currentStep: schema.runs.currentStep,
      error: schema.runs.error,
      errorCode: schema.runs.errorCode,
      feedback: schema.runs.feedback,
      createdAt: schema.runs.createdAt,
      updatedAt: schema.runs.updatedAt,
    })
    .from(schema.runs)
    .orderBy(desc(schema.runs.createdAt));
  return rows.map(toRunDto);
}

/** Cheap list change key — row count + newest updatedAt. A create/delete moves
 *  the count; any status/step change bumps a row's updatedAt (so the max moves).
 *  The ~10s backstop covers the rare same-instant collision. */
async function listSig(): Promise<string> {
  const [agg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      m: sql<string>`coalesce(max(${schema.runs.updatedAt})::text, '')`,
    })
    .from(schema.runs);
  return `${agg?.n ?? 0}:${agg?.m ?? ""}`;
}

/** Cheap per-run change key — status + updatedAt only (no joins/jsonb). `null`
 *  when the run is gone (deleted mid-stream). */
async function runHeadSig(id: string): Promise<string | null> {
  const [head] = await db
    .select({ status: schema.runs.status, updatedAt: schema.runs.updatedAt })
    .from(schema.runs)
    .where(eq(schema.runs.id, id))
    .limit(1);
  return head ? `${head.status}:${head.updatedAt.getTime()}` : null;
}

/** A per-run stream closes once the run is terminal AND its final output landed
 *  (mirrors the old poll's stop condition so the clip is never stranded). */
function isSettled(run: RunDetail): boolean {
  if (run.status === "failed") return true;
  if (run.status === "completed")
    return run.assets.some((a) => a.kind === "final_video");
  return false;
}

/** Read + validate a single uploaded image from a parsed multipart body. */
function validateImage(value: unknown, field: string, required: boolean): File | null {
  const present = value instanceof File && value.size > 0;
  if (!present) {
    if (required) throw unprocessable("A product image is required.");
    return null;
  }
  if (!ALLOWED_IMAGE_MIME.includes(value.type)) {
    throw unprocessable(
      `Unsupported image type for ${field}: ${value.type || "unknown"}. Use PNG, JPEG, or WebP.`,
    );
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw unprocessable(`${field} exceeds the 10MB limit.`);
  }
  return value;
}

/** Read + validate a required video (the CE.SDK MP4 export) from a parsed body. */
function validateVideo(value: unknown, field: string): File {
  if (!(value instanceof File) || value.size === 0) {
    throw unprocessable(`An edited ${field} is required.`);
  }
  if (!ALLOWED_VIDEO_MIME.includes(value.type)) {
    throw unprocessable(
      `Unsupported video type for ${field}: ${value.type || "unknown"}. Use MP4.`,
    );
  }
  if (value.size > MAX_VIDEO_BYTES) {
    throw unprocessable(
      `${field} exceeds the ${MAX_VIDEO_BYTES / (1024 * 1024)}MB limit.`,
    );
  }
  return value;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Sniff actual image bytes. The multipart part's Content-Type is client-
 * controlled, so confirm the bytes really decode as one of the allowed formats
 * before we store them verbatim (the product image is NOT re-encoded). Rejects
 * mislabeled/undecodable content with a 422.
 */
async function assertImageBytes(bytes: Uint8Array, field: string): Promise<string> {
  let format: string | undefined;
  try {
    format = (await sharp(Buffer.from(bytes)).metadata()).format;
  } catch {
    throw unprocessable(`${field} is not a readable image. Use PNG, JPEG, or WebP.`);
  }
  if (!format || !["png", "jpeg", "webp"].includes(format)) {
    throw unprocessable(`${field} is not a PNG, JPEG, or WebP image.`);
  }
  // Return the TRUE mime sniffed from the bytes — the client-declared part type
  // is unreliable (a WebP commonly arrives labelled image/png), and storing the
  // wrong mime makes downstream AI calls send a mismatched data URI that Anthropic
  // rejects as an opaque "400 Provider returned error".
  return `image/${format}`;
}

/** Confirm MP4 bytes by the ISO-BMFF `ftyp` box marker at offset 4 (the
 *  declared video type is client-controlled). */
function assertMp4Bytes(bytes: Uint8Array, field: string): void {
  const hasFtyp =
    bytes.length > 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70; // p
  if (!hasFtyp) throw unprocessable(`${field} is not a valid MP4 file.`);
}

// ── POST /runs — create a run from multipart form data ────────────────
runs.post(
  "/",
  bodyLimit({ maxSize: MAX_CREATE_BODY_BYTES, onError: bodyTooLarge }),
  async (c) => {
  const body = await c.req.parseBody();

  // Product + person are BOTH optional uploads now — some ad types (graphic-text
  // manifestos, explainers, promos…) need neither. The per-type requirement is
  // enforced below for an explicit pick; person is never a required upload (it is
  // synthesized when the type needs it).
  const productImage = validateImage(body.productImage, "productImage", false);
  const personImage = validateImage(body.personImage, "personImage", false);

  const parsed = createRunInputSchema.safeParse({
    prompt: body.prompt,
    mode: body.mode,
    aspectRatio: body.aspectRatio,
    // FormData omits `duration` on legacy clients → schema default "15s".
    ...(body.duration ? { duration: body.duration } : {}),
    // FormData carries strings; Critic is parked (off by default) — enabled
    // only if explicitly "true". The studio UI no longer sends this field.
    criticEnabled: body.criticEnabled === "true",
    hasPersonImage: personImage !== null,
    // Character On/Off toggle (Chunk 4). FormData carries a string; omitted by
    // legacy/API clients → resolved from the ad-type default below.
    ...(body.characterEnabled !== undefined
      ? { characterEnabled: body.characterEnabled === "true" }
      : {}),
    // Optional ad-type override (Chunk J). FormData omits it / sends "auto" for
    // the default auto-detect path.
    ...(body.adType ? { adType: body.adType } : {}),
    // Optional user-typed brand guidelines (multipart text field).
    ...(body.brandText ? { brandText: body.brandText } : {}),
    // Which pipeline this run uses (Chunk: template pipeline redesign).
    // FormData omits it on legacy clients → schema default "video".
    ...(body.pipeline ? { pipeline: body.pipeline } : {}),
    ...(body.templateId ? { templateId: body.templateId } : {}),
  });
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid input",
      parsed.error.issues,
    );
  }
  const { prompt, adType, brandText, pipeline, templateId } = parsed.data;
  let aspectRatio = parsed.data.aspectRatio;
  let duration = parsed.data.duration;
  // A template run is FULL AUTO by contract: `plan.ts` collapses its chain on
  // the assumption that no gate ever fires and no inspection step ever runs.
  // Enforce that here, at the boundary, rather than threading the exception
  // through the gate map — a confirm-mode template run would otherwise pause at
  // the reference gate and wait for a "continue" the studio never offers.
  const isTemplateRun = pipeline === "template";
  const mode = isTemplateRun ? ("automatic" as const) : parsed.data.mode;
  const criticEnabled = isTemplateRun ? false : parsed.data.criticEnabled;

  // ── Template pipeline gate ──────────────────────────────────────────
  // `templateId` is OUR `templates.id`, never Nexrender's. The admin already
  // registered, introspected and validated this template when they added it to
  // the library, so the structure is read straight from our DB: no network
  // call, no trust in whatever the client cached, and a bad file could never
  // have reached the picker in the first place. Runs before any image upload,
  // DB insert or AI call.
  let runTemplate: RunTemplate | null = null;
  if (pipeline === "template") {
    // Master switch — the pipeline stays dark until it's smoke-tested end to end.
    if (!env.TEMPLATE_STEP_ENABLED) {
      throw unprocessable("The template pipeline isn't enabled yet.");
    }
    if (!templateId) {
      throw badRequest("A templateId is required for the template pipeline.");
    }
    const row = await getTemplate(templateId).catch(() => undefined);
    if (!row || row.status !== "ready" || row.archivedAt) {
      throw unprocessable("That template isn't available. Pick another one.");
    }
    const structure = parseStructure(row.structure);
    const metadata = parseMetadata(row.metadata);
    if (!structure || !metadata || !row.nexrenderTemplateId) {
      throw unprocessable("That template is missing its structure. Pick another one.");
    }

    runTemplate = runTemplateSchema.parse({
      templateId: row.id,
      nexrenderTemplateId: row.nexrenderTemplateId,
      mainComposition: structure.mainComposition ?? "",
      renderCompositions: structure.renderCompositions,
      slots: structure.slots,
      compositionWidth: structure.mainCompositionWidth,
      compositionHeight: structure.mainCompositionHeight,
      metadata,
      displayName: row.displayName,
    });

    // The template's composition dictates the output shape — never let a
    // mismatched pick letterbox or stretch inside it.
    if (metadata.aspectRatio) aspectRatio = metadata.aspectRatio;
    // `duration` is the run's SEGMENT plan, not the clip length: a template run
    // is always a single clip. The clip's real length is `metadata.clipSeconds`,
    // derived from the template's own composition, and the video agent reads it
    // from the snapshot rather than from this enum.
    duration = "15s";

    // Powers the picker's "popular" sort. Best-effort: a failed counter must
    // never block a run the user has already paid for.
    void incrementTemplateUse(row.id).catch(() => {});
  }

  // Fix 8: detect unresolved bracket fill-in slots ([SHOCK STAT], [PRICE], …) so
  // they surface immediately in detector_meta (the worker re-derives + enriches
  // this with any invented values once the detector runs).
  const unresolvedPlaceholders = detectPlaceholders(prompt);
  // An explicit pick (anything but "auto") LOCKS the type — the detector still
  // fills adStyle + hooks but honors this adType (orchestrator). "auto"/omitted
  // leaves it null for full auto-detection.
  const userAdType = adType && adType !== "auto" ? adType : null;

  // Character On/Off toggle (Chunk 4): whether a main on-screen character is
  // generated (uploaded or synthesized). When the client omits it, default from
  // the picked ad-type's `characterDefault` (the form always sends it).
  const characterEnabled =
    parsed.data.characterEnabled ??
    getAdType(userAdType ?? "service").characterDefault;

  // Per-type asset requirement: an explicit pick whose policy REQUIRES a product
  // must include one. Auto-detect stays permissive (the detector + reconcile
  // handle whatever was uploaded — a product-required type with no product
  // downgrades to a no-product type).
  if (
    userAdType &&
    getAdType(userAdType).assetPolicy.product === "required" &&
    !productImage
  ) {
    throw badRequest(
      `The "${getAdType(userAdType).displayName}" ad type needs a product image.`,
    );
  }

  // Build the upload set. Product is left untouched (it never reaches BytePlus
  // CreateAsset, where padding bars would leak into stills). The person photo is
  // normalized into CreateAsset's limits (aspect 0.4–2.5, height 300–6000) so the
  // stored `person_upload` is always usable as a face asset. Done BEFORE any DB
  // insert so a 422 here never leaves an orphaned run.
  const uploads: { kind: AssetKind; bytes: Uint8Array; mime: string }[] = [];
  if (productImage) {
    const productBytes = await fileToBytes(productImage as File);
    // Verify the bytes really decode as an allowed image — the declared MIME is
    // client-controlled and the product image is stored verbatim. Use the SNIFFED
    // mime (not the client part type) so a mislabelled WebP is stored honestly.
    const productMime = await assertImageBytes(productBytes, "productImage");
    uploads.push({
      kind: "product_upload",
      bytes: productBytes,
      mime: productMime,
    });
  }
  if (personImage) {
    const norm = await normalizePersonImage(
      await fileToBytes(personImage),
      personImage.type,
    );
    uploads.push({ kind: "person_upload", bytes: norm.bytes, mime: norm.mime });
  }

  // `runs.projectId` is NOT NULL → auto-create a project to own this run.
  const [project] = await db
    .insert(schema.projects)
    .values({ title: prompt.slice(0, 80) })
    .returning();

  const [run] = await db
    .insert(schema.runs)
    .values({
      projectId: project.id,
      prompt,
      mode,
      aspectRatio,
      duration,
      pipeline,
      criticEnabled,
      characterEnabled,
      ...(brandText ? { brandText } : {}),
      // The FK enables "which runs used this template"; the snapshot is what the
      // pipeline actually reads, and stays valid even if the template is archived.
      ...(runTemplate
        ? { templateId: runTemplate.templateId, template: runTemplate }
        : {}),
      ...(userAdType
        ? { adType: userAdType, adTypeSource: "user" as const }
        : {}),
      ...(unresolvedPlaceholders.length
        ? { detectorMeta: { unresolvedPlaceholders } }
        : {}),
      status: "queued",
      // Insert the run already LOCKED so the worker can't claim it yet. Without
      // this, the worker (which polls for `queued` rows with a free/stale lock)
      // races the upload below and claims the run before its `product_upload`
      // asset is committed — product_sheet then throws "run has no
      // product_upload asset" while the parallel person_sheet (no upload)
      // succeeds. The lock is released once the uploads land; a route crash
      // mid-upload is recovered by the worker's stale-lock reclaim (>3min).
      lockedAt: new Date(),
      lockedBy: "pending-upload",
    })
    .returning();

  // Upload images, then record them as `assets`, BEFORE releasing the lock so
  // the worker only ever sees a run whose inputs already exist.
  try {
    for (const { kind, bytes, mime } of uploads) {
      const { storagePath, url } = await uploadAsset({
        runId: run.id,
        kind,
        bytes,
        contentType: mime,
      });
      await db.insert(schema.assets).values({
        runId: run.id,
        kind,
        storagePath,
        url,
        mime,
      });
    }
  } catch (err) {
    // Upload failed → fail the run (clear the lock so nothing reclaims it).
    await db
      .update(schema.runs)
      .set({
        status: "failed",
        error: "Image upload failed.",
        errorCode: "INTERNAL",
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, run.id));
    throw err;
  }

  // Inputs are committed — release the creation hold so the worker can claim it.
  await db
    .update(schema.runs)
    .set({ lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(eq(schema.runs.id, run.id));

  // Surface the new run in any open sidebar list stream.
  notifyListChanged();

  return c.json(await loadRunDetail(run.id), 201);
});

// ── GET /runs — list all runs, newest first (sidebar history) ─────────
runs.get("/", async (c) => {
  return c.json(await loadRunList());
});

// ── GET /runs/events — SSE stream of the run LIST (sidebar) ───────────
// Registered BEFORE `/:id` so the static segment is never captured as an id.
// Pushes a fresh `Run[]` whenever any run is created, deleted, or changes
// status — replaces the sidebar's 10s list poll.
runs.get("/events", (c) => {
  return streamSnapshots<Run[]>(c, {
    subscribe: onListChanged,
    unsubscribe: offListChanged,
    readSig: listSig,
    load: loadRunList,
  });
});

// ── GET /runs/:id — status + artifacts + audit trail (one-shot) ───────
runs.get("/:id", async (c) => {
  return c.json(await loadRunDetail(c.req.param("id")));
});

// ── GET /runs/:id/events — SSE stream of ONE run (run view) ───────────
// Pushes a fresh `RunDetail` on every status/step/asset change; closes with a
// `done` event once the run is terminal and its final video has landed.
// `getRunOr404` runs FIRST so a missing/invalid id returns the 404 JSON (via the
// onError sink) before the stream opens — the web layer keys its not-found
// branch on that.
runs.get("/:id/events", async (c) => {
  const id = c.req.param("id");
  await getRunOr404(id);
  return streamSnapshots<RunDetail>(c, {
    subscribe: (cb) => onRunChanged(id, cb),
    unsubscribe: (cb) => offRunChanged(id, cb),
    readSig: () => runHeadSig(id),
    load: () => loadRunDetail(id),
    done: isSettled,
  });
});

// ── GET /runs/:id/artifacts — generated sheets + final video ──────────
runs.get("/:id/artifacts", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id); // 404 if the run doesn't exist

  const assetRows = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, id));

  const byKind = (kind: AssetKind) => {
    const row = assetRows.find((a) => a.kind === kind);
    return row ? toAssetDto(row) : null;
  };
  const assetById = (assetId: string) => {
    const row = assetRows.find((a) => a.id === assetId);
    return row ? toAssetDto(row) : null;
  };

  // The merged 60s clip (and the single 15s clip) is the `final_video` row —
  // `segment_index IS NULL`. `findFirst` could otherwise return a segment clip.
  const finalVideoRow = await db.query.videos.findFirst({
    where: and(
      eq(schema.videos.runId, id),
      isNull(schema.videos.segmentIndex),
    ),
  });

  // 60s segment artifacts, ordered by segment index. Empty for 15s runs.
  const [segStoryboardRows, segVideoRows] = await Promise.all([
    db
      .select({ segmentIndex: schema.storyboardSheets.segmentIndex, assetId: schema.storyboardSheets.assetId })
      .from(schema.storyboardSheets)
      .where(
        and(
          eq(schema.storyboardSheets.runId, id),
          isNotNull(schema.storyboardSheets.segmentIndex),
        ),
      ),
    db
      .select({
        segmentIndex: schema.videos.segmentIndex,
        assetId: schema.videos.assetId,
        durationSec: schema.videos.durationSec,
      })
      .from(schema.videos)
      .where(
        and(eq(schema.videos.runId, id), isNotNull(schema.videos.segmentIndex)),
      ),
  ]);

  // Newest asset per segment index wins (a targeted regen adds a row).
  const newestPerSegment = <T extends { segmentIndex: number | null; assetId: string }>(
    rows: T[],
  ): T[] => {
    const order = new Map(assetRows.map((a, i) => [a.id, i]));
    const byIdx = new Map<number, T>();
    for (const r of rows) {
      if (r.segmentIndex == null) continue;
      const prev = byIdx.get(r.segmentIndex);
      if (!prev || (order.get(r.assetId) ?? 0) > (order.get(prev.assetId) ?? 0)) {
        byIdx.set(r.segmentIndex, r);
      }
    }
    return [...byIdx.values()].sort(
      (a, b) => (a.segmentIndex ?? 0) - (b.segmentIndex ?? 0),
    );
  };

  const segmentStoryboards = newestPerSegment(segStoryboardRows).map((r) => ({
    segmentIndex: r.segmentIndex as number,
    asset: assetById(r.assetId),
  }));
  const segmentVideos = newestPerSegment(segVideoRows).map((r) => ({
    segmentIndex: r.segmentIndex as number,
    asset: assetById(r.assetId),
    durationSec: r.durationSec == null ? null : Number(r.durationSec),
  }));

  return c.json({
    runId: id,
    productSheet: byKind("product_sheet"),
    personSheet: byKind("person_sheet"),
    // 15s: the single labelled sheet. Multi-segment: the crops live in
    // `segmentStoryboards`; the whole-grid sheet is `storyboardMaster`, so the
    // singular field is null (it would otherwise return an arbitrary crop).
    storyboardSheet: isMultiSegment(run.duration)
      ? null
      : byKind("storyboard_sheet"),
    storyboardMaster: byKind("storyboard_master"),
    finalVideo: finalVideoRow ? assetById(finalVideoRow.assetId) : null,
    // `duration_sec` is `numeric` → Drizzle returns a string; coerce.
    video: finalVideoRow
      ? {
          durationSec:
            finalVideoRow.durationSec == null
              ? null
              : Number(finalVideoRow.durationSec),
          hasAudio: finalVideoRow.hasAudio,
        }
      : null,
    // 60s only — empty arrays for 15s runs.
    segmentStoryboards,
    segmentVideos,
  });
});

// ── POST /runs/:id/edited-video — save a CE.SDK edit of the final video ──
// The advanced video editor (img.ly CE.SDK) runs entirely client-side on a
// COMPLETED run's final video; the worker never touches completed runs, so this
// write is race-free. The MP4 export lands as a new `edited_video` asset — the
// original `final_video` is always kept — and, when the editor includes one,
// the serialized scene lands as `editor_scene` so reopening resumes the edit.
// Multipart body: `video` (required MP4) + `scene` (optional scene JSON).
runs.post(
  "/:id/edited-video",
  bodyLimit({ maxSize: MAX_EDITED_VIDEO_BODY_BYTES, onError: bodyTooLarge }),
  async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["completed"], "Run is not completed.");

  const body = await c.req.parseBody();
  const video = validateVideo(body.video, "video");
  const videoBytes = await fileToBytes(video);
  // Confirm real MP4 bytes — the declared video type is client-controlled.
  assertMp4Bytes(videoBytes, "video");
  const sceneValue = body.scene;
  const scene =
    sceneValue instanceof File && sceneValue.size > 0 ? sceneValue : null;

  await persistAsset({
    runId: id,
    kind: "edited_video",
    bytes: videoBytes,
    mime: "video/mp4",
    meta: { source: "cesdk" },
  });
  if (scene) {
    await persistAsset({
      runId: id,
      kind: "editor_scene",
      bytes: await fileToBytes(scene),
      mime: "application/json",
    });
  }

  log.info("edited-video saved", { run: id, withScene: scene !== null });
  return c.json(await loadRunDetail(id), 201);
});

// ── GET /runs/:id/audio-track — ensure a standalone audio asset exists ────
// The CE.SDK editor can't detach a video's baked-in audio, so to show audio as
// its own timeline lane we extract it (ffmpeg, `-vn`) into a separate
// `final_audio` asset. Lazy + idempotent: the editor calls this on a fresh open
// — if the asset already exists we return its URL, otherwise we extract it from
// `final_video` once and persist it. Safe on completed runs (the worker never
// touches them), so no locking is needed.
runs.get("/:id/audio-track", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["completed"], "Run is not completed.");

  const findAsset = (kind: AssetKind) =>
    db
      .select()
      .from(schema.assets)
      .where(and(eq(schema.assets.runId, id), eq(schema.assets.kind, kind)))
      .orderBy(desc(schema.assets.createdAt))
      .limit(1);

  // Already extracted (re-open or concurrent open) — return the existing one.
  const [existing] = await findAsset("final_audio");
  if (existing?.url) return c.json({ url: existing.url });

  const [video] = await findAsset("final_video");
  if (!video?.url) throw unprocessable("This run has no final video to extract audio from.");

  const { bytes, mime } = await extractAudio(video.url);
  const { assetUrl } = await persistAsset({
    runId: id,
    kind: "final_audio",
    bytes,
    mime,
    meta: { source: "ffmpeg-extract" },
  });

  log.info("audio-track extracted", { run: id });
  return c.json({ url: assetUrl }, 201);
});

// ── POST /runs/:id/feedback — the SINGLE step-by-step gate action ─────
// One free-text submit decides everything: a BLANK message means "continue"
// (advance, no LLM call); a non-blank one is classified — approve → advance,
// revise → regenerate the gated artifact with the feedback threaded into the
// agent prompt. The product sheet is hidden, so a reference-gate revise always
// re-runs the person sheet and never the product.
runs.post("/:id/feedback", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_confirmation"], "Run is not awaiting confirmation.");

  const parsed = feedbackInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid feedback",
      parsed.error.issues,
    );
  }
  const message = parsed.data.message.trim();

  const step = run.currentStep ?? "product_sheet";
  const gate = gateForCurrentStep(step);
  if (!gate) throw badRequest("Run is not at a feedback gate.");

  // Blank submit = continue. Skip the LLM entirely.
  const intent: "approve" | "revise" = message
    ? (await interpretFeedback(getOpenAI(), { stage: gate, message })).intent
    : "approve";
  log.info("feedback", {
    run: id,
    gate,
    intent,
    next: intent === "approve" ? "running" : "regenerating",
    msg: message.slice(0, 60),
  });

  await db.transaction(async (tx) => {
    await tx.insert(schema.stepEvents).values({
      runId: id,
      step,
      status: intent === "approve" ? "passed" : "regenerated",
    });
    await tx
      .update(schema.runs)
      .set(
        intent === "approve"
          ? { status: "running", feedback: null, updatedAt: new Date() }
          : { status: "regenerating", feedback: message, updatedAt: new Date() },
      )
      .where(eq(schema.runs.id, id));
  });

  // The txn writes its step_event directly (not via writeStepEvent), so push
  // the new status to any open run stream explicitly.
  notifyRunChanged(id);

  return c.json(await loadRunDetail(id));
});

// ── POST /runs/:id/regenerate-video — re-render the clip(s) of a finished or
// soft-failed run, reusing the existing storyboard + reference sheets (no image
// re-gen). Deletes the target `videos` row(s) (their `assets` rows cascade) so
// the video step's idempotency guards no longer short-circuit, then flips the
// run back to `running` at the pre-video checkpoint; the worker re-picks it,
// the re-entrant fan-out regenerates only the deleted clip(s), and merge re-runs.
runs.post("/:id/regenerate-video", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(
    run,
    ["completed", "awaiting_regen"],
    "Run is not ready to regenerate.",
  );

  const parsed = regenerateVideoInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid regenerate request",
      parsed.error.issues,
    );
  }
  const { segmentIndex } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  const multi = isMultiSegment(run.duration);

  if (segmentIndex != null) {
    if (!multi) {
      throw badRequest("This run has no segments to regenerate individually.");
    }
    if (segmentIndex >= segmentCountFor(run.duration)) {
      throw badRequest(`segmentIndex ${segmentIndex} is out of range.`);
    }
  }

  // Which `videos` rows to drop:
  //  - a segment target → that segment clip + the merged final (so merge re-runs)
  //  - a 15s run        → the single final clip
  //  - a whole multi run → every clip (all segments + the merged final)
  const targetWhere =
    segmentIndex != null
      ? and(
          eq(schema.videos.runId, id),
          or(
            eq(schema.videos.segmentIndex, segmentIndex),
            isNull(schema.videos.segmentIndex),
          ),
        )
      : multi
        ? eq(schema.videos.runId, id)
        : and(eq(schema.videos.runId, id), isNull(schema.videos.segmentIndex));

  const targets = await db
    .select({ assetId: schema.videos.assetId })
    .from(schema.videos)
    .where(targetWhere);
  const assetIds = targets.map((t) => t.assetId);

  log.info("regenerate-video", {
    run: id,
    segmentIndex: segmentIndex ?? null,
    multi,
    clips: assetIds.length,
    note: note?.slice(0, 60),
  });

  await db.transaction(async (tx) => {
    // Deleting the `assets` rows cascades their `videos` rows (FK onDelete).
    if (assetIds.length) {
      await tx.delete(schema.assets).where(inArray(schema.assets.id, assetIds));
    }
    await tx
      .update(schema.runs)
      .set({
        status: "running",
        currentStep: resumeStepForVideoRegen(run.duration, run.pipeline),
        feedback: note,
        error: null,
        errorCode: null,
        // A template run re-renders after the new clip. A stale Nexrender job id
        // would make `applyTemplate` poll the OLD render and persist its output,
        // so the user would get a "regenerated" video containing the old clip.
        ...(run.pipeline === "template" ? { nexrenderJobId: null } : {}),
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, id));
  });

  notifyRunChanged(id);
  return c.json(await loadRunDetail(id));
});

// ── POST /runs/:id/regenerate-template — retry a failed template step.
//
// The template pipeline never gates mid-run (the template was validated at
// creation, and plan/fill/images/render are fully automatic), so a failure is a
// hard `failed` with no gate to fall back into. This route is the recovery path.
//
// The rewind checkpoint is chosen by WHICH step failed — see
// `rewindStepForTemplateRegen`. A single fixed checkpoint is wrong in both
// directions: rewind too far and the run re-pays gpt-image-2 for stills it
// already has; rewind too little and the composite renders with no copy and no
// images in it.
runs.post("/:id/regenerate-template", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  if (run.pipeline !== "template") {
    throw badRequest("This run does not use the template pipeline.");
  }
  assertStatus(run, ["failed"], "Run is not in a failed state.");

  const rewindTo = rewindStepForTemplateRegen(run.errorCode);
  if (rewindTo === undefined) {
    throw badRequest("This run's failure isn't a template step failure.");
  }

  log.info("regenerate-template", {
    run: id,
    errorCode: run.errorCode,
    rewindTo: rewindTo ?? "(start)",
  });

  // A stale Nexrender job id would make `applyTemplate` poll the OLD render and
  // persist ITS output instead of submitting a fresh one. Always clear it.
  //
  // The previous composite (a `videos` row with a null segmentIndex, whose
  // `assets` row cascades) is dropped too — otherwise a retry that succeeds
  // leaves two `templated_video` rows and the run view picks whichever is newest
  // by luck.
  await db
    .delete(schema.videos)
    .where(
      and(
        eq(schema.videos.runId, id),
        isNull(schema.videos.segmentIndex),
        sql`${schema.videos.providerMeta} ->> 'provider' = 'nexrender'`,
      ),
    );

  await db
    .update(schema.runs)
    .set({
      status: "running",
      currentStep: rewindTo,
      error: null,
      errorCode: null,
      nexrenderJobId: null,
      // A failed plan is re-planned from scratch; a stale one would be skipped
      // by `template_plan`'s idempotency guard.
      ...(rewindTo === null ? { templatePlan: null } : {}),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.runs.id, id));

  notifyRunChanged(id);
  return c.json(await loadRunDetail(id));
});

// ── POST /runs/:id/cancel — terminate a run (idempotent) ──────────────
runs.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);

  // Idempotent: already-terminal runs return their current state unchanged.
  if (run.status !== "completed" && run.status !== "failed") {
    log.info("cancel →failed", { run: id, from: run.status });
    // Close out any IN-FLIGHT step (latest event `started`, no terminal) so the
    // timeline shows it stopped rather than running forever. Steps that already
    // `passed` (e.g. a completed storyboard) are left untouched, so their status
    // + artifact survive the cancel — the frontend derives per-step status from
    // these events, not from the run-level `failed` status.
    await closeInFlightStepsOnCancel(id);
    await db
      .update(schema.runs)
      .set({
        status: "failed",
        error: "Run cancelled.",
        errorCode: "RUN_CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, id));
    // Push the terminal status to any open run stream (and the sidebar).
    notifyRunChanged(id);
  }

  return c.json(await loadRunDetail(id));
});

// ── DELETE /runs/:id — permanently remove a run and everything it owns ──
// Wipes the run's stored files (uploads, sheets, final video) and the run
// row; the FK `onDelete: cascade` removes its assets, step_events, and the
// product/person/storyboard/video artifact rows. Storage cleanup runs first
// and is best-effort — if it fails we still delete the DB rows so the chat
// disappears (a stray storage object is harmless vs. an undeletable chat).
runs.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await getRunOr404(id); // 404 if it doesn't exist

  try {
    await deleteRunObjects(id);
  } catch (err) {
    log.error("storage cleanup failed", {
      run: id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await db.delete(schema.runs).where(eq(schema.runs.id, id));
  // Drop it from any open sidebar list stream.
  notifyListChanged();
  return c.json({ ok: true, id });
});
