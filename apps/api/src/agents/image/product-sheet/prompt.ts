// Prompt module for the Product Sheet Builder skill.
//
// The LLM reasons about the ad framework/hook from the product + requested
// style, then emits the final GPT Image 2 prompt for a single composite
// reference sheet — a clean 2×2 grid of four product views, IMAGES ONLY (no
// text/labels baked into the image) — plus structured `views` metadata.

import type { AspectRatio } from "@ugc/shared";
import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";
import { IMAGE_LABEL_BY_RATIO } from "../../../providers/openai/constants.js";

export interface ProductSheetPromptInput {
  adStyle: string;
  userPrompt: string;
  /** Output aspect ratio — sizes the sheet so it matches the final video frame. */
  aspectRatio: AspectRatio;
  /**
   * The uploaded product image — attached to the planning chat (vision) so the
   * author can transcribe the product's real markings/materials/colors into the
   * `imagePrompt`, instead of writing generic fidelity boilerplate blind.
   */
  productUpload: ImageRef;
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
  aspectRatio,
  productUpload,
  critique,
}: ProductSheetPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];

  const system = [
    "You are the Product Sheet Builder skill of an ad-video Image Agent.",
    "The product's reference photo is attached to THIS message — study it",
    "closely. Your job is to author the final text-to-image prompt for ONE",
    "composite product reference sheet that downstream agents will use to keep",
    "the product consistent across the whole ad.",
    "",
    "THE SHEET (describe all of this inside `imagePrompt`):",
    "- ONE single image, a clean 2×2 grid of exactly FOUR cells.",
    `- Output/canvas resolution: ${resolutionLabel}. Render at full detail.`,
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
    "PHOTOREALISM & QUALITY — the sheet must look like a real, high-end commercial",
    "product photoshoot, NOT a render or illustration:",
    "- Shot on a full-frame camera with a sharp macro/prime lens; crisp, tack-sharp",
    "  focus on the product with true-to-life micro-detail (surface texture, grain,",
    "  weave, brushed metal, glass, plastic sheen — whatever the real materials are).",
    "- Soft studio key + fill lighting with gentle, believable highlights, subtle",
    "  contact shadow under the product, and accurate, physically-plausible",
    "  reflections on glossy or metallic surfaces. Neutral white balance, natural",
    "  color, full tonal range — no blown highlights, no muddy shadows.",
    "- Photographic realism: real materials and finish, no plastic/CGI/over-smoothed",
    "  look, no cartoon or painterly styling, no HDR halos or oversharpening.",
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
    "USE THE ATTACHED PHOTO — you can SEE the product, so be SPECIFIC, not generic.",
    "In the `imagePrompt`, NAME the product (its category) and TRANSCRIBE its real",
    "detail from the photo: the exact brand name / wordmarks / printed text /",
    "numerals VERBATIM and where each sits on the product, the real materials and",
    "surface finish (brushed metal, matte plastic, grained leather, frosted glass,",
    "etc.), and the exact primary + accent colors. The image model reproduces text",
    "and markings far better when the prompt states what they literally say and",
    "where — never leave it as a vague 'reproduce the logo'.",
    "",
    "HARD NEGATIVE CONSTRAINTS. Add NOTHING of your own to the sheet: no labels,",
    "captions, view names, annotation numbers, arrows, callouts, dimension or",
    "measurement lines, color swatches, added logos or watermarks, no UI. The",
    "ONLY non-photographic element allowed is the thin plain separator between",
    "cells. This does NOT apply to text/numbers physically printed on the product",
    "itself — those MUST be reproduced exactly (see ABSOLUTE FIDELITY).",
    "BARE PRODUCT ONLY: show JUST the product, isolated on the backdrop — no",
    "person, no hands holding it, no packaging, box or wrapper, and no extra",
    "props, accessories or decorative objects around it.",
    "",
    `Interpret the ad style ("${style}") ONLY as backdrop color, lighting mood,`,
    "and overall finish of the sheet — never as a change to the product's",
    "actual shape, color, or material.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "threeQuarter": string, "side": string, "rear": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate: the ABSOLUTE FIDELITY rule (reproduce every marking,",
    "text and numeral on the product exactly), the photorealistic high-end",
    "product-photography look (real camera, sharp macro detail, soft studio",
    "lighting, believable reflections — no CGI/illustrated look), the 2×2 layout",
    "with thin separators between cells, the no-added-text rule, and the",
    `${resolutionLabel} resolution. Each \`views\` entry is a short`,
    "note (metadata, NOT drawn on the image) on what that angle emphasizes.",
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      "The product reference photo is attached below — study it and transcribe",
      "its real markings, materials and colors into the `imagePrompt`.",
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
    ].join("\n"),
    images: [productUpload],
  };

  return [{ role: "system", content: system }, user];
}
