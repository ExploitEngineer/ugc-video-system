// Standalone verification for the Image Agent skills — NO worker (that's F7).
//
//   pnpm --filter api agents:verify <runId> ["ad style"]
//
// <runId> must be a real run created via POST /runs (so a product_upload asset
// exists). Runs product sheet → (person sheet if no person uploaded) →
// storyboard, then prints the asset URLs + artifact ids.
//
// WARNING: hits the live OpenAI image API — costs money and is slow. Only run
// it explicitly; never in CI/tests.

import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.js";
import { createOpenAIProvider } from "../src/providers/openai/index.js";
import { createVideoProvider } from "../src/providers/index.js";
import type { ImageRef } from "../src/providers/openai/index.js";
import type { SkillContext } from "../src/agents/types.js";
import { imageAgent } from "../src/agents/image/index.js";
import { planPersonBrief } from "../src/agents/creative-direction/person-brief/index.js";

async function main() {
  const runId = process.argv[2];
  const adStyle = process.argv[3] ?? "clean, neutral commercial";
  if (!runId) {
    console.error('Usage: agents:verify <runId> ["ad style"]');
    process.exit(1);
  }

  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId));
  if (!run) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }

  const assets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, runId));

  const productUpload = assets.find((a) => a.kind === "product_upload");
  const personUpload = assets.find((a) => a.kind === "person_upload");
  if (!productUpload?.url) {
    console.error("Run has no product_upload asset with a URL.");
    process.exit(1);
  }

  const ctx: SkillContext = {
    runId,
    adStyle,
    adType: run.adType ?? "ugc",
    productBrief: run.productBrief ?? "",
    personBrief: run.personBrief ?? "",
    aspectRatio: run.aspectRatio,
    openai: createOpenAIProvider(),
    video: createVideoProvider(),
  };
  const userPrompt = run.prompt;

  console.log(`\n▶ Product Sheet Builder (style: "${adStyle}")`);
  const product = await imageAgent.productSheetBuilder(ctx, {
    productUpload: { source: productUpload.url, mime: productUpload.mime ?? undefined },
    userPrompt,
  });
  console.log(`  asset ${product.assetId}\n  ${product.assetUrl}`);

  const productSheetRef: ImageRef = { source: product.assetUrl, mime: "image/png" };
  let personSheetRef: ImageRef | undefined;

  if (personUpload?.url) {
    console.log("\n▶ Person uploaded — skipping Generate Person Image.");
    personSheetRef = { source: personUpload.url, mime: personUpload.mime ?? undefined };
  } else {
    console.log("\n▶ Plan Person Brief (vision over uploaded product)");
    const { personBrief } = await planPersonBrief(ctx, {
      userPrompt,
      productUpload: {
        source: productUpload.url,
        mime: productUpload.mime ?? undefined,
      },
    });
    console.log(`  brief: ${personBrief}`);

    console.log("\n▶ Generate Person Image");
    const person = await imageAgent.generatePersonImage(ctx, {
      personBrief,
      userPrompt,
    });
    console.log(`  asset ${person.assetId}\n  ${person.assetUrl}`);
    personSheetRef = { source: person.assetUrl, mime: "image/png" };
  }

  console.log("\n▶ StoryBoard Generator");
  const storyboard = await imageAgent.storyboardGenerator(ctx, {
    productSheetRef,
    personSheetRef,
    userPrompt,
  });
  console.log(`  asset ${storyboard.assetId}\n  ${storyboard.assetUrl}`);
  console.log(`  scenes: ${(storyboard.artifact.scenes as unknown[])?.length ?? 0}`);

  console.log("\n✅ Image Agent verification complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
