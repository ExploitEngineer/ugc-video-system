// ── Reproduces the legacy `inspirational` treatment. ────────────────────────
// First-class `inspirational` ad type: an evocative, cinematic VOICEOVER mood
// piece (product + person both optional). Generation mirrors the pre-ad-types
// `inspirational` path — the runtime fragment PROSE lives in the companion
// SKILL.md (loaded + parsed by skill-loader.ts) and reuses the legacy lines, so
// a run typed `inspirational` produces the same cinematic-VO output it did
// before the ad-type registry existed. LOOK seams delegate to the
// cinematic_polished look base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/inspirational.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const inspirational: AdTypeDef = {
  id: "inspirational",
  displayName: "Inspirational",
  description:
    "An evocative, cinematic mood piece that follows the feeling or journey the user describes, carried by voiceover over filmed scenes — product and person BOTH optional. Differs from brand-story (a structured narrative about brand values/origin/world).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "An open evocative cinematic scene can succeed with neither a clear product nor a presenter, though either may appear — the legacy `inspirational` freedom.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["striking-visual", "pattern-interrupt"],
  allowedHooks: [
    "striking-visual",
    "pattern-interrupt",
    "curiosity-gap",
    "relatable-scenario",
  ],
  characterDefault: true,
  legacyMapping: "inspirational",
  fragments: buildFragments("inspirational", "cinematic_polished"),
};
