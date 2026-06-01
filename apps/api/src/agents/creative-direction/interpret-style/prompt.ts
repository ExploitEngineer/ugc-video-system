// Prompt module for the Creative Direction Agent's style interpreter.
//
// Turns the raw user prompt into a concise, style-agnostic creative-direction
// brief (the `adStyle`) that is propagated verbatim to every downstream skill
// via `ctx.adStyle`. It must NOT invent a style the user didn't ask for — when
// the prompt is silent on style, it infers the most fitting commercial direction
// from the product/intent and keeps it neutral.

import type { AdType } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";

export interface InterpretStylePromptInput {
  userPrompt: string;
}

/** A short creative brief the LLM must return as strict JSON. */
export interface AdStylePlan {
  /** One-line creative direction propagated to every agent (the `adStyle`). */
  adStyle: string;
  /**
   * Ad treatment, inferred from the prompt:
   * `ugc` — a person delivers a spoken review/testimonial of the product.
   * `inspirational` — open-ended cinematic scene with voiceover narration.
   */
  adType: AdType;
}

export function buildInterpretStylePrompt(
  input: InterpretStylePromptInput,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the Creative Direction Agent for an AI ad-video generator.",
        "Read the user's prompt and return TWO things as strict JSON: a concise",
        "creative-direction line (`adStyle`) and the ad treatment (`adType`).",
        "",
        "`adStyle` — ONE compact, concrete brief (tone, vibe, pacing, mood), under",
        "~20 words, propagated to every downstream agent (image, storyboard, video).",
        "Rules for adStyle:",
        "- Be style-AGNOSTIC: UGC, cinematic, luxury, minimalist, comedic, inspirational —",
        "  whatever the user asks for.",
        "- If the user explicitly names a style, honor it.",
        "- If the user is silent on style, infer the most fitting commercial direction",
        "  from the product and intent, and keep it clean and neutral.",
        "- Do NOT restate the product or the literal prompt; describe the CREATIVE TREATMENT.",
        "",
        "`adType` — one of exactly two values:",
        '- "ugc": a real person speaks directly about the product — a review,',
        "  testimonial, recommendation, unboxing or first-person experience. Choose",
        "  this when the prompt centers on someone talking about / showing off the",
        "  product to the viewer.",
        '- "inspirational": an open-ended, more cinematic scene that follows whatever',
        "  the user describes (mood, journey, lifestyle, story), carried by voiceover",
        "  narration rather than a person reviewing the product on camera.",
        "Pick the value that best matches the user's wording. If genuinely ambiguous,",
        'default to "ugc".',
        "",
        'Return STRICT JSON only: {"adStyle": "<one concise line>", "adType": "ugc" | "inspirational"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `User prompt:\n${input.userPrompt}`,
    },
  ];
}
