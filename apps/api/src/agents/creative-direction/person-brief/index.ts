// Creative Direction Agent skill: plan the person brief.
//
// One vision LLM call at the start of a run (Phase 0), only when a product image
// was uploaded. The orchestrator persists the result to `runs.personBrief` and
// threads it into the person sheet skill as TEXT — so the product and person
// reference sheets can generate in parallel (the person never reads the product
// sheet image).

import { parseJsonObject } from "../../json.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import type { SkillContext, SupportingRole } from "../../types.js";
import { buildPersonBriefPrompt, type PersonBriefPlan } from "./prompt.js";

export interface PlanPersonBriefInput {
  userPrompt: string;
  /**
   * The uploaded product image, when one exists — the brief is grounded in a
   * plausible USER of it (vision). Omitted when the Character toggle synthesizes
   * a main character with NO uploads: the brief is then planned from the prompt
   * + ad style alone (no image).
   */
  productUpload?: ImageRef;
}

export async function planPersonBrief(
  ctx: SkillContext,
  input: PlanPersonBriefInput,
): Promise<{ personBrief: string; supportingCast: SupportingRole[] }> {
  const reply = await ctx.openai.chat(
    buildPersonBriefPrompt({
      userPrompt: input.userPrompt,
      adStyle: ctx.adStyle,
      productUpload: input.productUpload,
    }),
    { jsonMode: true },
  );
  const plan = parseJsonObject<PersonBriefPlan>(reply);
  // Text-only secondary roles (Chunk 4b) — sanitize + cap so a hallucinated
  // crowd can't bloat the storyboard/video prompts.
  const supportingCast: SupportingRole[] = (plan.supportingCast ?? [])
    .filter(
      (c): c is { role: string; appearance: string } =>
        Boolean(c) && typeof c.role === "string" && c.role.trim().length > 0,
    )
    .slice(0, 3)
    .map((c) => ({
      role: c.role.trim(),
      appearance: (c.appearance ?? "").trim(),
    }));
  return { personBrief: plan.personBrief?.trim() ?? "", supportingCast };
}
