/**
 * Standalone runner for the Video Generation Agent skill (F6).
 * No worker yet (F7) — exercises Video Builder directly against the live
 * video provider (BytePlus Seedance 2.0).
 *
 * Usage: pnpm --filter api video:verify <runId> ["ad style"]
 *
 * Expects the run to already have a storyboard sheet (produced by
 * agents:verify, optionally inspected by critic:verify). Reads the latest
 * storyboard sheet + scenes, generates the video, and prints the videos row +
 * the run's step_events.
 */
import { db, schema } from "../src/db/index.js";
import { eq, asc, desc } from "drizzle-orm";
import { createOpenAIProvider } from "../src/providers/openai/index.js";
import { createVideoProvider } from "../src/providers/index.js";
import type { SkillContext } from "../src/agents/types.js";
import type { StoryboardScene } from "../src/agents/image/storyboard/prompt.js";
import { videoAgent } from "../src/agents/video/index.js";

async function main() {
  const runId = process.argv[2];
  const adStyle = process.argv[3] ?? "clean, neutral commercial";
  if (!runId) {
    console.error("usage: tsx scripts/verify-video.ts <runId> [adStyle]");
    process.exit(1);
  }

  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId));
  if (!run) {
    console.error(`run ${runId} not found`);
    process.exit(1);
  }

  // Latest storyboard sheet + its asset (the visual reference URL).
  const [storyboard] = await db
    .select()
    .from(schema.storyboardSheets)
    .where(eq(schema.storyboardSheets.runId, runId))
    .orderBy(desc(schema.storyboardSheets.id))
    .limit(1);
  if (!storyboard) {
    console.error("no storyboard_sheets row on this run — run agents:verify first");
    process.exit(1);
  }

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, storyboard.assetId));
  if (!asset?.url) {
    console.error("storyboard asset has no url");
    process.exit(1);
  }

  const ctx: SkillContext = {
    runId,
    adStyle,
    adType: run.adType ?? "ugc",
    productBrief: run.productBrief ?? "",
    aspectRatio: run.aspectRatio,
    openai: createOpenAIProvider(),
    video: createVideoProvider(),
  };

  console.log("\n[1/1] Video Builder … (provider=byteplus)");
  // Person present if the run has a person upload or a generated person sheet.
  const runAssets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, runId));
  const hasPerson = runAssets.some(
    (a) => a.kind === "person_upload" || a.kind === "person_sheet",
  );
  const video = await videoAgent.videoBuilder(ctx, {
    storyboardSheetRef: { source: asset.url },
    hasPerson,
    scenes: (storyboard.scenes ?? []) as StoryboardScene[],
    userPrompt: run.prompt,
  });
  console.log(`  ✓ video asset=${video.assetId}`);
  console.log(`  url: ${video.assetUrl}`);
  console.log(`  videos row:`, video.artifact);

  const events = await db
    .select()
    .from(schema.stepEvents)
    .where(eq(schema.stepEvents.runId, runId))
    .orderBy(asc(schema.stepEvents.createdAt));
  console.log(`\nstep_events:`);
  for (const e of events) {
    console.log(`  ${e.step}/${e.status}`, e.payload ?? "");
  }

  console.log(`\nDone. Final video persisted for run ${runId}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
