// Gentle, capped white-balance neutralization for generated keyframes.
//
// gpt-image-2 output carries a documented warm (yellow/orange) bias that prompt
// wording alone doesn't reliably remove (the storyboard-quality complaint that
// scenes look unrealistically warm). This applies a MILD gray-world correction —
// per-channel gain toward the average channel mean — but CAPS the gain to ±8% so
// a legitimately colourful or warm-lit scene (or a coloured product) can't be
// wrecked; it only pulls out an egregious global cast.
//
// Pure bytes-in / bytes-out (sharp), re-encoded WebP q100 to match the pipeline's
// 4K image format. (Seedance/CreateAsset reject WebP, but that is handled at the
// provider boundary — every Seedance-bound ref is transcoded to JPEG there, so
// the stored sheet stays small WebP.) Best-effort: any failure returns the input
// unchanged — colour correction never blocks a run.

import sharp from "sharp";
import { createLogger } from "../log.js";

const log = createLogger("color");

/** Max / min per-channel gain — keeps the correction subtle and colour-safe. */
const MAX_GAIN = 1.08;
const MIN_GAIN = 0.92;
const clampGain = (g: number) => Math.min(MAX_GAIN, Math.max(MIN_GAIN, g));

/** `#rrggbb` for a 0–255 triple. */
const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

/** Squared RGB distance — cheap near-duplicate test, no sqrt needed. */
const dist2 = (
  a: [number, number, number],
  b: [number, number, number],
): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The template's dominant colour palette, read from a rendered still (its preview
 * poster). GROUND-TRUTH look anchors for the blueprint: the rendered frame carries
 * the template's grade, gradients and effects, so it is a better palette than the
 * project file's raw solid colours.
 *
 * Deterministic + dependency-light: downscale to a thumbnail, coarse-quantize each
 * pixel into an 8-levels-per-channel bucket, rank buckets by frequency, then greedily
 * keep the top ones that are visually distinct (squared-distance apart). Best-effort —
 * any decode failure returns `[]`, and the caller simply omits the palette.
 *
 * @returns up to `count` `#rrggbb` strings, most-prominent first.
 */
export async function dominantPalette(
  bytes: Uint8Array,
  count = 5,
): Promise<string[]> {
  try {
    const { data, info } = await sharp(Buffer.from(bytes))
      .resize(96, 96, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels; // 3 after removeAlpha
    if (ch < 3) return [];

    // Bucket key = 5 high bits per channel (32-wide bins), value = summed RGB +
    // count so the representative colour is the bucket's true mean, not its corner.
    const bins = new Map<
      number,
      { r: number; g: number; b: number; n: number }
    >();
    for (let i = 0; i + 2 < data.length; i += ch) {
      const r = data[i] as number;
      const g = data[i + 1] as number;
      const b = data[i + 2] as number;
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bin = bins.get(key);
      if (bin) {
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bin.n += 1;
      } else {
        bins.set(key, { r, g, b, n: 1 });
      }
    }

    const ranked = [...bins.values()]
      .sort((a, b) => b.n - a.n)
      .map((bin) => ({
        rgb: [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n] as [
          number,
          number,
          number,
        ],
      }));

    // Greedily keep prominent buckets that are visually distinct from the ones
    // already kept (≥ ~48 units apart), so the palette isn't five near-identical greys.
    const MIN_SEPARATION_SQ = 48 * 48;
    const kept: [number, number, number][] = [];
    for (const { rgb } of ranked) {
      if (kept.length >= count) break;
      if (kept.every((k) => dist2(k, rgb) >= MIN_SEPARATION_SQ)) kept.push(rgb);
    }
    return kept.map(([r, g, b]) => toHex(r, g, b));
  } catch (err) {
    log.warn("palette extraction skipped", {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Mildly neutralize a global colour cast (chiefly the gpt-image warm bias) on a
 * generated sheet. Returns corrected WebP bytes, or the input unchanged when the
 * correction is negligible or anything fails.
 */
export async function neutralizeCast(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const { channels } = await sharp(Buffer.from(bytes)).stats();
    const [r, g, b] = channels;
    if (!r || !g || !b || r.mean <= 0 || g.mean <= 0 || b.mean <= 0) {
      return bytes;
    }
    const target = (r.mean + g.mean + b.mean) / 3;
    const gains: [number, number, number] = [
      clampGain(target / r.mean),
      clampGain(target / g.mean),
      clampGain(target / b.mean),
    ];
    // Skip the re-encode when the correction is negligible (<1.5% on every channel).
    if (gains.every((x) => Math.abs(x - 1) < 0.015)) return bytes;
    const out = await sharp(Buffer.from(bytes))
      .removeAlpha() // sheets are opaque; guarantees 3 channels for .linear
      .linear(gains, [0, 0, 0])
      .webp({ quality: 100 })
      .toBuffer();
    log.debug("✓ neutralized cast", {
      gains: gains.map((x) => x.toFixed(3)).join(","),
    });
    return new Uint8Array(out);
  } catch (err) {
    log.warn("cast neutralization skipped", {
      err: err instanceof Error ? err.message : String(err),
    });
    return bytes;
  }
}
