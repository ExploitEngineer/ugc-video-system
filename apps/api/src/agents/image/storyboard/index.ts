// StoryBoard Generator — Image Agent skill.
//
// (a) LLM plans ordered scenes → image prompt + scenes (each tagged adStyle)
// (b) GPT Image 2 generates a composite storyboard sheet, referencing the
//     product sheet (+ person sheet when present) for consistency
// (c) persist: storage → assets(storyboard_sheet) → storyboard_sheets

import { schema } from "../../../db/index.js";
import { createLogger } from "../../../lib/log.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { IMAGE_SIZE_BY_RATIO } from "../../../providers/openai/constants.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../../persist.js";
import { buildStoryboardPrompt, type StoryboardPlan } from "./prompt.js";

type StoryboardSheet = typeof schema.storyboardSheets.$inferSelect;

export interface StoryboardInput {
  productSheetRef: ImageRef;
  /** Present whether the person was uploaded or generated. */
  personSheetRef?: ImageRef;
  userPrompt: string;
  /** Critic feedback from a rejected prior attempt — steers a full regen (F5). */
  critique?: string;
  /** Broken-down USER revision directive (confirm-mode storyboard gate). */
  directive?: RevisionDirective;
}

export async function storyboardGenerator(
  ctx: SkillContext,
  input: StoryboardInput,
): Promise<SkillResult<StoryboardSheet>> {
  const log = createLogger("image", { run: ctx.runId, skill: "storyboard" });
  log.info("▶ planning storyboard", {
    hasPerson: Boolean(input.personSheetRef),
    critique: Boolean(input.critique),
    revise: Boolean(input.directive),
  });

  const reply = await ctx.openai.chat(
    buildStoryboardPrompt({
      adStyle: ctx.adStyle,
      adType: ctx.adType,
      productBrief: ctx.productBrief,
      userPrompt: input.userPrompt,
      hasPerson: Boolean(input.personSheetRef),
      aspectRatio: ctx.aspectRatio,
      critique: input.critique,
      directive: input.directive,
    }),
  );
  const plan = parseJsonObject<StoryboardPlan>(reply);
  // Storyboard is fixed at 4 scenes — clamp in case the model overshoots.
  plan.scenes = plan.scenes.slice(0, 4);

  const refs: ImageRef[] = [input.productSheetRef];
  if (input.personSheetRef) refs.push(input.personSheetRef);

  log.debug("✓ plan ready — generating image", {
    scenes: plan.scenes.length,
    refs: refs.length,
  });
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs,
    size: IMAGE_SIZE_BY_RATIO[ctx.aspectRatio],
  });
  log.debug("✓ image generated", { bytes: bytes.length, mime });

  const { assetId, assetUrl, artifact } = await persistSheet({
    runId: ctx.runId,
    kind: "storyboard_sheet",
    bytes,
    mime,
    artifactInsert: async (tx, newAssetId) => {
      const [row] = await tx
        .insert(schema.storyboardSheets)
        .values({
          runId: ctx.runId,
          assetId: newAssetId,
          scenes: plan.scenes,
          promptUsed: plan.imagePrompt,
          status: "draft",
        })
        .returning();
      return row as StoryboardSheet;
    },
  });

  log.info("✓ storyboard persisted", { assetId, scenes: plan.scenes.length });
  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
