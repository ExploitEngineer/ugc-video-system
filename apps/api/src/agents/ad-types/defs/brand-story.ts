// ── Brand Story — structured cinematic brand narrative. ─────────────────────
// A cinematic narrative about brand values / origin / world, carried by
// voiceover over filmed scenes. The fragment PROSE is the runtime source in the
// companion SKILL.md (loaded + parsed by skill-loader.ts). Sibling of the
// `inspirational` type (an open evocative mood piece) — both cinematic_polished
// VO, distinguished by their detection cues. LOOK seams delegate to the
// cinematic_polished look base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/brand-story.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const brandStory: AdTypeDef = {
  id: "brand-story",
  displayName: "Brand Story",
  description:
    "Cinematic, emotionally-driven narrative about brand VALUES, origin, world, or a customer journey — a polished, structured mood piece with voiceover. Differs from inspirational (an open, evocative mood/feeling piece without a required through-story), founder-pov (no named speaker required) and brand-awareness (graphics/text manifesto, not filmed scenes).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "An open cinematic scene can succeed with neither a clear product nor a presenter, though either may appear.",
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
  fragments: buildFragments("brand-story", "cinematic_polished"),
};
