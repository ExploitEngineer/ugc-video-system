// /runs routes — create, poll, artifacts, and feedback/cancel gating.
//
// Responses always go through the mappers (lib/mappers.ts) so the frontend
// only ever sees the @ugc/shared DTO shapes. The confirm-mode gate has a SINGLE
// action: `POST /feedback` (free text; blank = continue), legal only from
// `awaiting_confirmation`. Cancel works from any non-terminal status.

import type { AssetKind } from "@ugc/shared";
import {
  createRunInputSchema,
  feedbackInputSchema,
  isMultiSegment,
} from "@ugc/shared";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import {
  gateForCurrentStep,
  getOpenAI,
  interpretFeedback,
} from "../agents/creative-direction/index.js";
import { persistAsset } from "../agents/persist.js";
import { db, schema } from "../db/index.js";
import { badRequest, unprocessable } from "../lib/errors.js";
import { normalizePersonImage } from "../lib/image/normalize.js";
import { createLogger } from "../lib/log.js";
import { toAssetDto, toRunDto } from "../lib/mappers.js";
import { assertStatus, getRunOr404, loadRunDetail } from "../lib/runs.js";
import { deleteRunObjects, uploadAsset } from "../lib/storage.js";

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_VIDEO_MIME = ["video/mp4"];
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB — headroom for a ~60s 1080p client-side MP4 export

const log = createLogger("runs");

export const runs = new Hono();

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

// ── POST /runs — create a run from multipart form data ────────────────
runs.post("/", async (c) => {
  const body = await c.req.parseBody();

  const productImage = validateImage(body.productImage, "productImage", true);
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
  });
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid input",
      parsed.error.issues,
    );
  }
  const { prompt, mode, aspectRatio, duration, criticEnabled } = parsed.data;

  // Normalize the person photo BEFORE any DB inserts (a 422 here must not
  // leave an orphaned run): pad/clamp it into BytePlus's CreateAsset limits
  // (aspect 0.4–2.5, height 300–6000) so the stored `person_upload` is always
  // usable as a face asset. The product image is left untouched — it never
  // reaches CreateAsset, and padding bars would leak into generated stills.
  const uploads: { kind: AssetKind; bytes: Uint8Array; mime: string }[] = [
    {
      kind: "product_upload",
      bytes: await fileToBytes(productImage as File),
      mime: (productImage as File).type,
    },
  ];
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

  return c.json(await loadRunDetail(run.id), 201);
});

// ── GET /runs — list all runs, newest first (sidebar history) ─────────
runs.get("/", async (c) => {
  const rows = await db
    .select()
    .from(schema.runs)
    .orderBy(desc(schema.runs.createdAt));
  return c.json(rows.map(toRunDto));
});

// ── GET /runs/:id — poll status + artifacts + audit trail ─────────────
runs.get("/:id", async (c) => {
  return c.json(await loadRunDetail(c.req.param("id")));
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
runs.post("/:id/edited-video", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["completed"], "Run is not completed.");

  const body = await c.req.parseBody();
  const video = validateVideo(body.video, "video");
  const sceneValue = body.scene;
  const scene =
    sceneValue instanceof File && sceneValue.size > 0 ? sceneValue : null;

  await persistAsset({
    runId: id,
    kind: "edited_video",
    bytes: await fileToBytes(video),
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

  return c.json(await loadRunDetail(id));
});

// ── POST /runs/:id/cancel — terminate a run (idempotent) ──────────────
runs.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);

  // Idempotent: already-terminal runs return their current state unchanged.
  if (run.status !== "completed" && run.status !== "failed") {
    log.info("cancel →failed", { run: id, from: run.status });
    await db
      .update(schema.runs)
      .set({
        status: "failed",
        error: "Run cancelled.",
        errorCode: "RUN_CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(schema.runs.id, id));
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
  return c.json({ ok: true, id });
});
