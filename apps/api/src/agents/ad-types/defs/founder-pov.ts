// ── Founder POV ad type. ────────────────────────────────────────────────────
// The FOUNDER tells their own first-person origin / mission story — an insider
// account ("I started this because…", "why we built…"), NOT a customer review.
// NET-NEW type: the TYPE-driven seams are authored here (no legacy verbatim
// source). LOOK-driven seams reuse the shared cinematic_polished base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-founder-pov/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const founderPov: AdTypeDef = {
  id: "founder-pov",
  displayName: "Founder POV",
  description:
    "The founder tells their first-person origin/mission story ('I started this', 'why we built it') — an insider, not a customer. Polished, VO-led, intimate-to-camera or over filmed scenes. Differs from testimonial (a customer/creator review) and spokesperson (a hired host reading a script).",
  whenToUse: "awareness|consideration",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The founder is the storyteller and credibility anchor, so a person is mandatory; the product they built may appear or only be referenced.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["confession", "problem-solution"],
  allowedHooks: [
    "confession",
    "problem-solution",
    "curiosity-gap",
    "contrarian",
    "direct-callout",
    "relatable-scenario",
    "question",
    "pattern-interrupt",
  ],

  fragments: buildFragments("founder-pov", "cinematic_polished"),
};
