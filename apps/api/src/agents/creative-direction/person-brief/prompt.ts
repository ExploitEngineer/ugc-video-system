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
  /** The uploaded product image — attached for vision. */
  productUpload: ImageRef;
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

  const system = [
    "You are the Creative Direction Agent for an AI ad-video generator.",
    "A product image is attached. Looking at the product and the requested ad",
    "style, describe the ideal on-camera PERSON to feature in the ad — a real,",
    "plausible USER of this kind of product, the sort of human who naturally",
    "belongs in the same commercial as it.",
    "",
    "Cover, concretely: demographics (age range, gender presentation, look),",
    "wardrobe/styling (ordinary clothing), and a tasteful clothing color palette",
    "in believable everyday colors. Keep it grounded in what the product actually",
    "is and who would realistically use or be marketed it.",
    "",
    "DESCRIBE THE PERSON ONLY. Do NOT mention the product, a bottle, or ANY",
    "handheld item, prop, bag or accessory. Do NOT have them hold, wear or display",
    "anything product-like, and do NOT invent color-matched accessories (e.g. a",
    "wristband the same color as the product) — clothing only, no props.",
    "",
    "This brief is handed to a downstream skill that generates the person as a",
    "reference sheet WITHOUT seeing the product, so the brief must be fully",
    "self-contained: do NOT say 'matching the product' — state the actual",
    "demographics, wardrobe, and clothing colors explicitly.",
    "",
    "Return STRICT JSON only, no prose, matching:",
    '{ "personBrief": "<one concise paragraph, ~40-70 words>" }',
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      "The product image is attached. Return the person brief as strict JSON.",
    ].join("\n"),
    images: [productUpload],
  };

  return [{ role: "system", content: system }, user];
}
