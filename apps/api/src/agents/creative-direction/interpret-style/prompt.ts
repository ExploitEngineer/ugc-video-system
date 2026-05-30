// Prompt module for the Creative Direction Agent's style interpreter.
//
// Turns the raw user prompt into a concise, style-agnostic creative-direction
// brief (the `adStyle`) that is propagated verbatim to every downstream skill
// via `ctx.adStyle`. It must NOT invent a style the user didn't ask for — when
// the prompt is silent on style, it infers the most fitting commercial direction
// from the product/intent and keeps it neutral.

import type { ChatMessage } from "../../../providers/openai/index.js";

export interface InterpretStylePromptInput {
  userPrompt: string;
}

/** A short creative brief the LLM must return as strict JSON. */
export interface AdStylePlan {
  /** One-line creative direction propagated to every agent (the `adStyle`). */
  adStyle: string;
}

export function buildInterpretStylePrompt(
  input: InterpretStylePromptInput,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the Creative Direction Agent for an AI ad-video generator.",
        "Read the user's prompt and distill the intended advertisement style into",
        "ONE concise creative-direction line (the `adStyle`). It is propagated to",
        "every downstream agent (image, storyboard, video), so it must be a compact,",
        "concrete brief — tone, vibe, pacing, mood — not a paragraph.",
        "",
        "Rules:",
        "- Be style-AGNOSTIC: UGC, cinematic, luxury, minimalist, comedic, inspirational —",
        "  whatever the user asks for. Never default to UGC.",
        "- If the user explicitly names a style, honor it.",
        "- If the user is silent on style, infer the most fitting commercial direction",
        "  from the product and intent, and keep it clean and neutral.",
        "- Do NOT restate the product or the literal prompt; describe the CREATIVE TREATMENT.",
        "- Keep it under ~20 words.",
        "",
        'Return STRICT JSON only: {"adStyle": "<one concise line>"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `User prompt:\n${input.userPrompt}`,
    },
  ];
}
