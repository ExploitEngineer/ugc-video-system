// Aspect/size normalization for any image bound for BytePlus `CreateAsset` (the
// face-asset path), which rejects anything outside aspect ratio 0.4–2.5 (w:h)
// or height 300–6000px (`InvalidParameter.AspectRatioTooSmall/Large`).
//
// Two entry points share one padding core (`padIntoBand`):
//   • `normalizePersonImage` — UPLOAD time. Fixes the user's photo ONCE so the
//     stored `person_upload` feeds both the OpenAI person-sheet reference and
//     the face asset. Truly degenerate strips are rejected with a friendly 422
//     (padding a 50×2000 sliver leaves a face too small to detect anyway).
//   • `padToProviderAspect` — for GENERATED images (the invented person sheet,
//     the storyboard crop strip) that skip the upload guard. Non-throwing: pads
//     when out-of-band, passes through byte-identical otherwise. Callers register
//     the padded COPY with the provider and leave the stored original untouched
//     (so the person sheet stays bar-free for OpenAI/UI).
//
// Out-of-band shapes are letterboxed with neutral padding into a safe band. The
// PRODUCT upload is intentionally NOT normalized: it never reaches CreateAsset,
// and padding bars would leak into the generated stills.
//
// Pure bytes-in / bytes-out (no DB, no storage) — mirrors lib/image/crop.ts.

import sharp from "sharp";
import { unprocessable } from "../errors.js";
import { createLogger } from "../log.js";

const log = createLogger("normalize");

// Beyond these, padding can't produce a usable face reference — reject.
const MIN_USABLE_ASPECT = 0.2;
const MAX_USABLE_ASPECT = 5.0;
// Pad into this band — comfortable margin inside BytePlus's 0.4–2.5 limits.
const MIN_SAFE_ASPECT = 0.5;
const MAX_SAFE_ASPECT = 2.0;
// BytePlus height limits are 300–6000; clamp with margin on both ends.
const MIN_HEIGHT = 300;
const UPSCALE_HEIGHT = 512;
const MAX_HEIGHT = 6000;
const DOWNSCALE_HEIGHT = 4096;
// Neutral letterbox fill — content-irrelevant for face extraction.
const PAD_BACKGROUND = { r: 128, g: 128, b: 128 };

export interface NormalizedImageResult {
  bytes: Uint8Array;
  mime: string;
  /** True when the image was padded/resized (and re-encoded as JPEG). */
  adjusted: boolean;
}

/** Post-rotate pixel dims of an image, or null when unreadable. */
async function readDims(
  img: sharp.Sharp,
): Promise<{ width: number; height: number } | null> {
  let meta: sharp.Metadata;
  try {
    meta = await img.metadata();
  } catch {
    return null;
  }
  // autoOrient dims reflect the post-rotate image; fall back to raw dims.
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) return null;
  return { width, height };
}

/**
 * Letterbox `img` (already `.rotate()`-d, with known dims) into the safe aspect
 * band + provider height window. Returns the original bytes byte-identical when
 * nothing needs changing; otherwise pads/clamps and re-encodes as JPEG. Pure
 * padding — never rejects (the upload guard checks for degenerate input first).
 */
async function padIntoBand(
  img: sharp.Sharp,
  bytes: Uint8Array,
  mime: string,
  width: number,
  height: number,
  opts: { forceJpeg?: boolean } = {},
): Promise<NormalizedImageResult> {
  const aspect = width / height;

  // Letterbox into the safe aspect band, centered.
  let outW = width;
  let outH = height;
  if (aspect < MIN_SAFE_ASPECT) {
    outW = Math.ceil(height * MIN_SAFE_ASPECT); // too tall/narrow → pad sides
  } else if (aspect > MAX_SAFE_ASPECT) {
    outH = Math.ceil(width / MAX_SAFE_ASPECT); // too wide → pad top/bottom
  }
  const padX = outW - width;
  const padY = outH - height;
  const needsPad = padX > 0 || padY > 0;
  if (needsPad) {
    img = img.extend({
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      background: PAD_BACKGROUND,
    });
  }

  // Clamp height into the provider's floor/ceiling (aspect preserved).
  const needsResize = outH < MIN_HEIGHT || outH > MAX_HEIGHT;
  if (needsResize) {
    img = img.resize({ height: outH < MIN_HEIGHT ? UPSCALE_HEIGHT : DOWNSCALE_HEIGHT });
  }

  if (!needsPad && !needsResize) {
    // Already in-band. Transcode to JPEG only when asked (the provider needs
    // JPEG, not the pipeline's WebP) and it isn't already JPEG.
    if (opts.forceJpeg && mime !== "image/jpeg") {
      const jpg = new Uint8Array(await img.jpeg({ quality: 92 }).toBuffer());
      return { bytes: jpg, mime: "image/jpeg", adjusted: true };
    }
    return { bytes, mime, adjusted: false };
  }

  const out = new Uint8Array(await img.jpeg({ quality: 92 }).toBuffer());
  log.info("✓ normalized image for provider aspect/height limits", {
    source: `${width}x${height}`,
    aspect: aspect.toFixed(3),
    padded: needsPad,
    resized: needsResize,
  });
  return { bytes: out, mime: "image/jpeg", adjusted: true };
}

/**
 * Make an uploaded person photo satisfy BytePlus `CreateAsset` limits.
 * Compliant images pass through byte-identical; out-of-band ones are padded
 * and/or height-clamped and re-encoded as JPEG. Throws a friendly 422
 * `ApiError` for unreadable or unusably-degenerate images — callers run this
 * BEFORE creating any run/project rows.
 */
export async function normalizePersonImage(
  bytes: Uint8Array,
  mime: string,
): Promise<NormalizedImageResult> {
  // .rotate() bakes EXIF orientation so width/height match the visual image
  // (a sideways phone photo would otherwise pad along the wrong axis).
  const img = sharp(Buffer.from(bytes)).rotate();
  const dims = await readDims(img);
  if (!dims) {
    throw unprocessable("We couldn't read that image. Please upload a different photo.");
  }

  const aspect = dims.width / dims.height;
  if (aspect < MIN_USABLE_ASPECT || aspect > MAX_USABLE_ASPECT) {
    throw unprocessable(
      "That person photo is too narrow or too wide to use. Please upload a standard portrait or landscape photo.",
    );
  }

  return padIntoBand(img, bytes, mime, dims.width, dims.height);
}

/**
 * Make a GENERATED image (invented person sheet, storyboard crop strip) satisfy
 * BytePlus `CreateAsset` aspect/height limits — the safety net the upload guard
 * provides for uploads. Non-throwing: pads when out-of-band, returns the bytes
 * byte-identical (and `adjusted: false`) when already compliant or unreadable.
 * Callers register the returned bytes with the provider and DO NOT overwrite the
 * stored original, so OpenAI references / the UI keep the un-padded image.
 */
export async function padToProviderAspect(
  bytes: Uint8Array,
  mime: string,
): Promise<NormalizedImageResult> {
  const img = sharp(Buffer.from(bytes)).rotate();
  const dims = await readDims(img);
  if (!dims) return { bytes, mime, adjusted: false };
  return padIntoBand(img, bytes, mime, dims.width, dims.height);
}

/**
 * Make a GENERATED image safe to hand to BytePlus/Seedance as a reference: same
 * aspect/height letterboxing as `padToProviderAspect`, but ALWAYS emits JPEG —
 * Seedance and `CreateAsset` don't accept the pipeline's 4K WebP sheets.
 * Already-JPEG, in-band images pass through byte-identical (`adjusted: false`).
 * Non-throwing; callers upload the returned bytes as a PROVIDER-ONLY copy and
 * leave the stored WebP original (OpenAI reference + UI) untouched.
 */
export async function toProviderImage(
  bytes: Uint8Array,
  mime: string,
): Promise<NormalizedImageResult> {
  const img = sharp(Buffer.from(bytes)).rotate();
  const dims = await readDims(img);
  if (!dims) return { bytes, mime, adjusted: false };
  return padIntoBand(img, bytes, mime, dims.width, dims.height, {
    forceJpeg: true,
  });
}
