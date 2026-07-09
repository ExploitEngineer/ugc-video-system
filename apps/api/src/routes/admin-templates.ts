// Admin template-library routes. Mounted at `/admin/templates` behind
// `adminAuth` (an `x-admin-key` shared secret — a soft guard, NOT real auth;
// see lib/admin-auth.ts).
//
// The upload path: browser → here → Nexrender's presigned target. The project
// bytes stream through this process and NEVER touch Supabase.

import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { templateUpdateInputSchema } from "@ugc/shared";

import {
  archiveTemplate,
  createTemplate,
  getTemplate,
  introspectTemplate,
  listAllTemplates,
  templateTypeFromName,
  updateTemplate,
} from "../agents/template/library.js";
import { badRequest, notFound, unprocessable } from "../lib/errors.js";
import { createLogger } from "../lib/log.js";
import { toTemplateAdminDto } from "../lib/template-mappers.js";

const log = createLogger("admin-templates");

/** An AE project plus its collected footage. */
const MAX_TEMPLATE_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_TEMPLATE_BODY_BYTES = 210 * 1024 * 1024; // headroom over the file limit

const bodyTooLarge = (c: Context) =>
  c.json({ error: "Upload too large.", code: "PAYLOAD_TOO_LARGE" }, 413);

export const adminTemplates = new Hono();

/**
 * POST /admin/templates — upload + register a template.
 *
 * Deduped by sha256: a byte-identical re-upload returns the existing row and
 * costs nothing. Responds 200 on a dedupe hit, 201 on a fresh registration.
 */
adminTemplates.post(
  "/",
  bodyLimit({ maxSize: MAX_TEMPLATE_BODY_BYTES, onError: bodyTooLarge }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || file.size === 0) {
      throw unprocessable("A .aep or .zip template file is required.");
    }
    if (!templateTypeFromName(file.name)) {
      throw unprocessable(
        "Template must be a .aep or .zip file. (.mogrt is not supported: its Essential Graphics fields cannot be filled by layer name.)",
      );
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      throw unprocessable(
        `Template exceeds the ${MAX_TEMPLATE_BYTES / (1024 * 1024)}MB limit.`,
      );
    }

    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : file.name.replace(/\.(aep|zip)$/i, "");
    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : undefined;
    const tags =
      typeof body.tags === "string" && body.tags.trim()
        ? body.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { row, deduped } = await createTemplate({
      filename: file.name,
      displayName,
      description,
      tags,
      bytes,
    });

    log.info("admin upload", { id: row.id, deduped, status: row.status });
    return c.json(toTemplateAdminDto(row), deduped ? 200 : 201);
  },
);

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

/** PATCH /admin/templates/:id — display name, description, tags. */
adminTemplates.patch("/:id", async (c) => {
  const parsed = templateUpdateInputSchema.safeParse(await c.req.json());
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
