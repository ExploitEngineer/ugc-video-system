// Product Sheet Builder — Image Agent skill.
//
// (a) LLM reasons style/hook → final image prompt + view metadata
// (b) GPT Image 2 edits the uploaded product into a composite 4-view sheet
// (c) persist: storage → assets(product_sheet) → product_reference_sheets

import { schema } from "../../../db/index.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../persist.js";
import { buildProductSheetPrompt, type ProductSheetPlan } from "./prompt.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;

export interface ProductSheetInput {
  /** The uploaded product image (public URL or data URI). */
  productUpload: ImageRef;
  userPrompt: string;
}

export async function productSheetBuilder(
  ctx: SkillContext,
  input: ProductSheetInput,
): Promise<SkillResult<ProductReferenceSheet>> {
  const reply = await ctx.openai.chat(
    buildProductSheetPrompt({ adStyle: ctx.adStyle, userPrompt: input.userPrompt }),
  );
  const plan = parseJsonObject<ProductSheetPlan>(reply);

  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: [input.productUpload],
  });

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

  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
