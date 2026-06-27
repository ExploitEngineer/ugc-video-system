// apps/api/src/agents/ad-types/registry.ts
//
// The ad-type registry. A plain `Record<string, AdTypeDef>` (NOT keyed by a
// closed union) plus `getAdType(id)` which:
//   - resolves legacy persisted ids ("ugc" → "testimonial",
//     "inspirational" → "brand-story") so old runs keep working unchanged,
//   - falls back to a default def when the id is unknown, so widening the type
//     set never crashes a lookup and never requires an exhaustive switch.

import { z } from "zod";
import type { AdTypeDef } from "./types";

import { testimonial } from "./defs/testimonial";
import { brandStory } from "./defs/brand-story";
// New types are registered by adding an import + a REGISTRY entry below. That is
// the ONLY edit adding a type requires in this file — purely additive.

// ---------------------------------------------------------------------------
// Registry map. OPEN: keyed by string, not by a union of ids.
// ---------------------------------------------------------------------------
const ALL_DEFS: AdTypeDef[] = [
  testimonial, // legacyMapping: "ugc"
  brandStory, // legacyMapping: "inspirational"
  // product-showcase, product-demo, social-proof, problem-agitate-solve,
  // before-after, comparison, unboxing, explainer, founder-pov, lifestyle,
  // promo-offer, announcement, brand-awareness, spokesperson — added one at a
  // time in migration phase 4.
];

export const REGISTRY: Readonly<Record<string, AdTypeDef>> = Object.freeze(
  Object.fromEntries(ALL_DEFS.map((d) => [d.id, d])),
);

// The default the lookup falls back to for unknown ids. `brand-story` is the
// most permissive filmed type (product optional, person optional) and is the
// home of legacy `inspirational`, so an unrecognised id degrades to the safest
// open-ended treatment rather than a product- or person-required one.
export const FALLBACK_AD_TYPE_ID = "brand-story";

// Legacy persisted values → current ids. Applied before lookup so existing
// `runs.ad_type` rows written as "ugc"/"inspirational" resolve correctly and
// behaviour stays byte-identical for them.
const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  ugc: "testimonial",
  inspirational: "brand-story",
};

/**
 * Resolve an ad-type id to its def.
 *  - applies legacy aliases first,
 *  - returns the matching def,
 *  - falls back to FALLBACK_AD_TYPE_ID (with a warning) for unknown ids.
 * Never throws; never requires the id set to be exhaustive.
 */
export function getAdType(id: string): AdTypeDef {
  const canonical = LEGACY_ALIASES[id] ?? id;
  const def = REGISTRY[canonical];
  if (def) return def;

  // Unknown id — widen-safe fallback. Logged so detector drift is visible.
  // eslint-disable-next-line no-console
  console.warn(
    `[ad-types] unknown adType "${id}" (canonical "${canonical}") — falling back to "${FALLBACK_AD_TYPE_ID}"`,
  );
  const fallback = REGISTRY[FALLBACK_AD_TYPE_ID];
  if (!fallback) {
    // Registry misconfiguration: the fallback itself is missing.
    throw new Error(
      `[ad-types] fallback type "${FALLBACK_AD_TYPE_ID}" is not registered`,
    );
  }
  return fallback;
}

export const isKnownAdType = (id: string): boolean => {
  const canonical = LEGACY_ALIASES[id] ?? id;
  return canonical in REGISTRY;
};

export const allAdTypeIds = (): string[] => Object.keys(REGISTRY);

// ---------------------------------------------------------------------------
// Wire-boundary validation. Like `runErrorCode`, `adType` is stored as plain
// text and validated as an OPEN string — NOT z.enum — so adding a type needs no
// DB migration and no schema change here.
//
// We validate shape (non-empty kebab-case), not membership: an id we don't
// recognise is accepted at the boundary and handled by getAdType's fallback,
// rather than rejected. (Use isKnownAdType for soft telemetry/UX, not hard
// validation.)
// ---------------------------------------------------------------------------
export const adTypeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "adType must be a kebab-case id");

// NOTE: do NOT introduce `Record<AdType, …>` anywhere downstream. If you need a
// per-type table, key it on `string` and route the lookup through getAdType, or
// push the variation down to LookStrategy (closed Record<LookFamily, …>) /
// per-def fragments.
