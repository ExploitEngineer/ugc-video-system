// ── Brand Awareness / Manifesto (graphic_text, NET-NEW) ─────────────────────
// A pure slogan/manifesto/value statement in kinetic typography — the CANONICAL
// no-product, no-person type. The words and motion carry the WHOLE ad; nothing
// is filmed. LOOK-driven seams defer to the shared graphic_text base; TYPE-driven
// seams are authored to this typographic, VO-led manifesto type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-brand-awareness/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const brandAwareness: AdTypeDef = {
  id: "brand-awareness",
  displayName: "Brand Awareness / Manifesto",
  description:
    "A pure slogan/manifesto/value statement rendered in kinetic typography — the CANONICAL no-product, no-person type, where words and motion graphics carry the whole ad. Differs from brand-story (filmed cinematic scenes with a narrative arc, not text-led) and social-proof (external ratings/quotes/logos, not the brand's own values message).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The brand's words and motion typography carry the entire ad; a product cut-out or a face may flash as a supporting accent, but the manifesto stands on type alone with neither asset present.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["pattern-interrupt", "contrarian"],
  allowedHooks: [
    "pattern-interrupt",
    "contrarian",
    "curiosity-gap",
    "question",
    "stat-shock",
    "bold-claim",
    "unexpected-comparison",
    "direct-callout",
  ],

  fragments: buildFragments("brand-awareness", "graphic_text"),
};
