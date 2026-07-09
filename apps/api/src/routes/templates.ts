// Run-independent template registration + introspection routes.
//
// The user uploads a template BEFORE any run exists — this is the cost-safety
// point the template pipeline redesign hinges on: a bad/incompatible template
// file fails fast here, at near-zero cost, instead of after a full AI
// generation. `POST /runs` (routes/runs.ts) re-fetches the structure fresh at
// run-creation time rather than trusting whatever the client polled here — the
// server is always the source of truth for what actually renders.

import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { buildStructure } from "../agents/template/introspect.js";
import { createTemplateRenderProvider } from "../providers/index.js";
import { unprocessable } from "../lib/errors.js";
import { createLogger } from "../lib/log.js";

const log = createLogger("templates");

// User-uploaded After Effects template (.aep) or packaged .aep+assets (.zip).
const MAX_TEMPLATE_BYTES = 200 * 1024 * 1024; // 200MB — AE project + linked assets
const MAX_TEMPLATE_BODY_BYTES = 210 * 1024 * 1024; // headroom over the file limit
const bodyTooLarge = (c: Context) =>
  c.json({ error: "Upload too large.", code: "PAYLOAD_TOO_LARGE" }, 413);

/** Map a filename extension → the Nexrender project type (null if unsupported). */
function templateTypeFromName(
  filename: string,
): "aep" | "zip" | "mogrt" | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".mogrt")) return "mogrt";
  if (name.endsWith(".aep")) return "aep";
  return null;
}

async function fileToBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** The `{status:"processing"|"failed", ...}` shape while Nexrender hasn't finished. */
function pendingStructure(status: "processing" | "failed", error?: string) {
  return {
    status,
    mainComposition: null,
    renderCompositions: [],
    slots: [],
    mainCompositionWidth: null,
    mainCompositionHeight: null,
    suggestedAspectRatio: null,
    ...(error ? { error } : {}),
  };
}

export const templates = new Hono();

// POST /templates/register — register + upload a template project with
// Nexrender. No run required: this is the FIRST action of the template
// pipeline, before the ad brief is even filled in.
templates.post(
  "/register",
  bodyLimit({ maxSize: MAX_TEMPLATE_BODY_BYTES, onError: bodyTooLarge }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || file.size === 0) {
      throw unprocessable("A .aep, .zip or .mogrt template file is required.");
    }
    const type = templateTypeFromName(file.name);
    if (!type) {
      throw unprocessable("Template must be a .aep, .zip or .mogrt file.");
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      throw unprocessable(
        `Template exceeds the ${MAX_TEMPLATE_BYTES / (1024 * 1024)}MB limit.`,
      );
    }
    const provider = createTemplateRenderProvider();
    const { templateId, upload } = await provider.registerTemplate({
      filename: file.name,
      displayName: file.name,
      type,
    });
    // Upload the project bytes to Nexrender's presigned target (server-side,
    // documented raw PUT). Bytes stream through here and NEVER land on Supabase.
    if (upload) {
      const bytes = await fileToBytes(file);
      await provider.uploadTemplateBytes(upload, bytes);
    }
    log.info("register", { type, templateId });
    return c.json({ nexrenderTemplateId: templateId });
  },
);

// GET /templates/:nexrenderTemplateId/structure — polled while Nexrender
// introspects. `status` is `processing` until it finishes, then `ready` with
// the classified slots + derived aspect ratio the brief form uses.
templates.get("/:nexrenderTemplateId/structure", async (c) => {
  const templateId = c.req.param("nexrenderTemplateId");
  const provider = createTemplateRenderProvider();
  try {
    const raw = await provider.getTemplateStructure(templateId);
    if (raw.status === "uploaded") {
      return c.json(buildStructure(raw.compositions, raw.layers));
    }
    // Nexrender download/parse failed → surface as failed (don't poll forever).
    if (raw.status === "error" || raw.status === "failed") {
      return c.json(
        pendingStructure(
          "failed",
          "Nexrender couldn’t download or parse this template.",
        ),
      );
    }
    // awaiting_upload / downloading / processing → keep polling.
    return c.json(pendingStructure("processing"));
  } catch (err) {
    log.warn("structure failed", {
      templateId,
      err: err instanceof Error ? err.message : String(err),
    });
    return c.json(
      pendingStructure("failed", "Couldn't read the template structure. Try again."),
    );
  }
});
