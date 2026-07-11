// Pure geometry + classification helpers for the template pipeline.
//
// No I/O, no providers, no DB — everything here is a total function over the
// numbers Nexrender's v3 introspection hands us, so it is exhaustively
// unit-testable (`__tests__/geometry.test.ts`). The template agents and the
// `POST /runs` gate both depend on these, so a bug here is a bug everywhere.

import type { AspectRatio, ImageSlotClass } from "@ugc/shared";

import {
  GPT_IMAGE_DIM_STEP,
  GPT_IMAGE_MAX_EDGE,
  GPT_IMAGE_MIN_TOTAL_PX,
} from "../../providers/openai/constants.js";
import {
  MAX_CLIP_SEC,
  MIN_CLIP_SEC,
  SEEDANCE_DURATIONS,
  snapSeedanceDuration as snapUp,
} from "../../providers/video.js";

// ── Clip duration ────────────────────────────────────────────────────────────

// What Seedance accepts is a fact about the VIDEO PROVIDER, so it lives on that
// boundary and is enforced there. Re-exported here because the template pipeline
// is where the constraint is first applied, and callers/tests reach for it here.
export { MAX_CLIP_SEC, MIN_CLIP_SEC, SEEDANCE_DURATIONS, snapUp };

/**
 * Every template run generates ONE clip of exactly this length, whatever the
 * template looks like, so every ad is built from the same amount of footage.
 *
 * It is also the length of the FINISHED ad: a template's video slots are sliced
 * out of this master 1:1 (`slices.ts`), each cut from the second it plays so the
 * footage stays in sync with the voiceover, and a composition longer than this
 * is cropped back to it (`capVideoDuration`) — anything the design places past
 * the 15s mark is dropped rather than compressed into frame.
 */
export const MASTER_CLIP_SECONDS = MAX_CLIP_SEC; // 15

// ── gpt-image-2 sizing ───────────────────────────────────────────────────────

/** Hard ceiling enforced by gpt-image-2 (3840×2160 sits exactly on it). */
const MAX_TOTAL_PX = 8_294_400;
/**
 * Soft ceiling. OpenAI flags anything above 2560×1440 as "experimental" and it
 * grows unstable, so a template's image slot is rendered at (at most) this many
 * pixels and upscaled by After Effects if the layer is genuinely larger.
 */
const TARGET_TOTAL_PX = 2560 * 1440; // 3,686,400

/**
 * Widest shape gpt-image-2 will accept. Probed against the live API, which is
 * the only place this is stated:
 *
 *   1920x480 (4:1) → 400 "The maximum supported aspect ratio is 3:1."
 *
 * (Independently, beyond roughly 18:1 the minimum-pixel-budget and the 3840px
 * maximum-edge constraints become mutually unsatisfiable anyway.)
 *
 * A more extreme LAYER still renders correctly: the still is cropped into it by
 * `nx:layer-autoscale fill`, so a clamped source loses edges, not content.
 */
const MAX_SLOT_ASPECT = 3;

const round16 = (n: number): number =>
  Math.max(
    GPT_IMAGE_DIM_STEP,
    Math.round(n / GPT_IMAGE_DIM_STEP) * GPT_IMAGE_DIM_STEP,
  );

/** Fallback when a slot reports no usable geometry — a square, legal size. */
export const DEFAULT_SLOT_SIZE = "1024x1024";

/**
 * A legal gpt-image-2 `size` string for an image slot of `width`×`height`
 * pixels, preserving the slot's aspect ratio as closely as the divisible-by-16
 * rule allows.
 *
 * Four constraints, ALL discovered by probing the live API — none of them are in
 * the documentation, and three would have failed at runtime:
 *   - both dimensions divisible by 16
 *   - the longest edge at most 3840
 *   - a MINIMUM pixel budget: `800x800` (640,000px) is refused outright, so a
 *     small slot is scaled UP rather than requested at its native size
 *   - an aspect ratio no wider than 3:1
 *
 * The residual aspect drift (at most 8px per axis) is absorbed downstream by
 * `nx:layer-autoscale` with `fill`, which crops rather than stretches.
 */
export function gptImageSizeForSlot(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (
    width == null ||
    height == null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return DEFAULT_SLOT_SIZE;
  }

  // An extreme aspect cannot satisfy BOTH constraints: a 24:1 banner needs a
  // 4344px edge to clear the pixel floor, but the longest edge caps at 3840. So
  // clamp the shape first. `nx:layer-autoscale fill` crops the still into the
  // layer anyway, so a less extreme source loses edges, not content — whereas an
  // unsatisfiable size loses the whole image.
  let aw = width;
  let ah = height;
  const ratio = aw / ah;
  if (ratio > MAX_SLOT_ASPECT) ah = aw / MAX_SLOT_ASPECT;
  else if (ratio < 1 / MAX_SLOT_ASPECT) aw = ah / MAX_SLOT_ASPECT;

  // Aim for the slot's own pixel count, clamped into the band the API accepts:
  // never above the soft ceiling (unstable), never below the minimum budget
  // (a hard 400). Scaling preserves the aspect ratio, which is what the slot
  // actually needs — the exact pixel count is negotiable, the shape is not.
  const area = aw * ah;
  const target = Math.min(
    Math.max(area, GPT_IMAGE_MIN_TOTAL_PX),
    TARGET_TOTAL_PX,
  );

  let scale = Math.sqrt(target / area);
  let w = round16(aw * scale);
  let h = round16(ah * scale);

  // Rounding DOWN to a multiple of 16 can dip back under the floor (800x800
  // scales to 880x880 = 774,400 < 786,432). Nudge the scale up, preserving the
  // ratio, until it clears — bounded, so a pathological input cannot spin.
  for (
    let i = 0;
    i < 16 &&
    w * h < GPT_IMAGE_MIN_TOTAL_PX &&
    Math.max(w, h) < GPT_IMAGE_MAX_EDGE;
    i++
  ) {
    scale *= 1.03;
    w = round16(aw * scale);
    h = round16(ah * scale);
  }

  // The ceilings win over everything above: an edge over 3840 is a hard 400.
  while (
    (Math.max(w, h) > GPT_IMAGE_MAX_EDGE || w * h > MAX_TOTAL_PX) &&
    w > GPT_IMAGE_DIM_STEP &&
    h > GPT_IMAGE_DIM_STEP
  ) {
    w = round16(w * 0.95);
    h = round16(h * 0.95);
  }

  return `${w}x${h}`;
}

/** Nearest Seedance-supported ratio for a box. Null when the box is unknown. */
export function slotAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): AspectRatio | null {
  if (!width || !height) return null;
  return width / height >= 1 ? "16:9" : "9:16";
}

// ── IMAGE slot classification ────────────────────────────────────────────────
//
// A generated product photo dropped into a logo layer is wrong EVERY time, no
// matter how well the library is curated. So this heuristic runs before the
// Image Agent and acts as a HARD GUARD: anything it calls `brand` or
// `decorative` is never generated, and the plan LLM cannot promote it. Only the
// slots it leaves as `content` are passed to the model, which then decides
// whether an ambiguously-named slot (`PH_2`, `Media_3` — most real templates)
// is really a photographic content slot.

/** Collapse `PH_2`, `bg-image`, `LOGO_MAIN` → `ph 2`, `bg image`, `logo main`. */
const normalize = (name: string): string =>
  ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasWord = (haystack: string, words: readonly string[]): boolean =>
  words.some((w) => haystack.includes(` ${w} `));

/** Never AI-fill these: a generated logo is always wrong. */
const BRAND_WORDS = [
  "logo", "logotype", "brandmark", "wordmark", "brand",
  "icon", "badge", "emblem", "watermark", "mark",
] as const;

/** Never AI-fill these: they are the designer's art direction, not content. */
const DECOR_WORDS = [
  "bg", "background", "backdrop", "texture", "gradient", "overlay",
  "shadow", "vignette", "grain", "noise", "mask", "matte",
  "frame", "border", "pattern", "glow", "flare",
] as const;

/**
 * Unambiguously photographic. `image` / `img` / `media` are deliberately absent:
 * "background image" must classify as decorative, not content.
 */
const CONTENT_WORDS = [
  "photo", "product", "hero", "shot", "still", "picture",
  "feature", "screenshot", "scene", "portrait", "lifestyle",
] as const;

/** A slot this tiny is an icon or a logo, whatever it is called. */
const TINY_AREA_RATIO = 0.02;
/** A slot this large is the backdrop, whatever it is called. */
const FULL_BLEED_AREA_RATIO = 0.95;

/**
 * Decide whether the Image Agent may fill an IMAGE slot.
 *
 * Name beats geometry, because a designer who named a layer `logo` meant it.
 * Order matters: brand wins over decorative (a "logo background" is still a
 * logo), and decorative wins over content (a "background photo" is still the
 * backdrop). Geometry only breaks ties for the unnamed placeholders.
 */
export function classifyImageSlot(input: {
  layerName: string;
  width?: number | null;
  height?: number | null;
  compWidth?: number | null;
  compHeight?: number | null;
}): ImageSlotClass {
  const name = normalize(input.layerName);

  if (hasWord(name, BRAND_WORDS)) return "brand";
  if (hasWord(name, DECOR_WORDS)) return "decorative";
  if (hasWord(name, CONTENT_WORDS)) return "content";

  // Unnamed / ambiguous (`PH_2`, `Media_3`): fall back to how big it is.
  const { width, height, compWidth, compHeight } = input;
  if (width && height && compWidth && compHeight) {
    const ratio = (width * height) / (compWidth * compHeight);
    if (ratio <= TINY_AREA_RATIO) return "brand"; // icon-sized
    if (ratio >= FULL_BLEED_AREA_RATIO) return "decorative"; // full-bleed backdrop
  }

  // Genuinely ambiguous — hand it to the plan agent, which sees the name, the
  // pixel size and the ad brief and decides whether to fill it.
  return "content";
}

// ── TEXT slot budget ─────────────────────────────────────────────────────────

/** Rough average glyph width as a fraction of font size, for Latin text. */
const GLYPH_WIDTH_RATIO = 0.5;

/**
 * A single-line text layer's box is a little taller than its font size (the
 * ascender-to-descender run plus leading). Inverting that gives a font size when
 * nothing else does — a guess of LAST RESORT, used only for a text layer whose
 * placeholder is blank. Nexrender reports no font size anywhere: the opaque
 * `data` bag is `{}` on every layer of every real project.
 */
const LINE_HEIGHT_RATIO = 1.25;

export function estimateFontSizeFromBox(height?: number | null): number | undefined {
  if (!height || height <= 0) return undefined;
  return height / LINE_HEIGHT_RATIO;
}

/** How much longer than the designer's own words the copy may run. */
const PLACEHOLDER_SLACK = 1.15;
/** Below this, no word fits and the copywriter has nothing to write. */
const MIN_BUDGET = 3;

/**
 * How many characters a text box can hold before it overflows the designer's
 * layout.
 *
 * THE PLACEHOLDER IS THE CEILING. The designer sized the box, the animation and
 * the tracking around the exact words they typed, so those words are the only
 * honest measure of what fits. A little slack, and no more.
 *
 * The box is not a usable measure, however tempting the numbers look. In a real
 * split-text intro the layer `BOLD` — four glyphs — reports a 1040×71px box,
 * because the animation spreads its letters across the frame. Dividing width by
 * an estimated glyph width said 36 characters. The copywriter dutifully wrote
 * "This watch just became my daily." and it ran off the screen.
 *
 * Geometry survives only for a layer with a BLANK placeholder, where there is
 * nothing else at all to go on.
 *
 * The copywriter treats this as a hard ceiling, not "match the rough length".
 * Returns undefined when there is nothing at all to go on.
 */
export function deriveCharBudget(
  currentText: string | undefined,
  width?: number | null,
  height?: number | null,
): number | undefined {
  const placeholder = currentText?.trim().length ?? 0;
  if (placeholder > 0) {
    return Math.max(MIN_BUDGET, Math.round(placeholder * PLACEHOLDER_SLACK));
  }

  const size = estimateFontSizeFromBox(height);
  if (!width || !size || size <= 0) return undefined;
  const fromBox = Math.floor(width / (size * GLYPH_WIDTH_RATIO));
  return fromBox > 0 ? fromBox : undefined;
}
