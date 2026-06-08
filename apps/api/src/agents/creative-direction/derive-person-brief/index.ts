// Creative Direction Agent skill: derive the person brief from an UPLOADED photo.
//
// One vision LLM call at the start of a run, only when a person image was
// uploaded. The orchestrator persists the result to `runs.personBrief` so the
// storyboard CHARACTER ANCHOR and the video presenter-pin get an explicit
// gender/age/hair anchor for the uploaded person — without it, a gendered
// product brief (e.g. a "men's" watch) can flip an uploaded woman to a man.

import { parseJsonObject } from "../../json.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import type { SkillContext } from "../../types.js";
import { buildDerivePersonBriefPrompt, type PersonBriefPlan } from "./prompt.js";

export interface DerivePersonBriefInput {
  userPrompt: string;
  personUpload: ImageRef;
}

export async function derivePersonBrief(
  ctx: SkillContext,
  input: DerivePersonBriefInput,
): Promise<{ personBrief: string }> {
  const reply = await ctx.openai.chat(
    buildDerivePersonBriefPrompt({
      userPrompt: input.userPrompt,
      adStyle: ctx.adStyle,
      personUpload: input.personUpload,
    }),
    { jsonMode: true },
  );
  const plan = parseJsonObject<PersonBriefPlan>(reply);
  return { personBrief: plan.personBrief?.trim() ?? "" };
}
