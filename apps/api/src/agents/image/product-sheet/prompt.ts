// Prompt module for the Product Sheet Builder skill.
//
// The LLM reasons about the ad framework/hook from the product + requested
// style, then emits the final GPT Image 2 prompt for a single composite
// reference sheet — a clean 2×2 grid of four product views, IMAGES ONLY (no
// text/labels baked into the image) — plus structured `views` metadata.

import type { ChatMessage } from "../../../providers/openai/index.js";

export interface ProductSheetPromptInput {
  adStyle: string;
  userPrompt: string;
}

/** Shape the LLM must return as strict JSON. */
export interface ProductSheetPlan {
  /** Final text-to-image prompt sent to GPT Image 2. */
  imagePrompt: string;
  views: {
    front: string;
    threeQuarter: string;
    side: string;
    rear: string;
  };
}

export function buildProductSheetPrompt({
  adStyle,
  userPrompt,
}: ProductSheetPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the Product Sheet Builder skill of an ad-video Image Agent.",
    "A reference photo of the product is attached in the image step. Your job",
    "is to author the final text-to-image prompt for ONE composite product",
    "reference sheet that downstream agents will use to keep the product",
    "consistent across the whole ad.",
    "",
    "THE SHEET (describe all of this inside `imagePrompt`):",
    "- ONE single image, a clean 2×2 grid of exactly FOUR cells.",
    "- Each cell shows the SAME product from a different angle, in this order:",
    "  top-left FRONT, top-right THREE-QUARTER, bottom-left SIDE (profile),",
    "  bottom-right REAR.",
    "- Plain seamless studio backdrop: one flat neutral color (white or light",
    "  grey), identical in every cell. Soft, even, shadowless studio lighting.",
    "- Product centered in each cell, same scale and framing, generous even",
    "  margins, no overlap between cells.",
    "",
    "ABSOLUTE CONSISTENCY: it must be the exact same product in all four cells",
    "— identical colors, materials, finish, surface details, logos that are",
    "physically on the product, and proportions. Do not redesign or restyle the",
    "product; reproduce the attached reference faithfully, only changing the",
    "viewing angle per cell.",
    "",
    "HARD NEGATIVE CONSTRAINTS — IMAGES ONLY. The sheet must contain NO text of",
    "any kind: no labels, no captions, no view names, no numbers, no arrows, no",
    "callouts, no dimension/measurement lines, no color swatches, no logos or",
    "watermarks added by you, no UI, no borders or frame decorations. Just the",
    "four clean product photos on the plain background. (Text printed on the",
    "physical product itself is fine.)",
    "",
    `Interpret the ad style ("${style}") ONLY as backdrop color, lighting mood,`,
    "and overall finish of the sheet — never as a change to the product's",
    "actual shape, color, or material.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "threeQuarter": string, "side": string, "rear": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate the images-only / no-text rule. Each `views` entry is",
    "a short note (metadata, NOT drawn on the image) on what that angle",
    "emphasizes.",
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    "A product reference image is attached in the image-generation step.",
    "Produce the composite four-view product reference sheet plan — clean 2×2",
    "grid, images only, absolutely no text or labels baked into the image.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
