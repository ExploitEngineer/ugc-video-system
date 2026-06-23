// The ad-type registry. A plain `Record<string, AdTypeDef>` (NOT keyed by a
// closed union) plus `getAdType(id)` which:
//   - resolves the legacy persisted id "ugc" → "testimonial" so old runs keep
//     working unchanged ("inspirational" is now its own registered id),
//   - falls back to a default def when the id is unknown, so widening the type
//     set never crashes a lookup and never requires an exhaustive switch.

import type { AdTypeDef } from "./types.js";

import { testimonial } from "./defs/testimonial.js";
import { brandStory } from "./defs/brand-story.js";
import { inspirational } from "./defs/inspirational.js";
import { productShowcase } from "./defs/product-showcase.js";
import { productDemo } from "./defs/product-demo.js";
import { beforeAfter } from "./defs/before-after.js";
import { comparison } from "./defs/comparison.js";
import { unboxing } from "./defs/unboxing.js";
import { lifestyle } from "./defs/lifestyle.js";
import { problemAgitateSolve } from "./defs/problem-agitate-solve.js";
import { founderPov } from "./defs/founder-pov.js";
import { spokesperson } from "./defs/spokesperson.js";
import { socialProof } from "./defs/social-proof.js";
import { explainer } from "./defs/explainer.js";
import { promoOffer } from "./defs/promo-offer.js";
import { announcement } from "./defs/announcement.js";
import { brandAwareness } from "./defs/brand-awareness.js";
// Adding a type = one import + one REGISTRY entry below. Purely additive.

// The open ad-type id schema lives in @ugc/shared (the `errorCode` precedent) so
// the wire boundary (routes) and this registry share ONE source of truth. We
// re-export it here for ad-type callers; do NOT define a second copy.
export { adTypeIdSchema } from "@ugc/shared";

// ---------------------------------------------------------------------------
// Registry map. OPEN: keyed by string, not by a union of ids.
// ---------------------------------------------------------------------------
const ALL_DEFS: AdTypeDef[] = [
  testimonial, // legacyMapping: "ugc"
  brandStory,
  inspirational, // legacyMapping: "inspirational"
  productShowcase,
  productDemo,
  beforeAfter,
  comparison,
  unboxing,
  lifestyle,
  problemAgitateSolve,
  founderPov,
  spokesperson,
  socialProof,
  explainer,
  promoOffer,
  announcement,
  brandAwareness,
];

export const REGISTRY: Readonly<Record<string, AdTypeDef>> = Object.freeze(
  Object.fromEntries(ALL_DEFS.map((d) => [d.id, d])),
);

// The default the lookup falls back to for unknown ids. `brand-story` is a
// permissive filmed type (product optional, person optional), so an unrecognised
// id degrades to a safe open-ended treatment rather than a product- or
// person-required one.
export const FALLBACK_AD_TYPE_ID = "brand-story";

// Legacy persisted values → current ids. Applied before lookup so existing
// `runs.ad_type` rows written as "ugc" still resolve. "inspirational" is now a
// real registered id (its own def), so it needs no alias — old rows written as
// "inspirational" resolve straight to the inspirational def.
const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  ugc: "testimonial",
};

/**
 * Resolve an ad-type id to its def.
 *  - applies legacy aliases first,
 *  - returns the matching def,
 *  - falls back to FALLBACK_AD_TYPE_ID (with a warning) for unknown ids.
 * Never throws (unless the fallback itself is unregistered — a config bug).
 */
export function getAdType(id: string): AdTypeDef {
  const canonical = LEGACY_ALIASES[id] ?? id;
  const def = REGISTRY[canonical];
  if (def) return def;

  // Unknown id — widen-safe fallback. Logged so detector drift is visible.
  console.warn(
    `[ad-types] unknown adType "${id}" (canonical "${canonical}") — falling back to "${FALLBACK_AD_TYPE_ID}"`,
  );
  const fallback = REGISTRY[FALLBACK_AD_TYPE_ID];
  if (!fallback) {
    throw new Error(
      `[ad-types] fallback type "${FALLBACK_AD_TYPE_ID}" is not registered`,
    );
  }
  return fallback;
}

/** True when `id` (or its legacy alias) resolves to a registered def. */
export const isKnownAdType = (id: string): boolean => {
  const canonical = LEGACY_ALIASES[id] ?? id;
  return canonical in REGISTRY;
};

/** All registered canonical ids (not the legacy aliases). */
export const allAdTypeIds = (): string[] => Object.keys(REGISTRY);

// NOTE: do NOT introduce `Record<AdType, …>` anywhere downstream. If you need a
// per-type table, key it on `string` and route the lookup through getAdType, or
// push the variation down to LookStrategy (closed Record<LookFamily, …>) /
// per-def fragments.
