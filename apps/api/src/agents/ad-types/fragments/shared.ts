// Cross-type fragment helpers. Small, asset-aware building blocks that several
// ad-type defs reuse so a new def can lean on shared boilerplate instead of
// re-authoring it. Everything returns RAW string[] (callers join), consistent
// with the FragmentSet contract.

import type { FragmentCtx } from "../types.js";

export { lookBase } from "./looks.js";

/**
 * Generic speaker label derived from whether a person is on screen. Types whose
 * legacy/authored prose has no special wording can delegate `storyboardSpeakerLabel`
 * here; the two legacy defs keep their own verbatim string for byte-fidelity.
 */
export const assetSpeakerLabel = (ctx: FragmentCtx): string[] => [
  ctx.hasPerson ? "the on-screen person" : "the voiceover",
];

/**
 * Whether this fragment call is for the multi-segment master sheet (30/45/60s),
 * as opposed to the single 15s sheet. Lets a TYPE-driven fragment add
 * master-only emphasis without re-deriving it from segment counts.
 */
export const isMasterSheet = (ctx: FragmentCtx): boolean =>
  ctx.segmentCount > 1;
