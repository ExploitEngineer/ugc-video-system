// Pure helpers for the self-healing template render.
//
// Nexrender aborts the WHOLE render job on the first layer it cannot resolve (a
// template with a duplicated layer name, or a name its text function can't reach
// through nested precomps) and exposes no per-asset "skip missing" flag. So the
// render loop reads the real failure reason, drops the named layer, and retries.
// Kept pure + free of I/O so the parse + drop are unit-testable without a
// Nexrender account.

import type { TemplateJobAssetInput } from "../../providers/template-render.js";

/**
 * The layer name in a Nexrender "couldn't find any layers by provided name (X)"
 * error, or null when the error is not a missing-layer error.
 *
 * Nexrender phrases it as: "Error: nexrender: Couldn't find any layers by
 * provided name (dynamic) inside a composition: *". A blank capture ("()") is
 * treated as no match — there is no layer to drop.
 */
export function parseMissingLayerName(
  error: string | undefined | null,
): string | null {
  if (!error) return null;
  const name = error.match(/provided name \(([^)]*)\)/i)?.[1]?.trim();
  return name ? name : null;
}

/**
 * Drop every asset that targets `layerName` — the text plus any media asset and
 * its paired `nx:layer-autoscale`, all of which carry the same `layerName`.
 */
export function dropAssetsByLayerName(
  assets: TemplateJobAssetInput[],
  layerName: string,
): TemplateJobAssetInput[] {
  return assets.filter((a) => a.layerName !== layerName);
}

/**
 * True when Nexrender refused an asset outright rather than failing to find a
 * layer:
 *
 *   "@nexrender/action-encode: assetRedefinition must include src, layerName,
 *    and filename"
 *
 * This is the error that kept generated stills switched off behind
 * `TEMPLATE_RENDER_INJECT_IMAGES`. It names no layer, so `parseMissingLayerName`
 * cannot help and the whole job dies — which is why the flag existed: the
 * alternative to "no stills" was "no render".
 */
export function isAssetRejectionError(error: string | undefined | null): boolean {
  return /assetRedefinition must include/i.test(error ?? "");
}

/**
 * Drop every generated still, plus any `nx:layer-autoscale` left with nothing to
 * scale. The render then completes with its video and text, and those slots keep
 * the template's own artwork — the same fallback an image slot whose generation
 * failed already takes.
 *
 * This is what makes injecting stills SAFE to attempt: a wrong guess about the
 * asset contract costs the stills, not the ad.
 */
export function dropImageAssets(
  assets: TemplateJobAssetInput[],
): TemplateJobAssetInput[] {
  const kept = assets.filter((a) => !(a.kind === "media" && a.mediaType === "image"));
  // An autoscale is meaningless without the media it follows, and a stale one
  // would rescale whatever placeholder is still sitting in the layer.
  const stillTargeted = new Set(
    kept.filter((a) => a.kind === "media").map((a) => a.layerName),
  );
  return kept.filter((a) => a.kind !== "autoscale" || stillTargeted.has(a.layerName));
}
