// Prompt module for the Creative Direction Agent's uploaded-person brief.
//
// Mirror of person-brief, but for the case where the user UPLOADED a person
// photo. It reads the ACTUAL person in the photo (vision) and emits a concise
// TEXT brief that PINS apparent gender, age and hair — so downstream skills
// (storyboard CHARACTER ANCHOR, video presenter-pin) have an explicit identity
// anchor and can't be dragged off by a gendered product brief (e.g. a "men's"
// watch flipping an uploaded woman to a man). Describe what is SEEN, never an
// idealized person.

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";

export interface DerivePersonBriefPromptInput {
  userPrompt: string;
  adStyle: string;
  /** The uploaded person image — attached for vision. */
  personUpload: ImageRef;
}

/** Shape the LLM must return as strict JSON. Same shape as person-brief. */
export interface PersonBriefPlan {
  /** One concise paragraph: gender, age, hair, then build/skin/wardrobe. */
  personBrief: string;
}

export function buildDerivePersonBriefPrompt({
  userPrompt,
  adStyle,
  personUpload,
}: DerivePersonBriefPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the Creative Direction Agent for an AI ad-video generator.",
    "A photo of a REAL person is attached. This exact person has ALREADY been",
    "chosen to appear on camera. Describe THEM — factually, from the photo — as a",
    "self-contained identity brief that pins who is on screen for every",
    "downstream step.",
    "",
    "OPEN the brief by stating, in this order and EXPLICITLY: apparent GENDER",
    'PRESENTATION (e.g. "a woman" / "a man"), an approximate AGE RANGE, and HAIR',
    "(length, color, style as shown). THEN add skin tone, build, and the clothing",
    "they are actually wearing (describe it as-is) with a wardrobe color palette,",
    "plus any visible glasses/jewelry/notable features.",
    "",
    "Describe what you actually SEE — do NOT idealize, beautify, restyle, change",
    "their gender, or suggest a different outfit. This brief OVERRIDES any",
    "gendered cue from the product (a 'men's' or 'women's' product does NOT change",
    "this person's gender). Gender, age and hair MUST be locked unambiguously.",
    "",
    "Return STRICT JSON only, no prose, matching:",
    '{ "personBrief": "<one concise paragraph, ~50-80 words, beginning with apparent gender, age, hair, then build, skin and wardrobe>" }',
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      "The person's photo is attached. Describe THIS exact person as strict JSON.",
    ].join("\n"),
    images: [personUpload],
  };

  return [{ role: "system", content: system }, user];
}
