// Prompt module for the Generate Person Image skill.
//
// Runs ONLY when no person image was uploaded. Defines the kind of person
// that fits the product/ad style and emits the image prompt for a composite
// person reference sheet — multi-view, IMAGES ONLY (no text/labels baked into
// the image) — plus structured view + person details metadata.

import type { ChatMessage } from "../../../providers/openai/index.js";

export interface PersonImagePromptInput {
  adStyle: string;
  userPrompt: string;
}

/** Shape the LLM must return as strict JSON. */
export interface PersonImagePlan {
  imagePrompt: string;
  views: {
    front: string;
    threeQuarter: string;
    side: string;
  };
  personDetails: {
    demographics: string;
    costumeStyle: string;
    colorReference: string;
  };
}

export function buildPersonImagePrompt({
  adStyle,
  userPrompt,
}: PersonImagePromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the Generate Person Image skill of an ad-video Image Agent.",
    "No person image was provided, so you must invent ONE person who naturally",
    "fits the product and the requested ad style, then author the final",
    "text-to-image prompt for a single composite person reference sheet that",
    "downstream agents use to keep that person consistent across the ad.",
    "",
    "THE SHEET (describe all of this inside `imagePrompt`):",
    "- ONE single image, three views of the SAME person side by side in a clean",
    "  row: FRONT, THREE-QUARTER, and SIDE (profile).",
    "- Plain seamless studio backdrop: one flat neutral color, identical in",
    "  every view. Soft, even, shadowless studio lighting.",
    "- Full or three-quarter body, same person centered at the same scale in",
    "  each view, neutral relaxed pose, generous even margins.",
    "",
    "ABSOLUTE CONSISTENCY: it must be the exact same person in all three views",
    "— identical face, age, skin tone, hair, build, and wardrobe, and the same",
    "color palette throughout.",
    "",
    "HARD NEGATIVE CONSTRAINTS — IMAGES ONLY. The sheet must contain NO text of",
    "any kind: no labels, no captions, no view names, no names, no numbers, no",
    "arrows, no callouts, no logos or watermarks, no UI, no borders. Just the",
    "three clean photos of the person on the plain background.",
    "",
    "Use the product reference sheet (attached in the image step) and the ad",
    `style ("${style}") to choose demographics, wardrobe, and color palette so`,
    "the person clearly belongs in the same ad as the product.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "threeQuarter": string, "side": string }, "personDetails": { "demographics": string, "costumeStyle": string, "colorReference": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate the images-only / no-text rule. `views` and",
    "`personDetails` are metadata (NOT drawn on the image).",
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    "The product reference sheet is attached in the image-generation step.",
    "Produce the composite person reference sheet plan — multi-view, images",
    "only, absolutely no text or labels baked into the image.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
