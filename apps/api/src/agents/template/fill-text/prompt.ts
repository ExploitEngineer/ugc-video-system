// Template Text-Fill prompt — writes every TEXT slot's real copy.
//
// Runs AFTER the storyboard, so it can draw on the product brief and the spoken
// script instead of guessing from the raw prompt, and after `template_plan`, so
// each slot arrives with a stated purpose (`copyIntent`) rather than only its
// placeholder wording.
//
// `charBudget` is a HARD ceiling, not a hint: the designer sized that box, and a
// sentence where a two-word CTA belongs overflows or renders garbled.

import { formatBrand } from "../../../lib/brand.js";
import type { ChatMessage } from "../../../providers/openai/index.js";

export interface TemplateTextSlotInput {
  jobLayerName: string;
  /**
   * The template's own placeholder text — a semantic hint for what this slot is
   * FOR (a headline vs. a CTA vs. a price), since the layer name itself is
   * often generic ("Text 1").
   */
  currentText?: string;
  /** From `template_plan`: what this line should say, and why. */
  copyIntent?: string;
  /** Hard character ceiling derived from the box and the placeholder. */
  charBudget?: number;
}

export interface TemplateTextFillPromptInput {
  userPrompt: string;
  brandText?: string;
  adType: string;
  adStyle: string;
  /** From `template_plan` — the through-line every slot shares. */
  conceptSummary?: string;
  /** The spoken script of the generated clip, so the copy echoes the ad. */
  transcript?: string;
  slots: TemplateTextSlotInput[];
}

function describeSlot(s: TemplateTextSlotInput, i: number): string {
  const parts = [`${i + 1}. jobLayerName="${s.jobLayerName}"`];
  if (s.copyIntent) parts.push(`purpose: ${s.copyIntent}`);
  if (s.currentText) parts.push(`placeholder: "${s.currentText}"`);
  if (s.charBudget) parts.push(`MAX ${s.charBudget} characters`);
  return parts.join(" — ");
}

export function buildTemplateTextFillPrompt(
  input: TemplateTextFillPromptInput,
): ChatMessage[] {
  const system = [
    "You are writing the on-screen text for a short ad video that has already",
    "been generated. A designer's After Effects template has TEXT layers (a",
    "headline, a CTA button, a price) that need real copy — right now they hold",
    "only the template's own placeholder wording.",
    "",
    "For EACH slot below, write REAL, SHORT copy for THIS ad. Each slot states",
    "its purpose; where it does not, infer it from the placeholder (a slot",
    'reading "Shop Now" is a call-to-action, one reading "Your Headline Here" is',
    "the hero headline).",
    "",
    "NEVER exceed a slot's stated character limit. It is the width of the box the",
    "designer drew, not a suggestion — copy that overruns it renders clipped or",
    "garbled. Shorter is always safe; longer is always broken.",
    "",
    "Never leave a placeholder unchanged unless it is already exactly right for",
    "this ad. If BRAND GUIDELINES are provided, follow their tone and wording.",
    "",
    "Return STRICT JSON only (no prose, no markdown fences):",
    "{",
    '  "fills": [ { "jobLayerName": "<exact slot id from the list below>", "value": "<the copy you wrote>" } ]',
    "}",
    "Include exactly one entry per slot listed below, in the same order.",
  ].join("\n");

  const user = [
    `AD PROMPT: ${input.userPrompt}`,
    input.conceptSummary ? `Concept: ${input.conceptSummary}` : "",
    input.adStyle ? `Style: ${input.adStyle}` : "",
    `Ad type: ${input.adType}`,
    input.transcript ? `What the ad says out loud: "${input.transcript}"` : "",
    formatBrand(input.brandText),
    "",
    "TEXT SLOTS TO FILL:",
    ...input.slots.map(describeSlot),
    "",
    "Write the fills now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
