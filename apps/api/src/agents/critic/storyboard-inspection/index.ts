// StoryBoard Sheet Inspection — Critic Agent skill.
//
// `inspectStoryboard` is one vision pass → verdict. `inspectAndRemediateStoryboard`
// wires it into the retry-cap engine: on issue it regenerates ONCE via the F4
// StoryBoard Generator (always a full rebuild — no localized path for
// storyboards, per the F5 scope).

import { schema } from "../../../db/index.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { imageAgent } from "../../image/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import {
  inspectAndRemediate,
  type SheetRef,
  toSheetRef,
} from "../remediate.js";
import {
  type CriticVerdict,
  type InspectionVerdict,
  inspectionVerdictSchema,
} from "../types.js";
import { buildStoryboardInspectionPrompt } from "./prompt.js";

type StoryboardSheet = typeof schema.storyboardSheets.$inferSelect;

export interface StoryboardInspectionInput {
  /** The storyboard sheet to inspect. */
  sheetRef: ImageRef;
  /** Planned scenes from the artifact row (metadata hint for the rubric). */
  scenes: StoryboardSheet["scenes"];
  userPrompt: string;
  hasPerson: boolean;
}

/** Single vision inspection → verdict. No side effects. */
export async function inspectStoryboard(
  ctx: SkillContext,
  input: StoryboardInspectionInput,
): Promise<InspectionVerdict> {
  const reply = await ctx.openai.chat(
    buildStoryboardInspectionPrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      scenes: input.scenes,
      hasPerson: input.hasPerson,
      sheetRef: input.sheetRef,
    }),
  );
  return parseJsonObject<InspectionVerdict>(reply, inspectionVerdictSchema);
}

export interface StoryboardRemediateInput {
  /** The storyboard sheet the F4 StoryBoard Generator already produced. */
  initial: SheetRef;
  scenes: StoryboardSheet["scenes"];
  userPrompt: string;
  /** Reference sheets — needed to re-invoke the generator for full regen. */
  productSheetRef: ImageRef;
  personSheetRef?: ImageRef;
}

/** Inspect, and on issue regenerate once (full rebuild), bounded by the cap. */
export async function inspectAndRemediateStoryboard(
  ctx: SkillContext,
  input: StoryboardRemediateInput,
): Promise<CriticVerdict> {
  const hasPerson = Boolean(input.personSheetRef);
  return inspectAndRemediate(ctx, {
    step: "storyboard_inspection",
    table: schema.storyboardSheets,
    initial: input.initial,
    inspect: (sheetUrl) =>
      inspectStoryboard(ctx, {
        sheetRef: { source: sheetUrl, mime: "image/png" },
        scenes: input.scenes,
        userPrompt: input.userPrompt,
        hasPerson,
      }),
    regenFull: async (critique) =>
      toSheetRef(
        await imageAgent.storyboardGenerator(ctx, {
          productSheetRef: input.productSheetRef,
          personSheetRef: input.personSheetRef,
          userPrompt: input.userPrompt,
          critique,
        }),
      ),
    // No regenLocalized → storyboard always regenerates as a whole sheet.
  });
}
