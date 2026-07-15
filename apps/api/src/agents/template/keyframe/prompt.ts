// Prompt module for the `template_keyframe` step — TEMPLATE-OWNED.
//
// This is the template pipeline's STORYBOARD. It authors ONE fixed 4-panel 2×2
// board — FOUR keyframes of the ad's single continuous take (opening → close) —
// plus a 4-entry script. The board is a FIXED 2×2 regardless of how many video
// slots the template has: the per-slot timing is handled downstream by the video
// step (`beatsToScenes` maps the template's N slot-windows onto these 4 scenes),
// so the board stays at the proven 2×2 resolution/quality and never degrades into
// a low-res N-panel grid.
//
// The After Effects template composites every FINAL graphic (captions, titles,
// logos, UI, end cards) itself, so the panel number badges + caption bars are
// DIRECTION ONLY — cropped off before Seedance and never baked into the footage.
//
// Deliberately imports nothing from ad-types or the shared storyboard prompt: the
// realism/consistency scaffolding is authored here (adapted from the shared LOOK
// blocks + `new-research/04-gpt-image-2-guide`) so the template look never drifts
// when the ad-type prompts change. The template's OWN look is the vision look-bible
// (`visualStyle`, which already folds in the sampled colour palette).

import type { ChatMessage } from "../../../providers/openai/index.js";

/** One video-slot window + the beat the master should show during it. */
export interface TemplateKeyframeBeat {
  /** Seconds into the master where this beat begins. */
  startSec: number;
  /** How long the beat is on screen. */
  durationSec: number;
  /** What the master shows during the window (the slot's planned `videoScene`). */
  scene: string;
}

export interface TemplateKeyframePromptInput {
  userPrompt: string;
  /** Optional user-typed brand guidelines (`runs.brand_text`). */
  brandText?: string;
  /** Factual product identity anchor (`runs.product_brief`). */
  productBrief?: string;
  /** The plan's one-line concept (`runs.template_plan.conceptSummary`). */
  conceptSummary?: string;
  /** The vision-derived look bible (+ sampled palette); may be empty. */
  visualStyle?: string;
  /** Output shape, so each panel matches the final frame. */
  aspectRatio: string;
  /** Length of the ONE continuous take these 4 panels sample. */
  clipSeconds: number;
  hasProduct: boolean;
  hasPerson: boolean;
  /** Product-derived description of the on-camera person, when invented. */
  personBrief?: string;
  /**
   * The template's intended slot progression — CONTEXT for the 4-panel arc, not a
   * 1:1 panel map. The board always has exactly 4 panels; these beats tell the
   * model what the ad moves through so the 4 keyframes cover the real progression.
   */
  beats: TemplateKeyframeBeat[];
}

/** The board is ALWAYS this many panels (2×2) — decoupled from slot count. */
export const KEYFRAME_PANELS = 4;

/**
 * Universal photoreal realism block — no ad-type dependence. Adapted from the
 * shared LOOK skin/colour language + `new-research/04-gpt-image-2-guide` (invert
 * the usual "add texture" advice: gpt-image-2 over-textures by default, so soften).
 */
const REALISM_BLOCK = [
  "- LENS & FRAMING: shoot each panel like a real camera — 85mm for close/medium,",
  "  35mm for wide; natural perspective, realistic proportions, NO extreme",
  "  wide-angle distortion. Vary framing across the four panels (wide / medium /",
  "  close-up), never the same flat front-on shot four times.",
  "- LIGHT: soft, diffused, low-contrast light (north-facing window / softbox /",
  "  gentle fill). Neutral white balance, true-to-life colour, NO warm/sepia/orange",
  "  cast.",
  "- SKIN on any face: smooth, healthy, even skin with soft realistic texture,",
  "  balanced tone, no redness, no blotchiness, no heavy retouching — a real",
  "  photographed frame, never a waxy, plastic or airbrushed AI face and never a",
  "  3D render. Render skin softly, not clinically over-sharpened.",
  "- CONSISTENCY: the four panels are consecutive keyframes of ONE continuous take.",
  "  Keep the SAME place, the SAME person, the SAME wardrobe/hair, the SAME product",
  "  and the SAME lighting/look across all four; only the CAMERA and the small",
  "  on-screen moment advance.",
] as const;

export function buildTemplateKeyframePrompt({
  userPrompt,
  brandText,
  productBrief,
  conceptSummary,
  visualStyle,
  aspectRatio,
  clipSeconds,
  hasProduct,
  hasPerson,
  personBrief,
  beats,
}: TemplateKeyframePromptInput): ChatMessage[] {
  const concept = conceptSummary?.trim();
  const product = productBrief?.trim();
  const person = personBrief?.trim();
  const style = visualStyle?.trim();
  const brand = brandText?.trim();

  const beatLines = beats
    .filter((b) => b.scene.trim())
    .map((b, i) => {
      const win = `${b.startSec.toFixed(1)}s–${(b.startSec + b.durationSec).toFixed(1)}s`;
      return `  - [${win}] ${b.scene.trim()}`;
    });

  const system = [
    "You are the Storyboard skill of an ad-video TEMPLATE pipeline.",
    "",
    "This ad is assembled by an After Effects template that composites ALL of its",
    "own FINAL graphics — every caption, title, logo, lower-third, UI screen, end",
    "card, border and watermark. The panel number badges and caption bars you draw",
    "on the board are DIRECTION ONLY: they are cropped off before the footage is",
    "generated, so the final clip stays clean live-action with NOTHING baked on.",
    "",
    "Author TWO things from the ad brief:",
    "",
    "1) `sheetImagePrompt` — describe ONE single image that is a STORYBOARD BOARD:",
    "   exactly FOUR equal-size photographic panels in a 2×2 grid, separated by thin",
    "   uniform white borders, read left-to-right then top-to-bottom. The four panels",
    "   are four consecutive keyframes of ONE continuous ~" +
      `${clipSeconds}s take — panel 1 the opening, panel 4 the close. Each panel is a`,
    "   clean photographic keyframe. In the TOP-LEFT corner of each panel put a small",
    "   plain number badge (1, 2, 3, 4). Across the BOTTOM of each panel put ONE thin",
    "   caption bar holding that panel's short shot label (added below). Add NO other",
    "   graphics — no headline, product name, price, arrows, logos, timecodes,",
    "   watermarks or UI.",
    "",
    "2) `scenes` — exactly FOUR entries, ONE per panel, in order (opening → close).",
    "   For each give:",
    "     - `sceneDescription`: what is on screen in this panel, as one continuous",
    "       take (one concrete sentence).",
    "     - `spokenLine`: one short spoken line for this moment, or an empty string",
    "       when no one speaks. Plain, conversational, brand-safe; no phone numbers,",
    "       URLs, prices, or absolute health/finance claims.",
    "     - `cameraAction`: one camera move or hold (e.g. \"slow push-in\",",
    "       \"handheld pan left\", \"locked-off wide\").",
    "     - `panelCaption`: the SHORT shot label for this panel's caption bar,",
    "       UPPERCASE, a few words: a shot type + the action (e.g. \"WIDE — MESSY",
    "       LIVING ROOM\", \"CLOSE — HAND LIFTS MUG\"). Direction only; cropped off",
    "       before the footage renders.",
    "",
    "Every panel is photographic and clean apart from its number badge + caption bar.",
    "Do NOT bake any headline, product name, logo, price, or UI into a panel.",
    "",
    ...REALISM_BLOCK,
    ...(style
      ? [
          "",
          "LOCKED LOOK — every panel MUST match this look exactly (do not",
          "reinterpret it):",
          style,
        ]
      : []),
    ...(product
      ? [
          "",
          `THE PRODUCT IS (authoritative — this exact item): ${product}`,
          "Feature it prominently and keep its real form, colours and markings",
          "intact across every panel; never swap it or invent packaging.",
        ]
      : hasProduct
        ? [
            "",
            "A product reference image is attached — feature that exact product",
            "prominently and keep its real form, colours and markings intact in",
            "every panel.",
          ]
        : []),
    ...(hasPerson
      ? [
          "",
          person
            ? `THE ON-CAMERA PERSON: ${person} Keep their apparent identity 100% constant across every panel and use consistent pronouns.`
            : "A person reference image is attached — that exact individual is on camera in every panel; keep their face, build and wardrobe identical.",
        ]
      : []),
    ...(brand ? ["", `BRAND GUIDELINES (follow verbatim): ${brand}`] : []),
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "sheetImagePrompt": string, "scenes": [ { "sceneDescription": string, "spokenLine": string, "cameraAction": string, "panelCaption": string } ] }',
    "`scenes` MUST have exactly FOUR entries, in order.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Ad prompt: ${userPrompt}`,
    ...(concept ? [`Concept: ${concept}`] : []),
    `Output shape (each panel): ${aspectRatio}.`,
    `Continuous take length: ~${clipSeconds}s.`,
    ...(beatLines.length
      ? [
          "",
          "The template moves the ad through this progression — build the four-panel",
          "arc so the keyframes COVER it (condense or expand to exactly four panels):",
          ...beatLines,
        ]
      : []),
    ...(hasProduct || hasPerson
      ? ["", "The reference image(s) are attached in the image-generation step."]
      : []),
    "",
    "Write the four scenes + the 2×2 board prompt now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
