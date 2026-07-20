// Re-composite an EXISTING run's finished clip into its template, and check the
// result with ffprobe.
//
//   pnpm --filter api template:probe <runId>
//
// One Nexrender render. NO AI spend: the 15s master, the storyboard and the
// stills are whatever the run already produced. Text slots deliberately keep the
// template's own placeholder wording, so the render answers exactly one question
// and does not depend on a copywriter call.
//
// It exists because the expensive part of a template run is everything BEFORE
// the composite, and the composite is where every bug has been:
//
//   - is an empty `PH_*` placeholder comp injectable through its outer layer?
//     (Nexrender's ExtendScript calls `layer.replaceSource(theImport, true)`
//     with no guard on the old source type — this proves it against a real .aep)
//   - does the ad run for the composition's own length?
//   - does the voiceover survive onto a template that has no audio layer?
//
// The run's `template` snapshot is INTENTIONALLY rebuilt from the current
// `templates` row: the snapshot is immutable by design, and the whole point here
// is to exercise a structure the run was never created with.

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const { db, schema } = await import("../src/db/index.js");
const { eq } = await import("drizzle-orm");
const { latestFinalVideoUrl } = await import(
  "../src/agents/creative-direction/inputs.js"
);
const { prepareTemplateClips } = await import("../src/agents/template/clips.js");
const { buildRenderInput } = await import("../src/agents/template/render-input.js");
const { createTemplateRenderProvider } = await import("../src/providers/index.js");
const { muxVoiceover } = await import("../src/lib/video/merge.js");
const { runTemplateSchema } = await import("@ugc/shared");

const runId = process.argv[2];
if (!runId) {
  console.error("usage: pnpm --filter api template:probe <runId>");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
if (!run) throw new Error(`run ${runId} not found`);
if (!run.templateId) throw new Error(`run ${runId} has no template`);

const row = await db.query.templates.findFirst({
  where: eq(schema.templates.id, run.templateId),
});
if (!row) throw new Error(`template ${run.templateId} not found`);

// Rebuild the snapshot from what introspection knows TODAY.
const structure = row.structure as {
  mainComposition: string;
  renderCompositions: string[];
  slots: unknown[];
  mainCompositionWidth: number | null;
  mainCompositionHeight: number | null;
};
const template = runTemplateSchema.parse({
  templateId: row.id,
  nexrenderTemplateId: row.nexrenderTemplateId,
  displayName: row.displayName,
  mainComposition: structure.mainComposition,
  renderCompositions: structure.renderCompositions,
  slots: structure.slots,
  compositionWidth: structure.mainCompositionWidth,
  compositionHeight: structure.mainCompositionHeight,
  metadata: row.metadata,
});

const masterUrl = await latestFinalVideoUrl(runId);
if (!masterUrl) throw new Error(`run ${runId} has no final_video to composite`);

console.log(`template : ${template.displayName} (${template.nexrenderTemplateId})`);
console.log(`comp     : ${template.mainComposition} — ${template.metadata.durationSec}s`);
console.log(`master   : ${masterUrl.slice(0, 80)}…\n`);

const { clipUrls, audioUrl, audioLayerName } = await prepareTemplateClips(
  runId,
  template,
  masterUrl,
);

// No `textFill`: every TEXT slot falls back to the designer's own placeholder.
const input = buildRenderInput({
  runId,
  template,
  textFill: [],
  imageUrls: new Map(),
  clipUrls,
  masterClipUrl: masterUrl,
  audioUrl,
  audioLayerName,
});

console.log("assets submitted:");
for (const a of input.assets) {
  const src = "src" in a ? ` ← ${a.src.split("/").pop()}` : "";
  const val = "value" in a ? ` = "${a.value}"` : "";
  console.log(`  ${a.kind.padEnd(9)} ${a.composition}/${a.layerName}${src}${val}`);
}
console.log();

const provider = createTemplateRenderProvider();
const task = await provider.submitRender(input);
console.log(`job ${task.jobId} submitted — polling…`);

const deadline = Date.now() + 20 * 60 * 1000;
let result = await provider.pollRender(task);
while (Date.now() < deadline && result.state === "processing") {
  await sleep(10_000);
  result = await provider.pollRender(task);
  process.stdout.write(`  ${result.status ?? "?"}\r`);
}
console.log();

if (result.state !== "completed" || !result.videoUrl) {
  throw new Error(`render ${result.state}: ${result.error ?? result.status}`);
}
console.log(`✓ rendered: ${result.videoUrl}\n`);

if (!audioLayerName && audioUrl) {
  const { bytes } = await muxVoiceover(result.videoUrl, audioUrl);
  const out = join(process.cwd(), `probe-${runId.slice(0, 8)}.mp4`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(out, bytes);
  console.log(`✓ voiceover muxed → ${out}`);
  console.log(`  ffprobe it: the ad must run ${template.metadata.durationSec}s and carry an aac stream.`);
} else {
  console.log(`voiceover went to the template's audio layer (${audioLayerName}).`);
}

process.exit(0);
