// Smoke-test the template pipeline's LLM-fill + render steps in-process,
// without the background worker.
//
//   npx tsx scripts/verify-template.ts <runId>
//
// The run must already have a `final_video` asset. Sets `pipeline: "template"`
// plus a STUB-compatible template snapshot directly on the run (no real
// Nexrender template upload needed — this exercises the fill/render logic,
// not the registration flow, which `POST /templates/register` already covers
// end to end via the studio UI). With no NEXRENDER_API_KEY (or
// NEXRENDER_STUB=true) the STUB renderer echoes the clip back, so this
// exercises fillTemplateText (a REAL LLM call) → applyTemplate (submitRender →
// pollRender → download → re-host → persist `templated_video`) against real
// Supabase Storage, no Nexrender credits spent.

import { eq } from "drizzle-orm";
import type { RunTemplate } from "@ugc/shared";
import { db, schema } from "../src/db/index.js";
import { applyTemplate } from "../src/agents/template/index.js";
import { fillTemplateText } from "../src/agents/template/fill-text/index.js";
import { createOpenAIProvider } from "../src/providers/openai/index.js";
import type { SkillContext } from "../src/agents/types.js";

const runId = process.argv[2];
if (!runId) {
  console.error("usage: tsx scripts/verify-template.ts <runId>");
  process.exit(1);
}

const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
if (!run) {
  console.error(`run ${runId} not found`);
  process.exit(1);
}

// A minimal template snapshot matching the stub Nexrender provider's canned
// structure (one video slot + one text slot) — normally resolved server-side
// at run creation (`POST /runs`), set here directly for the smoke test.
const template: RunTemplate = {
  nexrenderTemplateId: "stub-template",
  mainComposition: "main",
  renderCompositions: ["main"],
  slots: [
    {
      asset: "VIDEO",
      composition: "main",
      layerName: "MAIN_CLIP",
      jobLayerName: "MAIN_CLIP",
      injectVia: "asset",
    },
    {
      asset: "TEXT",
      composition: "main",
      layerName: "Headline",
      jobLayerName: "Headline",
      currentText: "Your Headline Here",
      injectVia: "asset",
    },
  ],
  compositionWidth: 1920,
  compositionHeight: 1080,
};

await db
  .update(schema.runs)
  .set({ pipeline: "template", template, nexrenderJobId: null })
  .where(eq(schema.runs.id, runId));

// fillTemplateText reads the run's prompt/brandText/adType/adStyle + the
// template's TEXT slots; applyTemplate reads runId/aspectRatio. A minimal ctx
// covers both.
const ctx = {
  runId,
  adStyle: run.adStyle ?? "",
  adType: run.adType ?? "ugc",
  aspectRatio: run.aspectRatio,
  duration: run.duration,
  brandText: run.brandText ?? undefined,
  openai: createOpenAIProvider(),
} as unknown as SkillContext;

console.log(`▶ fillTemplateText run=${runId} …`);
const fills = await fillTemplateText(ctx);
console.log("  fills:", JSON.stringify(fills));
await db
  .update(schema.runs)
  .set({ templateTextFill: fills })
  .where(eq(schema.runs.id, runId));

console.log(`▶ applyTemplate run=${runId} …`);
await applyTemplate(ctx);

const [asset] = await db
  .select({ id: schema.assets.id, url: schema.assets.url, meta: schema.assets.meta })
  .from(schema.assets)
  .where(eq(schema.assets.runId, runId));
const vid = await db.query.videos.findFirst({
  where: eq(schema.videos.runId, runId),
});
console.log("✓ done");
console.log("  templated asset:", JSON.stringify(asset));
console.log("  video providerMeta:", JSON.stringify(vid?.providerMeta));
process.exit(0);
