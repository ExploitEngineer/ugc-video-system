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
import { createLogger } from "../../../lib/log.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../../persist.js";
import { buildPersonImagePrompt, type PersonImagePlan } from "./prompt.js";

type PersonReferenceSheet = typeof schema.personReferenceSheets.$inferSelect;

export interface PersonImageInput {
  /** Product reference sheet (public URL) for color/style coherence. */
  productSheetRef: ImageRef;
  userPrompt: string;
  /** Step-by-step revision request from a rejected prior person sheet. */
  feedback?: string;
}

export async function generatePersonImage(
  ctx: SkillContext,
  input: PersonImageInput,
): Promise<SkillResult<PersonReferenceSheet>> {
  const log = createLogger("image", { run: ctx.runId, skill: "person_sheet" });
  log.info("▶ planning person sheet", { feedback: Boolean(input.feedback) });

  const reply = await ctx.openai.chat(
    buildPersonImagePrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      feedback: input.feedback,
    }),
  );
  const plan = parseJsonObject<PersonImagePlan>(reply);

  log.debug("✓ plan ready — generating image");
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: [input.productSheetRef],
  });
  log.debug("✓ image generated", { bytes: bytes.length, mime });

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

  log.info("✓ person sheet persisted", { assetId });
  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
