// Prompt module for the Generate Person Image skill.
//
// Three shapes:
//  - buildPersonImagePrompt — INVENT a person (text-to-image) from the product
//    brief, optionally as a deliberately DIFFERENT person on a "regenerate"
//    revise. Returns chat messages that author a full from-scratch image prompt
//    plus view/personDetails metadata.
//  - buildPersonEditInstruction — a SHORT imperative instruction for an
//    image-to-image EDIT of the prior sheet (a targeted revise). Short on
//    purpose: a verbose from-scratch spec makes the edit model reproduce the
//    input and ignore the change.
//  - buildPersonSheetFromPhotoInstruction — a SHORT instruction to turn an
//    UPLOADED person photo into the 2×2 reference sheet, preserving identity.

import type { AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";
import { IMAGE_LABEL_BY_RATIO } from "../../../providers/openai/constants.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";

export interface PersonImagePromptInput {
  adStyle: string;
  userPrompt: string;
  /** Product-derived brief (demographics/wardrobe/palette) — TEXT, not an image. */
  personBrief: string;
  /** Output aspect ratio — sizes the sheet so it matches the final video frame. */
  aspectRatio: AspectRatio;
  /**
   * A "regenerate"-scope revision directive — the user wants a DIFFERENT person.
   * (Targeted "edit" revisions go through buildPersonEditInstruction instead.)
   */
  directive?: RevisionDirective;
}

/** Shape the LLM must return as strict JSON. */
export interface PersonImagePlan {
  imagePrompt: string;
  views: {
    front: string;
    threeQuarter: string;
    side: string;
    back: string;
  };
  personDetails: {
    demographics: string;
    costumeStyle: string;
    colorReference: string;
  };
}

/** Shared sheet rules, kept terse for the image-to-image instructions. */
const SHEET_RULES =
  "Output ONE single image: a clean 2×2 grid of FOUR full-body views of the " +
  "SAME person — top-left front, top-right three-quarter, bottom-left side " +
  "(profile), bottom-right back. A thin neutral separator between cells, a " +
  "plain seamless neutral studio backdrop, soft even lighting, the person " +
  "centered at the same scale in every view. Photorealistic — a real human " +
  "photographed with a real camera (natural skin texture, lifelike face), NOT " +
  "CGI/plastic/illustration. No text, labels, captions, numbers, arrows or " +
  "watermarks anywhere.";

/**
 * SHORT edit instruction for an image-to-image revise of the attached prior
 * person sheet. Applies only the requested changes and preserves everything else.
 */
export function buildPersonEditInstruction(directive: RevisionDirective): string {
  const changes = directive.changes.length
    ? directive.changes.map((c) => `- ${c}`).join("\n")
    : "- (no specific change provided)";
  const keep = directive.keep.length ? ` (${directive.keep.join("; ")})` : "";
  return [
    "Edit the attached person reference sheet (a 2×2 grid of four views of one",
    "person). Apply ONLY these changes, consistently across ALL FOUR views:",
    changes,
    "",
    `Keep the SAME person and everything else identical${keep}: face, hair, skin`,
    "tone, body, age, pose, the 2×2 four-view layout, framing, the studio",
    "backdrop and lighting. Keep it photorealistic with no text or labels. Do",
    "NOT change anything that is not listed above.",
  ].join("\n");
}

/**
 * SHORT instruction to build the 2×2 reference sheet from an UPLOADED person
 * photo, preserving that exact person's identity and wardrobe.
 */
export function buildPersonSheetFromPhotoInstruction(): string {
  return [
    "From the attached photo of a person, produce the reference sheet of THAT",
    "EXACT person — identical face, hair, skin tone, build and the clothing they",
    "are wearing. Do not invent a different person, swap their face, or restyle",
    "their outfit; only the viewing angle changes per cell.",
    "",
    SHEET_RULES,
  ].join("\n");
}

/** Render a "regenerate" directive (different person) as prompt instructions. */
function regenerateBlock(d: RevisionDirective): string[] {
  const bullets = (items: string[]) => items.map((i) => `  - ${i}`);
  const lines = [
    "",
    "REVISION — the user rejected the previous person and wants a DIFFERENT one.",
    "Produce a CLEARLY DIFFERENT person reflecting these requests; do not reuse",
    "the prior look:",
  ];
  if (d.changes.length) lines.push("CHANGES:", ...bullets(d.changes));
  if (d.rationale) lines.push(`WHY: ${d.rationale}`);
  return lines;
}

export function buildPersonImagePrompt({
  adStyle,
  userPrompt,
  personBrief,
  aspectRatio,
  directive,
}: PersonImagePromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const brief = personBrief.trim();
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];

  const system = [
    "You are the Generate Person Image skill of an ad-video Image Agent.",
    "No person image was provided, so you must invent ONE person who naturally",
    "fits the product and the requested ad style, then author the final",
    "text-to-image prompt for a single composite person reference sheet that",
    "downstream agents use to keep that person consistent across the ad.",
    "",
    "THE SHEET (describe all of this inside `imagePrompt`):",
    "- ONE single image, a clean 2×2 grid of exactly FOUR views of the SAME",
    "  person, in this order: top-left FRONT, top-right THREE-QUARTER,",
    "  bottom-left SIDE (profile), bottom-right BACK (rear).",
    `- Output/canvas resolution: ${resolutionLabel}. Render at full detail.`,
    "- A thin, uniform neutral separator line (a small gutter/border) divides the",
    "  four views so each reads as its own clean panel.",
    "- Plain seamless studio backdrop: one flat neutral color, identical in",
    "  every view. Soft, even, shadowless studio lighting.",
    "- Full-body, same person centered at the same scale in each view, neutral",
    "  relaxed pose, generous even margins.",
    "",
    "ABSOLUTE CONSISTENCY: it must be the exact same person in all four views",
    "— identical face, age, skin tone, hair, build, and wardrobe, and the same",
    "color palette throughout. Only the viewing angle changes per cell.",
    "",
    "PHOTOREALISM — the person MUST look like a REAL, living human photographed",
    "with a real camera, NOT a 3D render, CGI character, doll, or illustration:",
    "- Natural skin with realistic texture, pores, fine detail and subtle",
    "  imperfections; lifelike eyes with natural catchlights; real, individually",
    "  detailed hair; believable hands and proportions.",
    "- Soft, even, flattering studio lighting on the skin with natural soft",
    "  shadowing; full-frame camera, sharp portrait/prime lens, accurate skin",
    "  tones and natural color.",
    "- AVOID the plastic/airbrushed/over-smoothed/waxy 'AI' look, uncanny faces,",
    "  doll-like skin, symmetric mannequin features, or any cartoon/painterly",
    "  styling. The result should be indistinguishable from a real photo shoot.",
    "- The person reads as a REAL, relatable everyday person / authentic creator —",
    "  natural proportions, believable styling, candid real-human presence — NOT a",
    "  glossy fashion model, retouched magazine cover, or polished 'AI influencer'.",
    "",
    "HARD NEGATIVE CONSTRAINTS. Add NOTHING of your own to the sheet: no labels,",
    "captions, view names, names, numbers, arrows, callouts, logos, watermarks,",
    "or UI. The ONLY non-photographic element allowed is the thin plain separator",
    "between the four views. Just clean full-body photos of the person.",
    "",
    "A product-derived brief is provided below as TEXT (no product image is",
    "attached). Use it together with the ad style",
    `("${style}") to choose demographics, wardrobe, and color palette so the`,
    "person clearly belongs in the same ad as the product:",
    `${brief || "(no brief provided — infer a fitting person from the ad style)"}`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "threeQuarter": string, "side": string, "back": string }, "personDetails": { "demographics": string, "costumeStyle": string, "colorReference": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate: the four-view 2×2 layout with thin separators between",
    "views, the PHOTOREALISTIC real-human look (real camera, natural skin texture,",
    "lifelike face — a real, relatable everyday person, no CGI/plastic/airbrushed",
    "or glossy-model look), the images-only / no-added-text rule, and the",
    `${resolutionLabel} resolution. \`views\` (all four) and`,
    "`personDetails` are metadata (NOT drawn on the image).",
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    `Product-derived person brief: ${brief || "(none — infer from the ad style)"}`,
    ...(directive ? regenerateBlock(directive) : []),
    "Produce the composite person reference sheet plan — exactly FOUR views in a",
    "2×2 grid with thin separators between them, images only, no added text or",
    "labels baked into the image.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
