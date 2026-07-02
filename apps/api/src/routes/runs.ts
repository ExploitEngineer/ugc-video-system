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
  plainlyEditSchema,
} from "@ugc/shared";
import type { PlainlyEdit, Run, RunDetail } from "@ugc/shared";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import sharp from "sharp";
import { z } from "zod";
import {
  gateForCurrentStep,
  getOpenAI,
  interpretFeedback,
} from "../agents/creative-direction/index.js";
import { getAdType } from "../agents/ad-types/registry.js";
import { closeInFlightStepsOnCancel } from "../agents/events.js";
import { segmentVideos } from "../agents/creative-direction/inputs.js";
import { persistAsset, persistSheet } from "../agents/persist.js";
import {
  createPlainlyProvider,
  designVariantDuration,
  isPlainlyConfigured,
  normalizeRenderParameters,
  type PlainlyTemplateParam,
} from "../providers/plainly/index.js";
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
import {
  deleteRunObjects,
  uploadAsset,
  uploadTransient,
} from "../lib/storage.js";
import { extractAudio, muteVideo, replaceAudioWithMusic } from "../lib/video/merge.js";

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
      criticEnabled: schema.runs.criticEnabled,
      characterEnabled: schema.runs.characterEnabled,
      plainlyEnabled: schema.runs.plainlyEnabled,
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
    // Plainly interactive pre-merge stage toggle (multipart string).
    ...(body.plainlyEnabled !== undefined
      ? { plainlyEnabled: body.plainlyEnabled === "true" }
      : {}),
  });
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid input",
      parsed.error.issues,
    );
  }
  const { prompt, mode, aspectRatio, duration, criticEnabled, adType, brandText } =
    parsed.data;
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

  // Plainly stage: honored ONLY for multi-segment runs (the ones that merge) and
  // only when the server has a Plainly key — otherwise forced off so the run
  // proceeds straight to the ffmpeg merge as before.
  const plainlyEnabled =
    Boolean(parsed.data.plainlyEnabled) &&
    isMultiSegment(duration) &&
    isPlainlyConfigured();

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
      criticEnabled,
      characterEnabled,
      plainlyEnabled,
      ...(brandText ? { brandText } : {}),
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

// ── Plainly interactive pre-merge stage ───────────────────────────────────
// While a run is paused at `awaiting_edit`, these routes drive Plainly renders
// on demand: discover a template's params, submit a render, poll it (the browser
// polls — the worker is NOT involved), then accept (re-host as the final video)
// or skip (fall back to the ffmpeg merge). See apps/api/docs/plainly-integration.md.

const plainlyRenderInputSchema = z.object({
  projectId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  parameters: z.record(z.string(), z.string()).default({}),
  // When true, the clip's audio (the Seedance voice) is stripped before the
  // render, so the output carries only the template's own audio.
  muteClipAudio: z.boolean().optional().default(false),
});

// Per-clip accept: a finished render becomes the branded replacement for ONE
// segment (not the final video). Carries the template + params so we can record
// what was applied to that segment.
const plainlyClipAcceptInputSchema = z.object({
  renderId: z.string().trim().min(1),
  segmentIndex: z.number().int().min(0),
  projectId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  parameters: z.record(z.string(), z.string()).default({}),
  // Recorded on the segment edit so re-branding restores the toggle (the render
  // already baked the mute — accept does NOT re-mute).
  muteClipAudio: z.boolean().optional().default(false),
});

/** The clip-slot param name (the MEDIA/video layer the run's clip fills). */
function clipVideoParamName(
  params: PlainlyTemplateParam[],
): string | undefined {
  return params.find(
    (p) =>
      (p.layerType ?? "").toUpperCase() === "MEDIA" &&
      (p.mediaType ?? "").toLowerCase() === "video",
  )?.name;
}

/** The music-slot param name (the MEDIA/audio layer, e.g. `newsMusic`). */
function clipAudioParamName(
  params: PlainlyTemplateParam[],
): string | undefined {
  return params.find(
    (p) =>
      (p.layerType ?? "").toUpperCase() === "MEDIA" &&
      (p.mediaType ?? "").toLowerCase() === "audio",
  )?.name;
}

/** Read a run's `plainly_edit` jsonb as a typed object (or a fresh empty one). */
function readPlainlyEdit(run: typeof schema.runs.$inferSelect): PlainlyEdit {
  return (
    plainlyEditSchema.safeParse(run.plainlyEdit).data ??
    plainlyEditSchema.parse({})
  );
}

/** Guard: the Plainly feature must be configured server-side. */
function assertPlainlyReady(): void {
  if (!isPlainlyConfigured()) {
    throw unprocessable(
      "Plainly is not configured on the server (set PLAINLY_API_KEY).",
    );
  }
}

// GET /runs/:id/plainly/templates?projectId&templateId — discover a template's
// parameter names/types (+ this run's clip URLs to fill the media params). Falls
// back to the configured default template when the query omits ids.
runs.get("/:id/plainly/templates", async (c) => {
  const id = c.req.param("id");
  await getRunOr404(id);
  assertPlainlyReady();
  const projectId =
    c.req.query("projectId") ?? env.PLAINLY_DEFAULT_PROJECT_ID ?? "";
  const templateId =
    c.req.query("templateId") ?? env.PLAINLY_DEFAULT_TEMPLATE_ID ?? "";
  // The run's clips (newest-per-segment), so the UI can map one to the `image`
  // slot. Branded state is derived client-side from each asset's `meta.plainly`.
  const clips = (await segmentVideos(id)).map((s) => ({
    segmentIndex: s.segmentIndex,
    url: s.assetUrl,
  }));
  if (!projectId || !templateId) {
    return c.json({
      projectId: projectId || null,
      templateId: templateId || null,
      params: [],
      clips,
    });
  }
  const tpl = await createPlainlyProvider().getTemplate(projectId, templateId);
  return c.json({ projectId, templateId, params: tpl.params, clips });
});

// POST /runs/:id/plainly/renders — submit a render with the params the UI
// assembled (clip URLs already mapped to the media params).
runs.post("/:id/plainly/renders", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_edit"], "Run is not awaiting a Plainly edit.");
  assertPlainlyReady();
  const parsed = plainlyRenderInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid render input",
      parsed.error.issues,
    );
  }
  const { projectId, templateId, parameters, muteClipAudio } = parsed.data;
  const provider = createPlainlyProvider();
  // Apply blank-value rules (clear DATA params with "", drop blank media slots)
  // using the template's param types so optional fields behave predictably.
  const tpl = await provider.getTemplate(projectId, templateId);

  // Original voice OFF → feed Plainly a muted copy of the clip, so the rendered
  // template has no Seedance voice (only its own audio). Plainly bakes audio at
  // render time, so the input must be muted; doing it on the output is impossible.
  const renderParams = { ...parameters };
  if (muteClipAudio) {
    const clipParam = clipVideoParamName(tpl.params);
    const clipUrl = clipParam ? renderParams[clipParam] : undefined;
    if (clipParam && clipUrl) {
      const { bytes, mime } = await muteVideo(clipUrl);
      const mutedUrl = await uploadTransient({
        runId: id,
        label: "plainly-mute",
        bytes,
        contentType: mime,
      });
      renderParams[clipParam] = mutedUrl;
      log.info("plainly clip muted for render", { run: id, clipParam });
    } else {
      log.warn("muteClipAudio set but no video clip param found — sending as-is", {
        run: id,
      });
    }
  }

  const cleaned = normalizeRenderParameters(tpl.params, renderParams);
  const render = await provider.submitRender({
    projectId,
    templateId,
    parameters: cleaned,
  });

  // Record the chosen template + params + this render attempt on plainly_edit.
  const edit = readPlainlyEdit(run);
  edit.projectId = projectId;
  edit.templateId = templateId;
  edit.params = parameters;
  edit.renders.push({ renderId: render.renderId, state: render.rawState });
  await db
    .update(schema.runs)
    .set({ plainlyEdit: edit, updatedAt: new Date() })
    .where(eq(schema.runs.id, id));
  notifyRunChanged(id);

  log.info("plainly render submitted", {
    run: id,
    renderId: render.renderId,
    state: render.rawState,
  });
  return c.json({ renderId: render.renderId, state: render.rawState }, 201);
});

// GET /runs/:id/plainly/renders/:renderId — poll one render (browser polls this).
// `previewUrl` is Plainly's TEMPORARY output URL — used only for in-session
// preview; only an ACCEPTED render is re-hosted permanently.
runs.get("/:id/plainly/renders/:renderId", async (c) => {
  const id = c.req.param("id");
  await getRunOr404(id);
  assertPlainlyReady();
  const renderId = c.req.param("renderId");
  const render = await createPlainlyProvider().pollRender(renderId);
  return c.json({
    state: render.state,
    rawState: render.rawState,
    previewUrl: render.output ?? null,
    error: render.error ?? null,
  });
});

// POST /runs/:id/plainly/clips/accept — adopt a finished render as the branded
// replacement for ONE segment clip. Re-hosts it as a `segment_video` with the
// SAME segmentIndex (+ a newer createdAt), so `segmentVideos()` (newest-per-index)
// picks it for the final merge. The run STAYS `awaiting_edit` — the user can brand
// more clips, then `finalize` to merge. No completion here.
runs.post("/:id/plainly/clips/accept", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_edit"], "Run is not awaiting a Plainly edit.");
  assertPlainlyReady();
  const parsed = plainlyClipAcceptInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid accept input",
      parsed.error.issues,
    );
  }
  const { renderId, segmentIndex, projectId, templateId, parameters, muteClipAudio } =
    parsed.data;

  const provider = createPlainlyProvider();
  const render = await provider.pollRender(renderId);
  if (render.state !== "completed" || !render.output) {
    throw unprocessable(
      `Render ${renderId} is not finished (state: ${render.rawState}).`,
    );
  }

  // Music override: if the user supplied a music URL, the public designs still
  // bake their STOCK track (no param removes it), so we own the audio — strip the
  // render's baked audio and mux only the user's music. Best-effort: a bad URL
  // falls back to the untouched render so a typo can't lose a good render.
  const tpl = await provider.getTemplate(projectId, templateId);
  const musicParam = clipAudioParamName(tpl.params);
  const musicUrl = musicParam ? (parameters[musicParam] ?? "").trim() : "";
  let bytes: Uint8Array;
  let mime: string;
  if (musicUrl) {
    try {
      ({ bytes, mime } = await replaceAudioWithMusic(render.output, musicUrl));
      log.info("plainly render audio replaced with user music", { run: id });
    } catch (err) {
      log.warn("music override failed — using the raw render audio", {
        run: id,
        err: err instanceof Error ? err.message : String(err),
      });
      ({ bytes, mime } = await provider.downloadOutput(render.output));
    }
  } else {
    ({ bytes, mime } = await provider.downloadOutput(render.output));
  }
  const durationSec = designVariantDuration(projectId, templateId) ?? 15;

  const persisted = await persistSheet({
    runId: id,
    kind: "segment_video",
    bytes,
    mime: mime.startsWith("video/") ? mime : "video/mp4",
    // `meta` mirrors a raw segment clip (segmentIndex for ordering) + a `plainly`
    // flag so the UI can badge it Branded.
    meta: { segmentIndex, plainly: true, renderId },
    artifactInsert: async (tx, assetId) => {
      const [row] = await tx
        .insert(schema.videos)
        .values({
          runId: id,
          assetId,
          durationSec: String(durationSec),
          segmentIndex,
          hasAudio: true,
          providerMeta: {
            provider: "plainly",
            renderId,
            projectId,
            templateId,
            parameters,
          },
          status: "completed",
        })
        .returning();
      return row;
    },
  });

  // Record the per-clip branding on plainly_edit (stays awaiting_edit).
  const edit = readPlainlyEdit(run);
  edit.segments[String(segmentIndex)] = {
    segmentIndex,
    renderId,
    projectId,
    templateId,
    params: parameters,
    assetId: persisted.assetId,
    muteClipAudio,
  };
  await db
    .update(schema.runs)
    .set({ plainlyEdit: edit, updatedAt: new Date() })
    .where(eq(schema.runs.id, id));
  notifyRunChanged(id);

  log.info("plainly render accepted as branded segment", {
    run: id,
    renderId,
    segmentIndex,
  });
  return c.json(await loadRunDetail(id), 201);
});

// POST /runs/:id/plainly/finalize — done branding: run the ffmpeg merge over the
// newest-per-segment clips (branded where edited, raw otherwise). Same state
// transition as `skip` — the branded segment rows already exist, so the merge
// consumes them automatically.
runs.post("/:id/plainly/finalize", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_edit"], "Run is not awaiting a Plainly edit.");
  await db
    .update(schema.runs)
    .set({
      plainlyEnabled: false,
      status: "running",
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.runs.id, id));
  notifyRunChanged(id);
  log.info("plainly finalize — merging branded + raw clips", { run: id });
  return c.json(await loadRunDetail(id));
});

// POST /runs/:id/plainly/skip — abandon the Plainly stage and fall back to the
// ffmpeg merge: clear the toggle + flip to `running` so the worker advances
// segment_video → merge.
runs.post("/:id/plainly/skip", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_edit"], "Run is not awaiting a Plainly edit.");
  await db
    .update(schema.runs)
    .set({
      plainlyEnabled: false,
      status: "running",
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.runs.id, id));
  notifyRunChanged(id);
  log.info("plainly stage skipped — falling back to ffmpeg merge", { run: id });
  return c.json(await loadRunDetail(id));
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
