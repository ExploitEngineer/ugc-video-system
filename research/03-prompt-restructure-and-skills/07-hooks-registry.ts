// apps/api/src/agents/ad-types/hooks/registry.ts
//
// The HookDef catalog (16 hooks). A hook is an ad-type-AGNOSTIC opening fragment
// injected into scene 1 of the storyboard and the first time-slice of the video
// prompt — layered on top of the ad-type fragments, with NO type×hook matrix.
//
// The full 16-entry array is the paste-ready JSON from the hook-library research
// doc. Two entries are inlined below to show the shape; load the remaining 14
// from that JSON (kept as `hooks/hook-defs.json`, imported and validated once).

import type { HookRole } from "../types";

export interface HookDef {
  id: string; // kebab-case, e.g. "problem-solution"
  displayName: string;
  psychPrinciple: string;
  description: string;
  /** Drop-in directive prose spliced into the opening. */
  openingDirective: string;
  scriptToneNote: string;
  /** Whether this hook can own the first frame (visual_lead) or only layer on it (overlay). */
  defaultRole: HookRole;
  fitsAdTypes: { good: string[]; clashes: string[] };
  policyNote?: string;
  worksWithoutProduct: boolean;
  worksWithoutPerson: boolean;
}

// Visual-lead hooks own the first frame/action; overlay hooks layer a line/text
// on top. (pattern-interrupt can serve as either; catalogued as overlay default
// but eligible as a secondary visual-lead — handled in compose.ts.)
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

// --- Example inlined entries (full set lives in hook-defs.json) ---
const INLINE_HOOKS: HookDef[] = [
  {
    id: "problem-solution",
    displayName: "Problem–Solution (Pain-First)",
    psychPrinciple: "Loss aversion / problem recognition (Prospect Theory)",
    description:
      "Opens on the specific frustrating moment the product later resolves, shown before the product appears.",
    openingDirective:
      "Open on the exact frustrating moment the product solves — show the problem happening to the subject in close-up first, before the product is anywhere in frame. Hold on the friction for the first beat; do not reveal or name the product yet.",
    scriptToneNote:
      "First line names the pain in the viewer's own words ('Why won't this just…'), empathetic not salesy.",
    defaultRole: "visual_lead",
    fitsAdTypes: {
      good: [
        "product-demo",
        "problem-agitate-solve",
        "before-after",
        "testimonial",
        "founder-pov",
        "spokesperson",
      ],
      clashes: ["unboxing", "announcement", "brand-awareness", "brand-story"],
    },
    worksWithoutProduct: true,
    worksWithoutPerson: true,
  },
  {
    id: "stat-shock",
    displayName: "Shocking Stat",
    psychPrinciple: "Anchoring + surprise (credibility heuristic)",
    description:
      "Opens with a single surprising number that reframes the stakes and lends instant credibility.",
    openingDirective:
      "Open on one big number as bold on-screen text, held for the first beat (e.g., '90% of people [surprising fact]'). Make the figure the visual focus of frame 1; keep supporting words minimal.",
    scriptToneNote: "Read the number flatly and let it land before any pitch.",
    defaultRole: "overlay",
    fitsAdTypes: {
      good: ["social-proof", "promo-offer", "product-showcase"],
      clashes: ["brand-story", "lifestyle"],
    },
    worksWithoutProduct: true,
    worksWithoutPerson: true,
  },
  // … 14 more from hook-defs.json (pattern-interrupt, curiosity-gap, question,
  // bold-claim, contrarian, testimonial, social-proof, before-after,
  // demonstration, relatable-scenario, direct-callout, unexpected-comparison,
  // negativity-bias, confession).
];

// Build the lookup. In the real module, merge INLINE_HOOKS with the JSON import
// and assert no duplicate ids. Kept simple here.
const BY_ID: ReadonlyMap<string, HookDef> = new Map(
  INLINE_HOOKS.map((h) => [h.id, h]),
);

/**
 * Look up a hook by id. Unlike `getAdType`, this does NOT fall back: an unknown
 * hook id means the detector emitted something not in the catalog, which is a
 * bug to surface, not paper over. Callers (compose.ts) drop unknown ids before
 * this point.
 */
export const getHook = (id: string): HookDef => {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown hook id: ${id}`);
  return def;
};

export const hasHook = (id: string): boolean => BY_ID.has(id);
