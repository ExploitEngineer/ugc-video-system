// Creative Direction Agent skill: interpret the user prompt → `adStyle`.
//
// One LLM call at the start of a run. The orchestrator persists the result to
// `runs.adStyle` and threads it into every skill's `ctx.adStyle`.

import type { AdType } from "@ugc/shared";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import { type AdStylePlan, buildInterpretStylePrompt } from "./prompt.js";

export interface InterpretAdStyleInput {
  userPrompt: string;
}

const FALLBACK_AD_STYLE = "clean, neutral commercial";
const FALLBACK_AD_TYPE: AdType = "ugc";

export async function interpretAdStyle(
  ctx: SkillContext,
  input: InterpretAdStyleInput,
): Promise<{ adStyle: string; adType: AdType }> {
  const reply = await ctx.openai.chat(
    buildInterpretStylePrompt({ userPrompt: input.userPrompt }),
  );
  const plan = parseJsonObject<AdStylePlan>(reply);
  const adStyle = plan.adStyle?.trim() || FALLBACK_AD_STYLE;
  const adType: AdType =
    plan.adType === "inspirational" ? "inspirational" : FALLBACK_AD_TYPE;
  return { adStyle, adType };
}
