// Product Sheet Builder — Image Agent skill.
//
// (a) LLM reasons style/hook → final image prompt + view metadata
// (b) GPT Image 2 edits the uploaded product into a composite 4-view sheet
// (c) persist: storage → assets(product_sheet) → product_reference_sheets

import { schema } from "../../../db/index.js";
import { createLogger } from "../../../lib/log.js";
import { neutralizeCast } from "../../../lib/image/color.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { IMAGE_SIZE_BY_RATIO } from "../../../providers/openai/constants.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../../persist.js";
import { buildProductSheetPrompt, type ProductSheetPlan } from "./prompt.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;

export interface ProductSheetInput {
  /** The uploaded product image (public URL or data URI). */
  productUpload: ImageRef;
  userPrompt: string;
  /** Critic feedback from a rejected prior attempt — steers a full regen (F5). */
  critique?: string;
}

export async function productSheetBuilder(
  ctx: SkillContext,
  input: ProductSheetInput,
): Promise<SkillResult<ProductReferenceSheet>> {
  const log = createLogger("image", { run: ctx.runId, skill: "product_sheet" });
  log.info("▶ planning product sheet", { critique: Boolean(input.critique) });

  const messages = buildProductSheetPrompt({
    adStyle: ctx.adStyle,
    userPrompt: input.userPrompt,
    aspectRatio: ctx.aspectRatio,
    productUpload: input.productUpload,
    critique: input.critique,
  });
  // Retry the plan ONCE on an unparseable reply (a truncated/prose-wrapped JSON
  // body otherwise hard-fails the whole run as an opaque INTERNAL — the cause of
  // the product-sheet step failing with nothing generated). The planner runs on
  // Claude where strict json-mode is skipped, so a forgiving second attempt with
  // a larger ceiling is the cheap safety net the storyboard/video steps already
  // have but the product sheet lacked.
  let plan: ProductSheetPlan | undefined;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      maxTokens: attempt === 1 ? 4096 : 6144,
    });
    try {
      plan = parseJsonObject<ProductSheetPlan>(reply);
    } catch (err) {
      log.warn("product sheet plan unparseable — retrying", {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      if (attempt === 2) throw err;
    }
  }
  if (!plan) throw new Error("product sheet plan missing after retries");

  log.debug("✓ plan ready — generating image");
  const { bytes: rawBytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: [input.productUpload],
    size: IMAGE_SIZE_BY_RATIO[ctx.aspectRatio],
    // High quality: the product sheet is the identity anchor — its label text,
    // markings and finish must be sharp enough to drive every downstream render.
    quality: "high",
  });
  // The product sheet is the COLOUR authority for the whole run (the storyboard
  // and video defer to it for exact hues). gpt-image-2's warm/orange cast would
  // otherwise bake a false tint into that authority, so neutralize it here too —
  // the SAME capped ±8% gray-world correction the storyboard sheet already gets.
  // PNG-preserving and best-effort (returns input unchanged on any failure), so
  // it never blocks the run; the white studio sweep makes gray-world ideal here.
  const bytes = await neutralizeCast(rawBytes);
  log.debug("✓ image generated", { bytes: bytes.length, mime });

  const { assetId, assetUrl, artifact } = await persistSheet({
    runId: ctx.runId,
    kind: "product_sheet",
    bytes,
    mime,
    artifactInsert: async (tx, newAssetId) => {
      const [row] = await tx
        .insert(schema.productReferenceSheets)
        .values({
          runId: ctx.runId,
          assetId: newAssetId,
          views: plan.views,
          promptUsed: plan.imagePrompt,
          status: "draft",
        })
        .returning();
      return row as ProductReferenceSheet;
    },
  });

  log.info("✓ product sheet persisted", { assetId });
  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
