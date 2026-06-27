// Prompt module for the Creative Direction Agent's person-brief planner.
//
// Runs once at the start of a run (Phase 0), BEFORE the product/person sheets
// generate in parallel. Looks at the UPLOADED product image (vision) plus the
// prompt + ad style and emits a concise text brief describing the on-camera
// person who belongs in the same ad. The person sheet skill consumes this brief
// as TEXT only — it never sees the product image — which is what lets the two
// reference sheets generate concurrently.

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";

export interface PersonBriefPromptInput {
  userPrompt: string;
  adStyle: string;
  /**
   * The uploaded product image — attached for vision when present. Omitted when
   * the main character is synthesized from the prompt alone (Character toggle On,
   * no uploads), in which case no image is attached.
   */
  productUpload?: ImageRef;
}

/** Shape the LLM must return as strict JSON. */
export interface PersonBriefPlan {
  /** One concise paragraph: demographics, wardrobe, color palette to match the product. */
  personBrief: string;
}

export function buildPersonBriefPrompt({
  userPrompt,
  adStyle,
  productUpload,
}: PersonBriefPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  // Two modes: grounded in an uploaded product (vision), or — when the Character
  // toggle synthesizes a main character with no uploads — invented from the
  // prompt + style alone (no image).
  const lead = productUpload
    ? [
        "A product image is attached. Looking at the product and the requested ad",
        "style, describe the ideal on-camera PERSON to feature in the ad — a real,",
        "plausible USER of this kind of product, the sort of human who naturally",
        "belongs in the same commercial as it.",
      ]
    : [
        "No image is attached. From the user's prompt and the requested ad style,",
        "describe the ideal on-camera MAIN CHARACTER to feature in the ad — a real,",
        "plausible person who naturally belongs in this scene and would credibly",
        "front this ad.",
      ];

  const grounding = productUpload
    ? "Keep it grounded in what the product actually is and who would realistically use or be marketed it."
    : "Keep it grounded in the prompt — match who this ad is for and the world it depicts.";

  const system = [
    "You are the Creative Direction Agent for an AI ad-video generator.",
    ...lead,
    "",
    "OPEN the brief by stating, in this order and explicitly: apparent GENDER",
    'PRESENTATION (e.g. "a woman" / "a man"), an approximate AGE RANGE, and HAIR',
    "(length, color, style). THEN add the rest of the look, wardrobe (ordinary",
    "clothing) and a tasteful clothing color palette in believable everyday",
    `colors. ${grounding}`,
    "",
    "DESCRIBE THE PERSON ONLY. Do NOT mention the product, a bottle, or ANY",
    "handheld item, prop, bag or accessory. Do NOT have them hold, wear or display",
    "anything product-like, and do NOT invent color-matched accessories (e.g. a",
    "wristband the same color as the product) — clothing only, no props.",
    "",
    "This brief is handed to a downstream skill that generates the person as a",
    "reference sheet WITHOUT seeing any image, so the brief must be fully",
    "self-contained: do NOT say 'matching the product' — state the actual",
    "demographics, wardrobe, and clothing colors explicitly.",
    "",
    "Return STRICT JSON only, no prose, matching:",
    '{ "personBrief": "<one concise paragraph, ~40-70 words, beginning with gender, age, hair>" }',
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      productUpload
        ? "The product image is attached. Return the person brief as strict JSON."
        : "Return the person brief as strict JSON.",
    ].join("\n"),
    ...(productUpload ? { images: [productUpload] } : {}),
  };

  return [{ role: "system", content: system }, user];
}
