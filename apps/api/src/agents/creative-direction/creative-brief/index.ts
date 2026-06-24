// Creative Brief Builder skill (SERVICE ads) — the `creative_brief` step.
//
// Short user service description → a dynamic, multi-scene creative brief (cast +
// scenes + hook + CTA). Runs ONCE at the start of a service run, BEFORE the
// storyboard, and its output is persisted to `runs.creative_brief`. The brief is
// the synthesized source of truth the storyboard renders (no product/person
// upload). See research/06-service-ad-prompting.md.

import { z } from "zod";
import { parseJsonObject } from "../../json.js";
import type { CreativeBrief, SkillContext } from "../../types.js";
import { buildCreativeBriefPrompt } from "./prompt.js";

export interface CreativeBriefInput {
  userPrompt: string;
}

// Forgiving schema (Claude via OpenRouter has no strict JSON mode): `.catch`
// normalizes a malformed reply to safe defaults instead of failing the run.
const dialogueSchema = z.object({
  speaker: z.string().catch(""),
  line: z.string().catch(""),
});
const sceneSchema = z.object({
  setting: z.string().catch(""),
  lighting: z.string().catch(""),
  charactersPresent: z.array(z.string()).catch([]),
  action: z.string().catch(""),
  dialogue: z.array(dialogueSchema).optional().default([]),
  onScreenText: z.string().optional(),
});
const characterSchema = z.object({
  name: z.string().catch(""),
  identity: z.string().catch(""),
});
const creativeBriefSchema = z.object({
  concept: z.string().catch(""),
  framework: z.string().catch("PAS"),
  awarenessStage: z.string().catch("problem-aware"),
  hook: z
    .object({ type: z.string().catch(""), line: z.string().catch("") })
    .catch({ type: "", line: "" }),
  cast: z.array(characterSchema).catch([]),
  scenes: z.array(sceneSchema).catch([]),
  cta: z
    .object({
      line: z.string().catch(""),
      endCard: z
        .object({
          headline: z.string().catch(""),
          tagline: z.string().optional(),
          url: z.string().optional(),
        })
        .optional(),
    })
    .catch({ line: "" }),
});

export async function creativeBrief(
  ctx: SkillContext,
  input: CreativeBriefInput,
): Promise<CreativeBrief> {
  const messages = buildCreativeBriefPrompt({
    userPrompt: input.userPrompt,
    adStyle: ctx.adStyle,
  });
  // One retry with a larger ceiling on an unparseable reply (the brief is the
  // longest creative-direction output; a truncated body otherwise hard-fails).
  try {
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      maxTokens: 3000,
    });
    return parseJsonObject<CreativeBrief>(reply, creativeBriefSchema);
  } catch {
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      maxTokens: 4096,
    });
    return parseJsonObject<CreativeBrief>(reply, creativeBriefSchema);
  }
}
