// apps/api/src/agents/ad-types/hooks/compose.ts
//
// Hook composition. Two jobs:
//   1. resolveHooks() — turn the detector's raw hook ids into a clean
//      HookSelection (<=2 hooks; exactly one visual_lead, optional one overlay)
//      obeying the asset guardrail, the mutually-exclusive sets, and precedence.
//   2. hookOpening() — turn a resolved HookSelection into the two splice points:
//      the storyboard scene-1 directive lines and the video first-time-slice
//      directive lines. These layer ON TOP of the ad-type fragments — there is
//      NO type×hook matrix; the hook just contributes its openingDirective.
//
// Everything returns RAW string[] (callers join).

import type { AdTypeDef, HookSelection, ResolvedHook } from "../types";
import { getHook, hasHook, hookDefaultRole, type HookDef } from "./registry";

// Mutually-exclusive sets — the detector/resolver must collapse each to ONE.
const EXCLUSIVE_SETS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["testimonial", "social-proof"]), // one person vs aggregate proof
  new Set(["testimonial", "confession"]), // only one first spoken line
  new Set(["problem-solution", "negativity-bias"]), // empathetic vs accusatory
  new Set(["problem-solution", "demonstration"]), // hide-then-reveal vs show-now
  new Set(["bold-claim", "contrarian"]), // two big-statement openings
];

interface ResolveOpts {
  hasProduct: boolean;
  hasPerson: boolean;
  /** Detector confidence per hook id (0..1), used as a precedence tie-breaker. */
  confidence?: Record<string, number>;
}

/**
 * Resolve raw detected hook ids into a HookSelection.
 *
 * Order of operations:
 *   a. drop unknown ids and ids not in the type's allowedHooks
 *   b. asset guardrail: strip person-only / product-only hooks the run can't support
 *   c. collapse each mutually-exclusive set to a single id (precedence below)
 *   d. rank by precedence and take the top 2
 *   e. assign roles: top survivor is visual_lead; a compatible 2nd becomes overlay
 *
 * Precedence (highest first): in defaultHooks > higher confidence > visual_lead.
 */
export function resolveHooks(
  def: AdTypeDef,
  detected: string[],
  opts: ResolveOpts,
): HookSelection {
  const conf = opts.confidence ?? {};
  const allowed = new Set(def.allowedHooks);
  const isDefault = new Set(def.defaultHooks);

  // a. keep only known, allowed ids (dedupe, preserve order)
  let ids = uniq(detected).filter((id) => hasHook(id) && allowed.has(id));

  // b. asset guardrail
  ids = ids.filter((id) => {
    const h = getHook(id);
    if (!opts.hasPerson && !h.worksWithoutPerson) return false; // e.g. testimonial/confession w/o person
    if (!opts.hasProduct && !h.worksWithoutProduct) return false; // e.g. demonstration w/o product
    return true;
  });

  // precedence comparator (higher = better)
  const score = (id: string): number => {
    let s = 0;
    if (isDefault.has(id)) s += 100; // prefer a default
    s += (conf[id] ?? 0) * 10; // then confidence
    if (hookDefaultRole(id) === "visual_lead") s += 1; // tie-break: visual-lead
    return s;
  };

  // c. collapse mutually-exclusive sets — keep the higher-scoring member
  for (const set of EXCLUSIVE_SETS) {
    const present = ids.filter((id) => set.has(id));
    if (present.length > 1) {
      const keep = present.reduce((a, b) => (score(b) > score(a) ? b : a));
      ids = ids.filter((id) => !set.has(id) || id === keep);
    }
  }

  // d. rank, take top 2
  ids = [...ids].sort((a, b) => score(b) - score(a)).slice(0, 2);

  // e. assign roles. Exactly one visual_lead; optional one overlay. Two
  //    visual-leads are never combined — if both top hooks are visual-leads,
  //    promote pattern-interrupt-style flexibility: keep the stronger as
  //    visual_lead and DROP the second (can't have two first frames).
  if (ids.length === 0) {
    // Fallback: first asset-compatible default for this type.
    const fallback = pickFallbackDefault(def, opts);
    return {
      visualLead: toResolved(getHook(fallback), "visual_lead"),
      overlay: null,
    };
  }

  const first = getHook(ids[0]);
  if (ids.length === 1) {
    // a lone surviving hook always owns the first frame, whatever its default role
    return { visualLead: toResolved(first, "visual_lead"), overlay: null };
  }

  const second = getHook(ids[1]);
  const firstRole = hookDefaultRole(first.id);
  const secondRole = hookDefaultRole(second.id);

  if (firstRole === "visual_lead" && secondRole === "visual_lead") {
    // two visual-leads — drop the weaker (already sorted, so drop second)
    return { visualLead: toResolved(first, "visual_lead"), overlay: null };
  }

  // normalise to (visual_lead, overlay) ordering regardless of which sorted first
  const lead = firstRole === "visual_lead" ? first : second;
  const over = lead === first ? second : first;
  return {
    visualLead: toResolved(lead, "visual_lead"),
    overlay: toResolved(over, "overlay"),
  };
}

/**
 * Produce the two opening splice points from a resolved selection.
 * The visual_lead owns frame 1; the overlay (if any) layers a line/text on it.
 *
 * Returned arrays are spliced by the builders:
 *   - storyboardScene1 → into the scene-1 directive of the storyboard prompt
 *   - videoFirstSlice  → into the first time-slice of the video prompt
 */
export function hookOpening(sel: HookSelection): {
  storyboardScene1: string[];
  videoFirstSlice: string[];
} {
  const lines: string[] = [];
  lines.push(
    `HOOK (visual-lead — owns the first frame): ${sel.visualLead.openingDirective}`,
  );
  if (sel.overlay) {
    lines.push(
      `HOOK (overlay — a spoken line or on-screen text layered on that first frame, not a competing frame): ${sel.overlay.openingDirective}`,
    );
  }
  // Same opening directives feed both surfaces; the builders differ only in how
  // they consume them (storyboard scene-1 vs video first slice).
  return { storyboardScene1: [...lines], videoFirstSlice: [...lines] };
}

// --- helpers ---

const toResolved = (h: HookDef, role: ResolvedHook["role"]): ResolvedHook => ({
  id: h.id,
  role,
  openingDirective: h.openingDirective,
});

function pickFallbackDefault(def: AdTypeDef, opts: ResolveOpts): string {
  const compatible = def.defaultHooks.find((id) => {
    if (!hasHook(id)) return false;
    const h = getHook(id);
    if (!opts.hasPerson && !h.worksWithoutPerson) return false;
    if (!opts.hasProduct && !h.worksWithoutProduct) return false;
    return true;
  });
  // Every type has at least one asset-compatible default by construction; if the
  // catalog is mid-migration and none match, surface it.
  if (!compatible)
    throw new Error(`No asset-compatible default hook for ad type ${def.id}`);
  return compatible;
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];
