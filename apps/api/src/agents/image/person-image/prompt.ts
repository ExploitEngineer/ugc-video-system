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
//    UPLOADED person photo into the 8-panel reference sheet, preserving identity.

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
    leftProfile: string;
    rightProfile: string;
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
  "Output ONE single image: a clean grid of EIGHT panels arranged in TWO rows of " +
  "four, all the SAME person. TOP row = four FULL-BODY views, left to right: front; " +
  "LEFT profile (person's left side to camera, facing the LEFT edge of the frame); " +
  "RIGHT profile (person's right side to camera, facing the RIGHT edge of the frame); " +
  "back. BOTTOM row = four HEAD-AND-SHOULDERS face close-ups in the SAME column order, " +
  "each facing the SAME direction as the full-body view directly above it (front face; " +
  "left-profile face facing the left edge; right-profile face facing the right edge; " +
  "back of head). The two profile columns are MIRROR-OPPOSITE views facing OPPOSITE " +
  "directions — clearly different, never duplicated. A thin neutral separator between all panels, a plain seamless " +
  "neutral studio backdrop, soft natural lighting with gentle believable shadowing, " +
  "the person at a consistent scale within each row. Photorealistic — a real human " +
  "photographed with a real camera (natural skin texture, lifelike face, relaxed " +
  "candid expression), NOT CGI/plastic/illustration. No text, labels, captions, " +
  "numbers, arrows or watermarks anywhere.";

/**
 * SHORT edit instruction for an image-to-image revise of the attached prior
 * person sheet. Applies only the requested changes and preserves everything else.
 */
export function buildPersonEditInstruction(
  directive: RevisionDirective,
): string {
  const changes = directive.changes.length
    ? directive.changes.map((c) => `- ${c}`).join("\n")
    : "- (no specific change provided)";
  const keep = directive.keep.length ? ` (${directive.keep.join("; ")})` : "";
  return [
    "Edit the attached person reference sheet (an 8-panel grid: top row four",
    "full-body angles, bottom row four matching face close-ups). Apply ONLY these",
    "changes, consistently across ALL EIGHT panels:",
    changes,
    "",
    `Keep the SAME person and everything else identical${keep}: face, hair, skin`,
    "tone, body, age, pose, the two-row eight-panel layout, framing, the studio",
    "backdrop and lighting. Keep it photorealistic with no text or labels. Do",
    "NOT change anything that is not listed above.",
  ].join("\n");
}

/**
 * SHORT instruction to build the 8-panel reference sheet from an UPLOADED person
 * photo, preserving that exact person's identity and wardrobe.
 */
export function buildPersonSheetFromPhotoInstruction(): string {
  return [
    "From the attached photo of a person, produce the reference sheet of THAT",
    "EXACT person — identical face, hair, skin tone, build and the clothing they",
    "are wearing. Do not invent a different person, swap their face, or restyle",
    "their outfit; only the viewing angle and crop change per panel.",
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
    "- ONE single image, a clean grid of exactly EIGHT panels in TWO rows of four,",
    "  all the SAME person.",
    "- TOP ROW — four FULL-BODY views, left to right: FRONT; LEFT PROFILE — the",
    "  person's LEFT side to the camera, body and face turned toward the LEFT edge",
    "  of the frame (nose pointing left); RIGHT PROFILE — the person's RIGHT side to",
    "  the camera, turned toward the RIGHT edge of the frame (nose pointing right);",
    "  BACK (rear).",
    "- BOTTOM ROW — four matching HEAD-AND-SHOULDERS face close-ups in the SAME",
    "  column order, each facing the SAME direction as the full-body view directly",
    "  above it: front face; left-profile face (facing the LEFT edge); right-profile",
    "  face (facing the RIGHT edge); back of head. The close-ups exist to lock the",
    "  face — render the features in crisp, high detail.",
    "- The two profile columns are MIRROR-OPPOSITE: the left and right profiles (and",
    "  their face close-ups) face OPPOSITE directions and must be clearly distinct —",
    "  never render the two profiles as the same or duplicated image.",
    `- Output/canvas resolution: ${resolutionLabel}. Render at full detail.`,
    "- A thin, uniform neutral separator line (a small gutter/border) divides all",
    "  eight panels so each reads as its own clean panel.",
    "- Plain seamless studio backdrop: one flat neutral color, identical in",
    "  every panel. Soft, natural studio lighting with gentle, believable shadowing",
    "  (lifelike face modelling), consistent across all panels.",
    "- Same person at a consistent scale within each row. In the full-body row, a",
    "  natural, relaxed standing pose with a candid, natural expression (not a",
    "  stiff posed stock smile), BOTH HANDS EMPTY and visible, holding or",
    "  displaying NOTHING. Generous even margins.",
    "",
    "ABSOLUTE CONSISTENCY: it must be the exact same person in all eight panels",
    "— identical face, age, skin tone, hair, build, and wardrobe, and the same",
    "color palette throughout. Only the viewing angle and crop change per panel.",
    "",
    "PHOTOREALISM — the person MUST look like a REAL, living human photographed",
    "with a real camera, NOT a 3D render, CGI character, doll, or illustration:",
    "- Natural skin with realistic texture, pores, fine detail and subtle",
    "  imperfections; natural facial asymmetry (not mirror-symmetric); lifelike",
    "  eyes with natural catchlights; real, individually detailed hair; believable",
    "  hands and proportions.",
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
    "between the panels. Just clean photos of the person.",
    "",
    "THE PRODUCT MUST NOT APPEAR. This is a PERSON-ONLY reference sheet: do NOT",
    "render the product, a bottle, or ANY handheld object, prop, bag or item being",
    "held, worn or displayed. Do NOT invent accessories — no wristbands, bands,",
    "bracelets, watches, jewelry or similar — and ESPECIALLY none in the product's",
    "color (no red wristband for a red product). Wardrobe = ordinary clothing only,",
    "in believable everyday colors; nothing that echoes or stands in for the product.",
    "",
    "A product-derived brief is provided below as TEXT (no product image is",
    "attached). Use it together with the ad style",
    `("${style}") to choose demographics, wardrobe, and a complementary clothing`,
    "palette so the person reads as a real, plausible USER of this kind of product",
    "— WITHOUT depicting the product or matching props:",
    `${brief || "(no brief provided — infer a fitting person from the ad style)"}`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "views": { "front": string, "leftProfile": string, "rightProfile": string, "back": string }, "personDetails": { "demographics": string, "costumeStyle": string, "colorReference": string } }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself restate: the two-row eight-panel layout (top row four full-body",
    "angles — front; left profile facing the LEFT frame edge; right profile facing",
    "the RIGHT frame edge; back — the two profiles being mirror-opposite,",
    "clearly-different views; bottom row four matching face close-ups, each facing",
    "the same direction as the body above it) with thin separators between all panels, the PHOTOREALISTIC",
    "real-human look (real camera, natural skin texture,",
    "lifelike face, candid relaxed expression, soft natural lighting with gentle",
    "shadowing — a real, relatable everyday person, no CGI/plastic/airbrushed or",
    "glossy-model look), EMPTY hands holding nothing and NO product / props /",
    "invented accessories, the images-only / no-added-text rule, and the",
    `${resolutionLabel} resolution. \`views\` (all four columns) and`,
    "`personDetails` are metadata (NOT drawn on the image).",
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    `Product-derived person brief: ${brief || "(none — infer from the ad style)"}`,
    ...(directive ? regenerateBlock(directive) : []),
    "Produce the composite person reference sheet plan — the eight-panel two-row",
    "sheet (four full-body angles on top, four matching face close-ups below) with",
    "thin separators between all panels, images only, no added text or labels",
    "baked into the image.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
