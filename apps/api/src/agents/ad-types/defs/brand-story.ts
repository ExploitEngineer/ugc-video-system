// ── Legacy `inspirational` lives here. ──────────────────────────────────────
// The formalised home of the legacy `inspirational` treatment. The fragment
// PROSE is the runtime source in the companion SKILL.md (loaded + parsed by
// skill-loader.ts); the verbatim legacy lines there keep the output
// BYTE-IDENTICAL (guarded by fragment-regression.test.ts). LOOK seams delegate to
// the cinematic_polished look base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/brand-story.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const brandStory: AdTypeDef = {
  id: "brand-story",
  displayName: "Brand Story",
  description:
    "Cinematic, emotionally-driven narrative about brand values, world, or a customer journey — polished mood piece with voiceover. Primary home of the legacy 'inspirational' type. Differs from founder-pov (no named speaker required) and brand-awareness (graphics/text manifesto, not filmed scenes).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "An open cinematic scene can succeed with neither a clear product nor a presenter, though either may appear — mirrors the legacy 'inspirational' freedom.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["curiosity-gap", "pattern-interrupt"],
  allowedHooks: [
    "curiosity-gap",
    "pattern-interrupt",
    "question",
    "relatable-scenario",
    "bold-claim",
  ],
  legacyMapping: "inspirational",
  fragments: buildFragments("brand-story", "cinematic_polished"),
};
