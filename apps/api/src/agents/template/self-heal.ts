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
