// Provider-safe reference-image normalization — shared by the normal video
// builder and the template video builder.
//
// Seedance's `CreateAsset` (and some content `image_url` paths) reject WebP and
// aspect ratios outside 0.4–2.5. This helper turns any stored reference URL into
// one the provider accepts, falling back to the raw URL on any hiccup so a
// normalization problem never masks the real generation error.

import type { AssetKind } from "@ugc/shared";

import { cleanSheet2x2, cleanSheetGrid, panelGrid } from "./image/crop.js";
import { padToProviderAspect } from "./image/normalize.js";
import { type Logger } from "./log.js";
import { uploadAsset } from "./storage.js";

/**
 * Make a Seedance-bound reference URL provider-safe: (1) transcode to JPEG — 4K
 * sheets are now WebP, which BytePlus `CreateAsset` rejects; (2) pad aspect
 * ratios outside 0.4–2.5 into band — generated sheets/strips (which skip the
 * upload normalizer) occasionally drift out and fail the run with
 * `AspectRatioTooSmall/Large`. Upload a PROVIDER-ONLY copy when either applies
 * (the stored original — reused as an OpenAI reference + shown in the UI — stays
 * untouched, small WebP); an already-JPEG in-band ref and any fetch/encode
 * hiccup fall back to the original URL unchanged.
 */
export async function providerSafeRefUrl(
  url: string,
  runId: string,
  kind: AssetKind,
  log: Logger,
): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/png";
    // forceJpeg: WebP sheets must become JPEG for CreateAsset (+ some content
    // image_url paths); padToProviderAspect also fixes any out-of-band aspect.
    const norm = await padToProviderAspect(bytes, mime, { forceJpeg: true });
    if (!norm.adjusted) return url;
    const { url: safeUrl } = await uploadAsset({
      runId,
      kind,
      bytes: norm.bytes,
      contentType: norm.mime,
    });
    log.info("uploaded provider-safe (jpeg) ref copy", { kind });
    return safeUrl;
  } catch (err) {
    // Never let a normalization hiccup mask the real generation — fall back to
    // the raw URL and let CreateAsset speak if it's genuinely out of band.
    log.warn("provider-safe ref normalization skipped", {
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    return url;
  }
}

/**
 * Build the provider-facing storyboard reference: crop a LABELLED sheet into a
 * CLEAN grid (no scene badges / caption bars / gridlines) so those baked
 * annotations can't leak into the rendered clip, then normalize + upload a
 * provider-only copy. The stored labelled sheet (the UI/review artifact) is
 * untouched. Any fetch/crop/encode hiccup falls back to the labelled sheet via
 * `providerSafeRefUrl`, so a crop failure never fails the run.
 *
 * Shared by the normal video builder (4-panel 2×2) and the template video
 * builder (one panel per beat, 2..6, near-square via `panelGrid`).
 */
export async function cleanStoryboardRefUrl(
  url: string,
  runId: string,
  log: Logger,
  panelCount = 4,
): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const raw = new Uint8Array(await res.arrayBuffer());
    // A template sheet has one panel per beat (2..6) in a near-square grid; the
    // normal 4-panel sheet keeps the proven 2×2 crop unchanged.
    const cleaned =
      panelCount === 4
        ? await cleanSheet2x2(raw)
        : await (async () => {
            const { rows, cols } = panelGrid(panelCount);
            return cleanSheetGrid(raw, rows, cols, panelCount);
          })();
    const norm = await padToProviderAspect(cleaned, "image/png", {
      forceJpeg: true,
    });
    const { url: safeUrl } = await uploadAsset({
      runId,
      kind: "storyboard_sheet",
      bytes: norm.bytes,
      contentType: norm.mime,
    });
    log.info("uploaded cleaned storyboard ref copy (badges/captions cropped)");
    return safeUrl;
  } catch (err) {
    log.warn("storyboard clean-crop skipped — using labelled sheet", {
      err: err instanceof Error ? err.message : String(err),
    });
    return providerSafeRefUrl(url, runId, "storyboard_sheet", log);
  }
}
