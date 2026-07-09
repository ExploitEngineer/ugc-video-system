// Pure geometry + classification helpers for the template pipeline.
//
// No I/O, no providers, no DB — everything here is a total function over the
// numbers Nexrender's v3 introspection hands us, so it is exhaustively
// unit-testable (`__tests__/geometry.test.ts`). The template agents and the
// `POST /runs` gate both depend on these, so a bug here is a bug everywhere.

import type { AspectRatio, ImageSlotClass } from "@ugc/shared";

// ── Clip duration ────────────────────────────────────────────────────────────

/**
 * The ONLY clip lengths Seedance 2.0 accepts. It is a discrete set, not a
 * range: 7, 9, 11, 13 and 14 are rejected outright by ModelArk.
 *
 * NOTE: sourced from BytePlus' docs + two independent secondary sources; the
 * official parameter table would not render when fetched. `submitVideo` snaps
 * any out-of-set value onto this list rather than letting the API reject a
 * request halfway through a paid run.
 */
export const SEEDANCE_DURATIONS = [4, 5, 6, 8, 10, 12, 15] as const;

export const MIN_CLIP_SEC = SEEDANCE_DURATIONS[0]; // 4
export const MAX_CLIP_SEC = SEEDANCE_DURATIONS[SEEDANCE_DURATIONS.length - 1]; // 15

/** Floating-point slack, so a 15.0000001s composition is not "longer than 15s". */
const EPSILON = 1e-6;

/**
 * The smallest Seedance duration >= `seconds`, clamped to the set's bounds.
 *
 * Snapping UP is the whole point. A clip SHORTER than the template layer it
 * fills ends on a frozen frame (and the native audio cuts out early), while a
 * clip LONGER than its layer is simply trimmed by After Effects. Given the
 * choice, always overshoot.
 */
export function snapUp(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= MIN_CLIP_SEC) return MIN_CLIP_SEC;
  const want = Math.ceil(seconds - EPSILON);
  return SEEDANCE_DURATIONS.find((d) => d >= want) ?? MAX_CLIP_SEC;
}

/**
 * The Seedance clip length for a template whose main composition runs
 * `durationSec`. Capped at 15s (Seedance's hard ceiling) — a longer composition
 * is trimmed to match, see `compNeedsTrim`.
 *
 * An unknown duration falls back to the maximum: we would rather generate a
 * clip that gets trimmed than one that ends on a freeze.
 */
export function clipLengthForComp(durationSec: number | null | undefined): number {
  if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return MAX_CLIP_SEC;
  }
  return snapUp(Math.min(durationSec, MAX_CLIP_SEC));
}

/**
 * True when the composition outruns Seedance's 15s ceiling, so the render job
 * must emit `nx:comp-duration-set(main, MAX_CLIP_SEC)`. Without the trim, the
 * tail of the composition plays on past the end of the clip.
 */
export function compNeedsTrim(durationSec: number | null | undefined): boolean {
  if (durationSec == null || !Number.isFinite(durationSec)) return false;
  return durationSec > MAX_CLIP_SEC + EPSILON;
}

// ── gpt-image-2 sizing ───────────────────────────────────────────────────────

/** gpt-image-2 rejects any dimension not divisible by 16. */
const DIM_STEP = 16;
/** Hard ceiling enforced by gpt-image-2 (3840×2160 sits exactly on it). */
const MAX_TOTAL_PX = 8_294_400;
/**
 * Soft ceiling. OpenAI flags anything above 2560×1440 as "experimental" and it
 * grows unstable, so a template's image slot is rendered at (at most) this many
 * pixels and upscaled by After Effects if the layer is genuinely larger.
 */
const TARGET_TOTAL_PX = 2560 * 1440; // 3,686,400
/** Below this, gpt-image-2 output quality collapses. */
const MIN_DIM = 256;

const round16 = (n: number): number =>
  Math.max(DIM_STEP, Math.round(n / DIM_STEP) * DIM_STEP);

/** Fallback when a slot reports no usable geometry — a square, legal size. */
export const DEFAULT_SLOT_SIZE = "1024x1024";

/**
 * A legal gpt-image-2 `size` string for an image slot of `width`×`height`
 * pixels, preserving the slot's aspect ratio as closely as the divisible-by-16
 * rule allows.
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

  // Never render MORE pixels than the soft ceiling; never render fewer than the
  // slot needs (upscaling a small render into a big layer looks soft).
  let scale = 1;
  const area = width * height;
  if (area > TARGET_TOTAL_PX) scale = Math.sqrt(TARGET_TOTAL_PX / area);

  let w = round16(width * scale);
  let h = round16(height * scale);

  // Extreme aspect (a 1920×80 banner) can round one axis below the usable
  // floor. Scale BOTH up together so the aspect survives.
  const smallest = Math.min(w, h);
  if (smallest < MIN_DIM) {
    const up = MIN_DIM / smallest;
    w = round16(w * up);
    h = round16(h * up);
  }

  // Belt and braces: the hard ceiling wins over everything above.
  while (w * h > MAX_TOTAL_PX && w > DIM_STEP && h > DIM_STEP) {
    w = round16(w * 0.9);
    h = round16(h * 0.9);
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
 * How many characters a text box can hold before it overflows the designer's
 * layout. The designer sized the box for their own placeholder, so the
 * placeholder's own length is the strongest available signal; a width + font
 * size estimate refines it when Nexrender exposes both.
 *
 * The copywriter treats this as a ceiling rather than "match the rough length".
 * Returns undefined when there is nothing to go on.
 */
export function deriveCharBudget(
  currentText: string | undefined,
  width?: number | null,
  fontSize?: number | null,
): number | undefined {
  const fromText = currentText?.trim().length ?? 0;
  const fromBox =
    width && fontSize && fontSize > 0
      ? Math.floor(width / (fontSize * GLYPH_WIDTH_RATIO))
      : 0;
  const budget = Math.max(fromText, fromBox);
  return budget > 0 ? budget : undefined;
}
