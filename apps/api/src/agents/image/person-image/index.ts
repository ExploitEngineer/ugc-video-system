// Generate Person Image — Image Agent skill.
//
// ONLY invoked when no person image was uploaded — the CALLER decides that
// (verification script now, F7 worker later); this skill never reads assets.
//
// (a) LLM invents a fitting person → image prompt + views + personDetails
// (b) GPT Image 2 generates a composite person sheet, referencing the product
//     sheet for color/style coherence
// (c) persist: storage → assets(person_sheet) → person_reference_sheets

import { schema } from "../../../db/index.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../persist.js";
import { buildPersonImagePrompt, type PersonImagePlan } from "./prompt.js";

type PersonReferenceSheet = typeof schema.personReferenceSheets.$inferSelect;

export interface PersonImageInput {
  /** Product reference sheet (public URL) for color/style coherence. */
  productSheetRef: ImageRef;
  userPrompt: string;
}

export async function generatePersonImage(
  ctx: SkillContext,
  input: PersonImageInput,
): Promise<SkillResult<PersonReferenceSheet>> {
  const reply = await ctx.openai.chat(
    buildPersonImagePrompt({ adStyle: ctx.adStyle, userPrompt: input.userPrompt }),
  );
  const plan = parseJsonObject<PersonImagePlan>(reply);

  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: [input.productSheetRef],
  });

  const { assetId, assetUrl, artifact } = await persistSheet({
    runId: ctx.runId,
    kind: "person_sheet",
    bytes,
    mime,
    artifactInsert: async (tx, newAssetId) => {
      const [row] = await tx
        .insert(schema.personReferenceSheets)
        .values({
          runId: ctx.runId,
          assetId: newAssetId,
          views: plan.views,
          personDetails: plan.personDetails,
          promptUsed: plan.imagePrompt,
          status: "draft",
        })
        .returning();
      return row as PersonReferenceSheet;
    },
  });

  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
