// Public template-library routes — what the picker reads.
//
// End users no longer upload templates: an ADMIN curates the library (see
// `routes/admin-templates.ts`). The v1 `POST /templates/register` and
// `GET /templates/:id/structure` endpoints are gone along with that flow, and
// the cost-safety guarantee moved with them: `POST /runs` now resolves the
// template from OUR `templates` table, so a bad file can never reach a run at
// all — it fails at admin upload, before any user ever sees it.
//
// Nothing here exposes `nexrenderTemplateId`, storage paths, or the raw
// introspected structure — see `toTemplateSummaryDto`.

import { Hono } from "hono";
import { z } from "zod";

import { getTemplate, listPublicTemplates } from "../agents/template/library.js";
import { notFound } from "../lib/errors.js";
import { toTemplateSummaryDto } from "../lib/template-mappers.js";

export const templates = new Hono();

const sortSchema = z.enum(["popular", "newest", "name"]).catch("popular");

/** GET /templates?sort= — ready, unarchived templates for the picker. */
templates.get("/", async (c) => {
  const sort = sortSchema.parse(c.req.query("sort"));
  const rows = await listPublicTemplates(sort);
  return c.json(rows.map(toTemplateSummaryDto));
});

/** GET /templates/:id — one template, only while it is pickable. */
templates.get("/:id", async (c) => {
  const row = await getTemplate(c.req.param("id"));
  if (!row || row.status !== "ready" || row.archivedAt) {
    throw notFound("Template not found.");
  }
  return c.json(toTemplateSummaryDto(row));
});
