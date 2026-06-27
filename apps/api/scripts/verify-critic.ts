// Standalone verification for the Critic Agent skills — NO worker (that's F7).
//
//   pnpm --filter api critic:verify <runId> ["ad style"]
//
// <runId> must already have sheets produced by the Image Agent — run
//   pnpm --filter api agents:verify <runId>
// first. This inspects the latest product sheet, then the latest storyboard
// sheet, regenerating once on issues (cap = 1), and prints each CriticVerdict
// plus the run's resulting step_events. Re-runnable against existing sheets.
//
// WARNING: hits the live OpenAI API (vision + possibly image regen) — costs
// money and is slow. Only run it explicitly; never in CI/tests.

import { desc, eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.js";
import type { ImageRef } from "../src/providers/openai/index.js";
import { createOpenAIProvider } from "../src/providers/openai/index.js";
import { createVideoProvider } from "../src/providers/index.js";
import type { SkillContext } from "../src/agents/types.js";
import { criticAgent } from "../src/agents/critic/index.js";
import type { CriticVerdict } from "../src/agents/critic/types.js";

/** Newest product sheet for the run joined to its asset URL. */
async function latestProductSheet(runId: string) {
  const [row] = await db
    .select({ sheet: schema.productReferenceSheets, url: schema.assets.url })
    .from(schema.productReferenceSheets)
    .innerJoin(
      schema.assets,
      eq(schema.productReferenceSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.productReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row;
}

/** Newest storyboard sheet for the run joined to its asset URL. */
async function latestStoryboardSheet(runId: string) {
  const [row] = await db
    .select({ sheet: schema.storyboardSheets, url: schema.assets.url })
    .from(schema.storyboardSheets)
    .innerJoin(
      schema.assets,
      eq(schema.storyboardSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.storyboardSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row;
}

/** Newest generated person sheet for the run joined to its asset URL. */
async function latestPersonSheet(runId: string) {
  const [row] = await db
    .select({ url: schema.assets.url })
    .from(schema.personReferenceSheets)
    .innerJoin(
      schema.assets,
      eq(schema.personReferenceSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.personReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row;
}

function report(verdict: CriticVerdict) {
  console.log(`  outcome: ${verdict.outcome} (attempts: ${verdict.attempts})`);
  console.log(
    `  final artifact: ${verdict.finalArtifact.artifactId} [${verdict.finalArtifact.status}]`,
  );
  console.log(`  ${verdict.finalArtifact.assetUrl}`);
  console.log(`  last verdict: ${JSON.stringify(verdict.lastVerdict)}`);
}

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: critic:verify <runId> ["ad style"]');
    process.exit(1);
  }

  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId));
  if (!run) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }

  const adStyle = process.argv[3] ?? run.adStyle ?? "clean, neutral commercial";
  const ctx: SkillContext = {
    runId,
    adStyle,
    adType: run.adType === "inspirational" ? "inspirational" : "ugc",
    productBrief: run.productBrief ?? "",
    personBrief: run.personBrief ?? "",
    aspectRatio: run.aspectRatio,
    duration: run.duration,
    openai: createOpenAIProvider(),
    video: createVideoProvider(),
  };
  const userPrompt = run.prompt;

  const assets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, runId));
  const productUpload = assets.find((a) => a.kind === "product_upload");
  const personUpload = assets.find((a) => a.kind === "person_upload");

  // ── Product Sheet Inspection ──────────────────────────────────────────
  const product = await latestProductSheet(runId);
  if (!product?.url) {
    console.error(
      "No product_reference_sheets row with an asset URL — run agents:verify first.",
    );
    process.exit(1);
  }
  if (!productUpload?.url) {
    console.error("Run has no product_upload asset — cannot regenerate on failure.");
    process.exit(1);
  }

  console.log(`\n▶ Product Sheet Inspection (style: "${adStyle}")`);
  const productVerdict = await criticAgent.inspectAndRemediateProductSheet(ctx, {
    initial: {
      artifactId: product.sheet.id,
      assetId: product.sheet.assetId,
      assetUrl: product.url,
    },
    views: product.sheet.views,
    userPrompt,
    productUpload: {
      source: productUpload.url,
      mime: productUpload.mime ?? undefined,
    },
  });
  report(productVerdict);

  // ── StoryBoard Sheet Inspection ───────────────────────────────────────
  const storyboard = await latestStoryboardSheet(runId);
  if (storyboard?.url) {
    // Reference the latest product sheet (it may have been regenerated above).
    const productSheetRef: ImageRef = {
      source: productVerdict.finalArtifact.assetUrl,
      mime: "image/png",
    };

    let personSheetRef: ImageRef | undefined;
    if (personUpload?.url) {
      personSheetRef = {
        source: personUpload.url,
        mime: personUpload.mime ?? undefined,
      };
    } else {
      const person = await latestPersonSheet(runId);
      if (person?.url) personSheetRef = { source: person.url, mime: "image/png" };
    }

    console.log("\n▶ StoryBoard Sheet Inspection");
    const storyboardVerdict = await criticAgent.inspectAndRemediateStoryboard(
      ctx,
      {
        initial: {
          artifactId: storyboard.sheet.id,
          assetId: storyboard.sheet.assetId,
          assetUrl: storyboard.url,
        },
        scenes: storyboard.sheet.scenes,
        userPrompt,
        productSheetRef,
        personSheetRef,
      },
    );
    report(storyboardVerdict);
  } else {
    console.log("\n▶ No storyboard_sheets row — skipping StoryBoard Sheet Inspection.");
  }

  // ── Audit trail ───────────────────────────────────────────────────────
  const events = await db
    .select()
    .from(schema.stepEvents)
    .where(eq(schema.stepEvents.runId, runId))
    .orderBy(schema.stepEvents.createdAt);
  console.log("\n step_events:");
  for (const e of events) {
    console.log(`  ${e.createdAt.toISOString()} ${e.step} ${e.status}`);
  }

  console.log("\n✅ Critic Agent verification complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
