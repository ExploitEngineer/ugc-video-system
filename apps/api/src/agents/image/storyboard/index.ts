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

  const messages = buildStoryboardPrompt({
    adStyle: ctx.adStyle,
    adType: ctx.adType,
    productBrief: ctx.productBrief,
    productUse: ctx.productUse,
    personBrief: ctx.personBrief,
    userPrompt: input.userPrompt,
    hasPerson: Boolean(input.personSheetRef),
    aspectRatio: ctx.aspectRatio,
    critique: input.critique,
    directive: input.directive,
  });
  // The storyboard plan is the longest LLM output in the pipeline, so JSON mode
  // + a generous token ceiling are essential (a truncated reply = invalid JSON).
  // Retry ONCE with an even larger ceiling before surfacing a parse failure.
  let plan: StoryboardPlan | undefined;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      // Richer caption/sceneDescription prose grows the `scenes` payload, so give
      // headroom over the prior 4096/6144 to keep the JSON from truncating.
      maxTokens: attempt === 1 ? 5120 : 8192,
    });
    try {
      plan = parseJsonObject<StoryboardPlan>(reply);
    } catch (err) {
      log.warn("storyboard plan unparseable — retrying", {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      if (attempt === 2) throw err;
    }
  }
  if (!plan) throw new Error("storyboard plan missing after retries");
  // Storyboard is fixed at 3 scenes — clamp in case the model overshoots.
  plan.scenes = plan.scenes.slice(0, 3);

  // The planner tends to write the META-instruction ("quote each panelCaption
  // exactly") into `imagePrompt` instead of the caption TEXT, so the image model
  // never sees the captions and letters its own invented (first-person) lines.
  // Append the real panelCaption strings so the authored shot-type captions are
  // the ones rendered into the bottom bars.
  const captionDirective = plan.scenes.some((s) => s.panelCaption?.trim())
    ? `\n\nBOTTOM CAPTION BARS — letter EXACTLY these strings into each panel's bottom bar, one per panel, VERBATIM, uppercase, in order; do NOT paraphrase, shorten, translate, rewrite in first person, merge, or invent different wording:\n${plan.scenes
        .map(
          (s, i) =>
            `Panel ${String(i + 1).padStart(2, "0")}: "${(s.panelCaption ?? "").trim()}"`,
        )
        .join("\n")}`
    : "";
  const imagePrompt = `${plan.imagePrompt}${captionDirective}`;

  const refs: ImageRef[] = [input.productSheetRef];
  if (input.personSheetRef) refs.push(input.personSheetRef);

  log.debug("✓ plan ready — generating image", {
    scenes: plan.scenes.length,
    refs: refs.length,
  });
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: imagePrompt,
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
          promptUsed: imagePrompt,
          status: "draft",
        })
        .returning();
      return row as StoryboardSheet;
    },
  });

  log.info("✓ storyboard persisted", { assetId, scenes: plan.scenes.length });
  return { assetId, assetUrl, artifact, promptUsed: imagePrompt };
}
