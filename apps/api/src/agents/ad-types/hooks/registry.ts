// The HookDef catalog (7 cold-open hooks). A hook is an ad-type-AGNOSTIC opening
// device — a striking first 3-4 seconds — injected into scene 1 of the storyboard
// and the first time-slice of the video prompt, layered on top of the ad-type
// fragments with NO type×hook matrix.
//
// Curated in the ad-gen refactor (docs/refactor-tickets.md) down from the original
// 16 to short COLD-OPEN VISUAL devices only; the structural/copy overlays
// (social-proof, stat-shock, bold-claim, contrarian, direct-callout,
// unexpected-comparison, negativity-bias, question, demonstration, and the
// testimonial hook) were dropped.

import type { HookRole } from "../types.js";
import hookDefs from "./hook-defs.json" with { type: "json" };

export interface HookDef {
  id: string; // kebab-case, e.g. "problem-solution"
  displayName: string;
  psychPrinciple: string;
  description: string;
  /** Drop-in directive prose spliced into the opening. */
  openingDirective: string;
  scriptToneNote: string;
  fitsAdTypes: { good: string[]; clashes: string[] };
  policyNote?: string;
  worksWithoutProduct: boolean;
  worksWithoutPerson: boolean;
}

// Visual-lead hooks own the first frame/action; the lone overlay hook
// (curiosity-gap) layers a teasing spoken line on top of that frame. All
// cold-open devices are visual leads except the curiosity tease.
const VISUAL_LEAD_IDS = new Set<string>([
  "striking-visual",
  "pattern-interrupt",
  "problem-solution",
  "before-after",
  "relatable-scenario",
  "confession",
  // Service/B2B cold-opens — own the opening beat (a bold stat / a sharp question).
  "stat",
  "question",
]);

export const hookDefaultRole = (id: string): HookRole =>
  VISUAL_LEAD_IDS.has(id) ? "visual_lead" : "overlay";

const HOOKS = hookDefs as HookDef[];

const BY_ID: ReadonlyMap<string, HookDef> = new Map(
  HOOKS.map((h) => [h.id, h]),
);

// Catalog integrity: no duplicate ids (the Map would silently drop a collision).
if (BY_ID.size !== HOOKS.length) {
  throw new Error(
    `[hooks] duplicate hook id in hook-defs.json (${HOOKS.length} entries, ${BY_ID.size} unique)`,
  );
}

/**
 * Look up a hook by id. Unlike `getAdType`, this does NOT fall back: an unknown
 * hook id means the detector emitted something not in the catalog, which is a
 * bug to surface, not paper over. Callers (compose.ts) drop unknown ids first.
 */
export const getHook = (id: string): HookDef => {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown hook id: ${id}`);
  return def;
};

export const hasHook = (id: string): boolean => BY_ID.has(id);

/** All canonical hook ids, in catalog order. */
export const allHookIds = (): string[] => HOOKS.map((h) => h.id);
