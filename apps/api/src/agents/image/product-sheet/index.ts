// Product Sheet Builder — Image Agent skill.
//
// (a) LLM reasons style/hook → final image prompt + view metadata
// (b) GPT Image 2 edits the uploaded product into a composite 4-view sheet
// (c) persist: storage → assets(product_sheet) → product_reference_sheets

import { schema } from "../../../db/index.js";
import { createLogger } from "../../../lib/log.js";
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

  const reply = await ctx.openai.chat(
    buildProductSheetPrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      aspectRatio: ctx.aspectRatio,
      critique: input.critique,
    }),
    { jsonMode: true },
  );
  const plan = parseJsonObject<ProductSheetPlan>(reply);

  log.debug("✓ plan ready — generating image");
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: [input.productUpload],
    size: IMAGE_SIZE_BY_RATIO[ctx.aspectRatio],
  });
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
