// Gentle, capped white-balance neutralization for generated keyframes.
//
// gpt-image / GPT-4o output carries a documented warm (yellow/orange) bias that
// prompt wording alone doesn't reliably remove. This applies a MILD gray-world
// correction — per-channel gain toward the average channel mean — but CAPS the
// gain to ±8% so a legitimately colourful or warm-lit scene (or a coloured
// product) can't be wrecked; it only pulls out an egregious global cast.
//
// Pure bytes-in / bytes-out (sharp), re-encoded WebP q100 to match the pipeline.
// Best-effort: any failure returns the input unchanged — colour never blocks a run.

import sharp from "sharp";
import { createLogger } from "../log.js";

const log = createLogger("color");

/** Max / min per-channel gain — keeps the correction subtle and colour-safe. */
const MAX_GAIN = 1.08;
const MIN_GAIN = 0.92;
const clampGain = (g: number) => Math.min(MAX_GAIN, Math.max(MIN_GAIN, g));

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
