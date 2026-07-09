// Template Text-Fill prompt — writes every discovered TEXT slot's value from
// the ad's prompt/brand text, so the Nexrender template's copy actually
// matches the generated ad instead of the template's own placeholder words.

import type { ChatMessage } from "../../../providers/openai/index.js";
import { formatBrand } from "../../../lib/brand.js";

export interface TemplateTextSlotInput {
  jobLayerName: string;
  /**
   * The template's own placeholder text — the only semantic hint we have for
   * what this slot is FOR (a headline vs. a CTA vs. a price), since the layer
   * name itself is often generic (e.g. "Text 1").
   */
  currentText?: string;
}

export interface TemplateTextFillPromptInput {
  userPrompt: string;
  brandText?: string;
  adType: string;
  adStyle: string;
  slots: TemplateTextSlotInput[];
}

export function buildTemplateTextFillPrompt(
  input: TemplateTextFillPromptInput,
): ChatMessage[] {
  const system = [
    "You are writing the on-screen text for a short ad video that has already",
    "been generated. A designer's After Effects template has one or more TEXT",
    "layers (a headline, a CTA button, a price, etc.) that need real copy —",
    "right now they only hold the template's own placeholder wording.",
    "",
    "For EACH slot below, infer what it is FOR from its placeholder text (e.g.",
    'a slot currently reading "Shop Now" is a call-to-action button, one reading',
    '"Your Headline Here" is the hero headline) and write REAL, SHORT copy for',
    "THIS ad from the prompt/brand guidelines. Keep each value the same rough",
    "LENGTH/shape as its placeholder — these render at a fixed size, so a long",
    "sentence where a 2-word CTA belongs will overflow or render garbled. Never",
    "leave a slot's placeholder wording unchanged unless it is already exactly",
    "right for this ad.",
    "",
    "If BRAND GUIDELINES are provided, follow their tone/wording/palette.",
    "",
    "Return STRICT JSON only, exactly this shape (no prose, no markdown fences):",
    "{",
    '  "fills": [ { "jobLayerName": "<exact slot id from the list below>", "value": "<the copy you wrote>" } ]',
    "}",
    "Include exactly one entry per slot listed below, in the same order.",
  ].join("\n");

  const slotLines = input.slots.map(
    (s, i) =>
      `${i + 1}. jobLayerName="${s.jobLayerName}"${
        s.currentText ? ` — placeholder: "${s.currentText}"` : ""
      }`,
  );

  const user = [
    `AD PROMPT: ${input.userPrompt}`,
    input.adStyle ? `Style: ${input.adStyle}` : "",
    `Ad type: ${input.adType}`,
    formatBrand(input.brandText),
    "",
    "TEXT SLOTS TO FILL:",
    ...slotLines,
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
