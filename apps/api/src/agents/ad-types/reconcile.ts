// Deterministic post-detection safety net (research/02 §4–5). The LLM detector
// proposes; these pure functions DECIDE. They snap a possibly-wrong adType to a
// known id, apply the coarse confidence gate, downgrade product-required types
// when no product was uploaded (look-preserving), synthesize-not-downgrade for
// person-required types, and resolve the final hook selection against the final
// type + ground-truth uploads. No LLM calls — fully unit-testable.

import { allAdTypeIds, getAdType, isKnownAdType } from "./registry.js";
import type { AssetRequirement, HookSelection } from "./types.js";
import { resolveHooks } from "./hooks/compose.js";

/** Confidence below this falls back to the asset-implied default (coarse gate, not a probability). */
export const CONFIDENCE_FLOOR = 0.55;

/** The always-buildable default for an empty/garbage classification. With a
 *  product, the product-led demo; with NO uploads, the service skit (the
 *  no-upload default — the synthesized cast carries it). */
export function assetImpliedDefault(hasProduct: boolean): string {
  return hasProduct ? "product-demo" : "service";
}

// ── adType clamp ────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Snap a raw detector adType to a usable id: exact/alias → normalized kebab →
 * nearest registered id by edit distance ≤2 → asset-implied default. Returns a
 * canonical id (may not yet be REGISTERED — Chunk H grows the registry — but
 * `getAdType` resolves any id safely via its fallback).
 */
export function clampAdType(raw: string, hasProduct: boolean): string {
  const id = (raw ?? "").trim().toLowerCase();
  if (!id) return assetImpliedDefault(hasProduct);
  if (isKnownAdType(id)) return getAdType(id).id; // exact or legacy alias → canonical
  const kebab = id.replace(/[\s_]+/g, "-");
  if (isKnownAdType(kebab)) return getAdType(kebab).id;
  let best: { id: string; dist: number } | null = null;
  for (const candidate of allAdTypeIds()) {
    const dist = levenshtein(kebab, candidate);
    if (!best || dist < best.dist) best = { id: candidate, dist };
  }
  if (best && best.dist <= 2) return best.id;
  return assetImpliedDefault(hasProduct);
}

// ── asset compatibility + confidence gate ───────────────────────────────────

const requires = (r: AssetRequirement): boolean => r === "required";

/** True when a type's required assets are all available (uploaded). */
export function assetCompatible(
  typeId: string,
  hasProduct: boolean,
  hasPerson: boolean,
): boolean {
  const p = getAdType(typeId).assetPolicy;
  if (requires(p.product) && !hasProduct) return false;
  if (requires(p.person) && !hasPerson) return false;
  return true;
}

/**
 * Coarse confidence gate: under the floor, fall back to the asset-implied
 * default UNLESS the low-confidence pick is itself asset-compatible AND shares
 * the default's look family (a low-confidence choice between two valid look
 * neighbours is not dangerous).
 */
export function confidenceGate(
  adType: string,
  confidence: number,
  hasProduct: boolean,
  hasPerson: boolean,
): string {
  if (confidence >= CONFIDENCE_FLOOR) return adType;
  const fallback = assetImpliedDefault(hasProduct);
  if (adType === fallback) return adType;
  const sameLook =
    getAdType(adType).lookFamily === getAdType(fallback).lookFamily;
  if (sameLook && assetCompatible(adType, hasProduct, hasPerson)) return adType;
  return fallback;
}

// ── product-required downgrade (look-preserving, terminal brand-awareness) ───

// Look-preserving downgrade when a product-required type has no product upload.
// Only the surviving core types appear here (ad-gen refactor). `founder-pov` is
// person-led (no product needed); `brand-story` is the terminal neither-required
// safe default (also FALLBACK_AD_TYPE_ID).
const DOWNGRADE_CHAIN: Readonly<Record<string, readonly string[]>> = {
  // UGC needs a product AND a person; with no product, keep a person-led
  // treatment first, then the open cinematic default.
  testimonial: ["founder-pov", "brand-story"],
  "product-demo": ["lifestyle", "brand-story"],
};

export function downgradeTarget(
  type: string,
  hasProduct: boolean,
  hasPerson: boolean,
): string {
  const chain = DOWNGRADE_CHAIN[type] ?? [];
  for (const t of chain) if (assetCompatible(t, hasProduct, hasPerson)) return t;
  return "brand-story"; // terminal neither-required default (= FALLBACK_AD_TYPE_ID)
}

// ── hooks ───────────────────────────────────────────────────────────────────

/** Resolve raw detected hook ids against the FINAL type + ground-truth uploads. */
export function clampHooks(
  typeId: string,
  detectedHookIds: string[],
  hasProduct: boolean,
  hasPerson: boolean,
): HookSelection {
  return resolveHooks(getAdType(typeId), detectedHookIds, {
    hasProduct,
    hasPerson,
  });
}

// ── reconcile (the whole post-parse pass) ───────────────────────────────────

export interface RawPlan {
  adType: string;
  hooks: string[]; // detected hook ids
  confidence: number;
}

export interface ReconciledPlan {
  adType: string; // final, post-clamp/gate/downgrade
  hooks: HookSelection; // resolved against the final type
  synthesizePerson: boolean; // person required but none uploaded
}

/**
 * The deterministic reconciliation pass (worker, post-parse):
 *  1. clamp + confidence gate
 *  2. person-required + no person → synthesize (NOT downgrade)
 *  3. product-required + no product → look-preserving downgrade
 *  4. re-resolve hooks against the final type + ground truth
 */
export function reconcile(
  plan: RawPlan,
  hasProduct: boolean,
  hasPerson: boolean,
): ReconciledPlan {
  let type = clampAdType(plan.adType, hasProduct);
  type = confidenceGate(type, plan.confidence, hasProduct, hasPerson);
  let def = getAdType(type);

  let synthesizePerson = requires(def.assetPolicy.person) && !hasPerson;

  if (requires(def.assetPolicy.product) && !hasProduct) {
    type = downgradeTarget(type, hasProduct, hasPerson);
    def = getAdType(type);
    synthesizePerson = requires(def.assetPolicy.person) && !hasPerson;
  }

  // Hooks resolve against EFFECTIVE presence: a synthesized person makes
  // person-only hooks (testimonial/confession) valid again (research/02 §5,
  // the founder-pov "confession kept" example).
  const effectivePerson = hasPerson || synthesizePerson;
  const hooks = clampHooks(type, plan.hooks, hasProduct, effectivePerson);
  return { adType: type, hooks, synthesizePerson };
}
