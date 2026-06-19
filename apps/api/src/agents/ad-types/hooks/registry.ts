// The HookDef catalog (16 hooks). A hook is an ad-type-AGNOSTIC opening fragment
// injected into scene 1 of the storyboard and the first time-slice of the video
// prompt — layered on top of the ad-type fragments, with NO type×hook matrix.
//
// The 16 entries are the paste-ready JSON from the hook-library research doc,
// loaded once and validated for shape + no duplicate ids.

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

// Visual-lead hooks own the first frame/action; overlay hooks layer a line/text
// on top. (pattern-interrupt is catalogued as overlay default but is eligible as
// a secondary visual-lead — handled in compose.ts.) Source: research/01 rule 2.
const VISUAL_LEAD_IDS = new Set<string>([
  "problem-solution",
  "demonstration",
  "before-after",
  "testimonial",
  "confession",
  "relatable-scenario",
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

/** All 16 canonical hook ids, in catalog order. */
export const allHookIds = (): string[] => HOOKS.map((h) => h.id);
