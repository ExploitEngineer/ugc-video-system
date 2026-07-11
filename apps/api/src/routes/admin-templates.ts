// Admin template-library routes. Mounted at `/admin/templates` behind
// `adminAuth` (an `x-admin-key` shared secret — a soft guard, NOT real auth;
// see lib/admin-auth.ts).
//
// The upload path: browser → here → Nexrender's presigned target. The project
// streams through this process to a temp file and NEVER touches Supabase, and
// never the heap: a Collect Files archive is hundreds of megabytes.

import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import {
  MAX_PREVIEW_BYTES,
  MAX_TEMPLATE_BYTES,
  formatBytes,
  templateUpdateInputSchema,
} from "@ugc/shared";

import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  introspectTemplate,
  listAllTemplates,
  reintrospectTemplate,
  templateTypeFromName,
  updateTemplate,
} from "../agents/template/library.js";
import {
  previewTemplate,
  regeneratePreview,
  setPreviewOverride,
} from "../agents/template/preview.js";
import {
  badRequest,
  notFound,
  payloadTooLarge,
  unprocessable,
} from "../lib/errors.js";
import { createLogger } from "../lib/log.js";
import { toTemplateAdminDto } from "../lib/template-mappers.js";
import { spoolToTempFile } from "../lib/upload-spool.js";

const log = createLogger("admin-templates");

/** Headroom over the preview-clip limit, for its multipart envelope. */
const MAX_PREVIEW_BODY_BYTES = MAX_PREVIEW_BYTES + 5 * 1024 * 1024;

const bodyTooLarge = (c: Context) =>
  c.json({ error: "Upload too large.", code: "PAYLOAD_TOO_LARGE" }, 413);

/**
 * A body the client malformed is a 400, not a 500. `parseBody`/`json` throw on
 * a truncated multipart envelope or invalid JSON, and an unhandled throw both
 * hides the reason from the caller and logs as if the server were at fault.
 */
async function parse<T>(read: () => Promise<T>, what: string): Promise<T> {
  try {
    return await read();
  } catch {
    throw badRequest(`Could not read the ${what}.`);
  }
}

/**
 * The template's metadata rides in the query string because its BODY is the raw
 * project. Multipart would force Hono to buffer the whole archive to parse it.
 */
const uploadQuerySchema = z.object({
  filename: z.string().min(1).max(255),
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.string().max(500).optional(),
});

export const adminTemplates = new Hono();

/**
 * POST /admin/templates — upload + register a template.
 *
 * The body is the project itself (`application/octet-stream`), streamed to a
 * temp file. Deduped by sha256, which the spool computes on the way past: a
 * byte-identical re-upload returns the existing row, registers nothing, and
 * costs nothing. Responds 200 on a dedupe hit, 201 on a fresh registration.
 */
adminTemplates.post("/", async (c) => {
  const parsed = uploadQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw badRequest("Invalid upload metadata.", parsed.error.issues);
  }
  const { filename } = parsed.data;

  if (!templateTypeFromName(filename)) {
    throw unprocessable(
      "Template must be a .aep or .zip file. (.mogrt is not supported: its Essential Graphics fields cannot be filled by layer name.)",
    );
  }

  // The browser states the size up front so an over-sized upload is refused
  // before a single byte is read. Never trusted — the spool counts for real.
  const declared = Number(
    c.req.header("x-template-bytes") ?? c.req.header("content-length") ?? 0,
  );
  if (Number.isFinite(declared) && declared > MAX_TEMPLATE_BYTES) {
    throw payloadTooLarge(
      `Template is ${formatBytes(declared)}. The limit is ${formatBytes(MAX_TEMPLATE_BYTES)}.`,
    );
  }

  const body = c.req.raw.body;
  if (!body) throw unprocessable("A .aep or .zip template file is required.");

  const spooled = await spoolToTempFile(body, {
    maxBytes: MAX_TEMPLATE_BYTES,
    suffix: filename.toLowerCase().endsWith(".zip") ? ".zip" : ".aep",
    label: "Template",
  });

  // Gigabyte orphans otherwise. Covers the dedupe hit and the registration
  // failure too, both of which return normally.
  try {
    if (spooled.size === 0) {
      throw unprocessable("A .aep or .zip template file is required.");
    }

    const tags = parsed.data.tags
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const { row, deduped } = await createTemplate({
      filename,
      displayName:
        parsed.data.displayName || filename.replace(/\.(aep|zip)$/i, ""),
      description: parsed.data.description || undefined,
      tags: tags?.length ? tags : undefined,
      path: spooled.path,
      size: spooled.size,
      contentHash: spooled.sha256,
    });

    log.info("admin upload", {
      id: row.id,
      deduped,
      status: row.status,
      bytes: spooled.size,
    });
    return c.json(toTemplateAdminDto(row), deduped ? 200 : 201);
  } finally {
    await spooled.cleanup();
  }
});

/** GET /admin/templates — every row, any status, newest first. */
adminTemplates.get("/", async (c) => {
  const rows = await listAllTemplates();
  return c.json(rows.map(toTemplateAdminDto));
});

/** GET /admin/templates/:id */
adminTemplates.get("/:id", async (c) => {
  const row = await getTemplate(c.req.param("id"));
  if (!row) throw notFound("Template not found.");
  return c.json(toTemplateAdminDto(row));
});

/**
 * POST /admin/templates/:id/introspect — poll Nexrender's parse once.
 *
 * Idempotent and cheap. Nexrender introspects asynchronously and offers no
 * webhook, so the admin console calls this on a timer while the row sits in
 * `introspecting`. The preview worker will drive the same function.
 */
adminTemplates.post("/:id/introspect", async (c) => {
  const row = await introspectTemplate(c.req.param("id"));
  return c.json(toTemplateAdminDto(row));
});

/**
 * POST /admin/templates/:id/reintrospect — re-read the project's structure.
 *
 * For when OUR classifier improves, not the template. GETs against Nexrender
 * only: no upload, no render, no cost. Keeps the existing preview.
 */
adminTemplates.post("/:id/reintrospect", async (c) => {
  const row = await reintrospectTemplate(c.req.param("id"));
  return c.json(toTemplateAdminDto(row));
});

/**
 * POST /admin/templates/:id/preview — advance the preview render by one step.
 *
 * Same shape as `/introspect`: idempotent, polls once, safe on a timer. It
 * submits the render on the first call and polls it thereafter.
 */
adminTemplates.post("/:id/preview", async (c) => {
  const existing = await getTemplate(c.req.param("id"));
  if (!existing) throw notFound("Template not found.");
  const row = await previewTemplate(existing.id);
  return c.json(toTemplateAdminDto(row));
});

/**
 * PUT /admin/templates/:id/preview — replace the preview with an admin's clip.
 *
 * The escape hatch for a template whose own placeholder content is grey boxes
 * and Lorem Ipsum: the auto-render is faithful but ugly, so let the admin drop
 * in the designer's demo video instead. Skips Nexrender entirely.
 */
adminTemplates.put(
  "/:id/preview",
  bodyLimit({ maxSize: MAX_PREVIEW_BODY_BYTES, onError: bodyTooLarge }),
  async (c) => {
    const existing = await getTemplate(c.req.param("id"));
    if (!existing) throw notFound("Template not found.");

    const body = await parse(() => c.req.parseBody(), "upload");
    const file = body.file;
    if (!(file instanceof File) || file.size === 0) {
      throw unprocessable("A preview video file is required.");
    }
    if (!/^video\/(mp4|quicktime|webm)$/.test(file.type)) {
      throw unprocessable("Preview must be an mp4, mov or webm video.");
    }
    if (file.size > MAX_PREVIEW_BYTES) {
      throw payloadTooLarge(
        `Preview is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_PREVIEW_BYTES)}.`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const row = await setPreviewOverride(existing.id, bytes, file.type);
    return c.json(toTemplateAdminDto(row));
  },
);

/**
 * DELETE /admin/templates/:id/preview — throw the preview away and re-render it.
 * Clears the persisted job id so a fresh job is submitted rather than the dead
 * one being polled.
 */
adminTemplates.delete("/:id/preview", async (c) => {
  const existing = await getTemplate(c.req.param("id"));
  if (!existing) throw notFound("Template not found.");
  const row = await regeneratePreview(existing.id);
  return c.json(toTemplateAdminDto(row));
});

/** PATCH /admin/templates/:id — display name, description, tags. */
adminTemplates.patch("/:id", async (c) => {
  const json = await parse(() => c.req.json(), "request body");
  const parsed = templateUpdateInputSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(issue?.message ?? "Invalid template update.", parsed.error.issues);
  }
  const existing = await getTemplate(c.req.param("id"));
  if (!existing) throw notFound("Template not found.");

  const row = await updateTemplate(existing.id, parsed.data);
  if (!row) throw notFound("Template not found.");
  return c.json(toTemplateAdminDto(row));
});

/**
 * DELETE /admin/templates/:id — soft archive.
 *
 * Never a hard delete: runs made with this template keep their immutable
 * snapshot, and `runs.template_id` is ON DELETE SET NULL, so archiving can
 * never take finished ads down with it. Archiving also frees the content hash,
 * so the same file can be re-uploaded later.
 */
adminTemplates.delete("/:id", async (c) => {
  const existing = await getTemplate(c.req.param("id"));
  if (!existing) throw notFound("Template not found.");
  await archiveTemplate(existing.id);
  return c.body(null, 204);
});
