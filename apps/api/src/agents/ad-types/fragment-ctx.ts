// Shared builder for the `FragmentCtx` a prompt builder hands to the ad-type
// fragments. Pure data, no model calls. The legacy fragments don't read most of
// these fields, but populating them keeps new ad-type fragments (Chunk H) honest.

import type { FragmentCtx, HookSelection } from "./types.js";

export function buildFragmentCtx(p: {
  adStyle: string;
  productBrief?: string | null;
  personBrief?: string | null;
  hasProduct: boolean;
  hasPerson: boolean;
  hooks?: HookSelection;
  /** Target ad length in seconds (15/30/45/60); defaults to 15. */
  duration?: number;
  segmentIndex?: number | null;
  segmentCount?: number;
}): FragmentCtx {
  const dur =
    p.duration === 30 || p.duration === 45 || p.duration === 60
      ? p.duration
      : 15;
  return {
    adStyle: p.adStyle,
    productBrief: (p.productBrief ?? "").trim() || null,
    personBrief: (p.personBrief ?? "").trim() || null,
    hasProduct: p.hasProduct,
    hasPerson: p.hasPerson,
    hooks: p.hooks,
    duration: dur,
    segmentIndex: p.segmentIndex ?? null,
    segmentCount: p.segmentCount ?? 1,
  };
}
