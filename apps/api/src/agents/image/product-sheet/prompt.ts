// Prompt module for the Product Sheet Builder skill.
//
// The LLM reasons about the ad framework/hook from the product + requested
// style, then emits the final GPT Image 2 prompt for a single composite
// reference sheet — a clean 2×2 grid of four product views, IMAGES ONLY (no
// text/labels baked into the image) — plus structured `views` metadata.

import type { ChatMessage } from "../../../providers/openai/index.js";
import { DEFAULT_IMAGE_RESOLUTION_LABEL } from "../../../providers/openai/constants.js";

export interface ProductSheetPromptInput {
  adStyle: string;
  userPrompt: string;
  /** Critic feedback from a rejected prior attempt — appended to steer a full regen (F5). */
  critique?: string;
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
  critique,
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
    `- Output/canvas resolution: ${DEFAULT_IMAGE_RESOLUTION_LABEL}. Render at full 4K detail.`,
    "- Each cell shows the SAME product from a different angle, in this order:",
    "  top-left FRONT, top-right THREE-QUARTER, bottom-left SIDE (profile),",
    "  bottom-right REAR.",
    "- A thin, uniform neutral separator line (a small gutter/border) divides the",
    "  four cells so each view reads as its own clean panel.",
    "- Plain seamless studio backdrop: one flat neutral color (white or light",
    "  grey), identical in every cell. Soft, even, shadowless studio lighting.",
    "- Product centered in each cell, same scale and framing, generous even",
    "  margins, no overlap between cells.",
    "",
    "ABSOLUTE FIDELITY — the single most important rule. Reproduce the attached",
    "product with photographic, forensic accuracy: it must be the EXACT same",
    "product in all four cells, identical in colors, materials, finish, surface",
    "details, textures, hardware and proportions. Reproduce EVERY marking on the",
    "product exactly as on the reference — all text, lettering, brand names and",
    "wordmarks, every numeral and dial/scale marking, logos and engravings —",
    "rendered crisp, legible and correct. Never invent, omit, garble, blur,",
    "rearrange, or restyle any text, number, or marking on the product. Do not",
    "redesign or restyle the product; only the viewing angle changes per cell.",
    "",
    "HARD NEGATIVE CONSTRAINTS. Add NOTHING of your own to the sheet: no labels,",
    "captions, view names, annotation numbers, arrows, callouts, dimension or",
    "measurement lines, color swatches, added logos or watermarks, no UI. The",
    "ONLY non-photographic element allowed is the thin plain separator between",
    "cells. This does NOT apply to text/numbers physically printed on the product",
    "itself — those MUST be reproduced exactly (see ABSOLUTE FIDELITY).",
    "",
    `Interpret the ad style ("${style}") ONLY as backdrop color, lighting mood,`,
    "and overall finish of the sheet — never as a change to the product's",
    "actual shape, color, or material.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "threeQuarter": string, "side": string, "rear": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate: the ABSOLUTE FIDELITY rule (reproduce every marking,",
    "text and numeral on the product exactly), the 2×2 layout with thin",
    "separators between cells, the no-added-text rule, and the",
    `${DEFAULT_IMAGE_RESOLUTION_LABEL} resolution. Each \`views\` entry is a short`,
    "note (metadata, NOT drawn on the image) on what that angle emphasizes.",
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    "A product reference image is attached in the image-generation step.",
    "Produce the composite four-view product reference sheet plan — clean 2×2",
    "grid with thin separators between cells, every product marking/text/numeral",
    "reproduced exactly, and no added labels or annotation text.",
    ...(critique?.trim()
      ? [
          "",
          "PREVIOUS ATTEMPT WAS REJECTED by the Critic. Author a corrected",
          "`imagePrompt` that fixes these issues while keeping everything else:",
          critique.trim(),
        ]
      : []),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
