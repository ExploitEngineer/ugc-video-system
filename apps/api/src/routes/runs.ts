// /runs routes — create, poll, artifacts, and confirm/reject/cancel gating.
//
// Responses always go through the mappers (lib/mappers.ts) so the frontend
// only ever sees the @ugc/shared DTO shapes. No worker exists until F7, so
// a created run sits at `queued`; confirm/reject are only legal from
// `awaiting_confirmation` (→ 409 until F7 sets that status). Cancel works
// from any non-terminal status.

import type { AssetKind } from "@ugc/shared";
import { createRunInputSchema } from "@ugc/shared";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/index.js";
import { badRequest, unprocessable } from "../lib/errors.js";
import { toAssetDto, toRunDto } from "../lib/mappers.js";
import { assertStatus, getRunOr404, loadRunDetail } from "../lib/runs.js";
import { uploadAsset } from "../lib/storage.js";

const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

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
    // FormData carries strings; default ON unless explicitly "false".
    criticEnabled: body.criticEnabled !== "false",
    hasPersonImage: personImage !== null,
  });
  if (!parsed.success) {
    throw badRequest(
      parsed.error.issues[0]?.message ?? "Invalid input",
      parsed.error.issues,
    );
  }
  const { prompt, mode, criticEnabled } = parsed.data;

  // `runs.projectId` is NOT NULL → auto-create a project to own this run.
  const [project] = await db
    .insert(schema.projects)
    .values({ title: prompt.slice(0, 80) })
    .returning();

  const [run] = await db
    .insert(schema.runs)
    .values({ projectId: project.id, prompt, mode, criticEnabled, status: "queued" })
    .returning();

  // Upload images, then record them as `assets`. Uploads are external to
  // the DB; on failure the queued run simply has no assets (recoverable).
  const uploads: { kind: AssetKind; file: File }[] = [
    { kind: "product_upload", file: productImage as File },
  ];
  if (personImage) uploads.push({ kind: "person_upload", file: personImage });

  try {
    for (const { kind, file } of uploads) {
      const { storagePath, url } = await uploadAsset({
        runId: run.id,
        kind,
        bytes: await fileToBytes(file),
        contentType: file.type,
      });
      await db.insert(schema.assets).values({
        runId: run.id,
        kind,
        storagePath,
        url,
        mime: file.type,
      });
    }
  } catch (err) {
    // Don't leave a queued run with no product_upload for the worker to claim.
    await db
      .update(schema.runs)
      .set({ status: "failed", error: "Image upload failed.", updatedAt: new Date() })
      .where(eq(schema.runs.id, run.id));
    throw err;
  }

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
  await getRunOr404(id); // 404 if the run doesn't exist

  const assetRows = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, id));

  const byKind = (kind: AssetKind) => {
    const row = assetRows.find((a) => a.kind === kind);
    return row ? toAssetDto(row) : null;
  };

  const videoRow = await db.query.videos.findFirst({
    where: eq(schema.videos.runId, id),
  });

  return c.json({
    runId: id,
    productSheet: byKind("product_sheet"),
    personSheet: byKind("person_sheet"),
    storyboardSheet: byKind("storyboard_sheet"),
    finalVideo: byKind("final_video"),
    // `duration_sec` is `numeric` → Drizzle returns a string; coerce.
    video: videoRow
      ? {
          durationSec:
            videoRow.durationSec == null ? null : Number(videoRow.durationSec),
          hasAudio: videoRow.hasAudio,
        }
      : null,
  });
});

// ── POST /runs/:id/confirm — advance a gated run (confirm mode) ───────
runs.post("/:id/confirm", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_confirmation"], "Run is not awaiting confirmation.");

  await db.transaction(async (tx) => {
    await tx.insert(schema.stepEvents).values({
      runId: id,
      step: run.currentStep ?? "product_sheet",
      status: "passed",
    });
    await tx
      .update(schema.runs)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(schema.runs.id, id));
  });

  return c.json(await loadRunDetail(id));
});

// ── POST /runs/:id/reject — regenerate a gated step (confirm mode) ────
runs.post("/:id/reject", async (c) => {
  const id = c.req.param("id");
  const run = await getRunOr404(id);
  assertStatus(run, ["awaiting_confirmation"], "Run is not awaiting confirmation.");

  await db.transaction(async (tx) => {
    await tx.insert(schema.stepEvents).values({
      runId: id,
      step: run.currentStep ?? "product_sheet",
      status: "regenerated",
    });
    await tx
      .update(schema.runs)
      .set({ status: "regenerating", updatedAt: new Date() })
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
    await db
      .update(schema.runs)
      .set({ status: "failed", error: "Run cancelled.", updatedAt: new Date() })
      .where(eq(schema.runs.id, id));
  }

  return c.json(await loadRunDetail(id));
});
