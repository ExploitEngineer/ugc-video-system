// Upload-time normalization for the user's PERSON photo — the one uploaded
// image that reaches BytePlus `CreateAsset` (the face-asset path), which
// rejects anything outside aspect ratio 0.4–2.5 (w:h) or height 300–6000px
// (`InvalidParameter.AspectRatioTooSmall/Large`). Fixing the image ONCE at
// upload makes every downstream consumer compliant: the stored `person_upload`
// feeds both the OpenAI person-sheet reference and the face asset.
//
// Out-of-band shapes are letterboxed with neutral padding into a safe band
// (the face asset only needs the face, and the person sheet is regenerated
// anyway, so bars carry no downstream cost); truly degenerate strips are
// rejected with a friendly 422 — padding a 50×2000 sliver would leave a face
// too small for detection regardless. The PRODUCT upload is intentionally NOT
// normalized: it never reaches CreateAsset, and padding bars would leak into
// the generated stills.
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
  let img = sharp(Buffer.from(bytes)).rotate();
  let meta: sharp.Metadata;
  try {
    meta = await img.metadata();
  } catch {
    throw unprocessable("We couldn't read that image. Please upload a different photo.");
  }
  // autoOrient dims reflect the post-rotate image; fall back to raw dims.
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) {
    throw unprocessable("We couldn't read that image. Please upload a different photo.");
  }

  const aspect = width / height;
  if (aspect < MIN_USABLE_ASPECT || aspect > MAX_USABLE_ASPECT) {
    throw unprocessable(
      "That person photo is too narrow or too wide to use. Please upload a standard portrait or landscape photo.",
    );
  }

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
    return { bytes, mime, adjusted: false };
  }

  const out = new Uint8Array(await img.jpeg({ quality: 92 }).toBuffer());
  log.info("✓ normalized person upload for provider limits", {
    source: `${width}x${height}`,
    aspect: aspect.toFixed(3),
    padded: needsPad,
    resized: needsResize,
  });
  return { bytes: out, mime: "image/jpeg", adjusted: true };
}
