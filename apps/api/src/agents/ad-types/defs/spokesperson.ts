// ── Spokesperson / VSL ──────────────────────────────────────────────────────
// A scripted host/presenter (incl. an AI avatar) delivers a polished, persuasive
// pitch straight to camera. This is the produced, sales-led cousin of the
// authentic testimonial: the speaker is performing a written script, not sharing
// an off-the-cuff peer review.
//
// TYPE-driven seams are authored for this presenter-led, conversion treatment;
// LOOK-driven seams defer to the shared cinematic_polished base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-spokesperson/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const spokesperson: AdTypeDef = {
  id: "spokesperson",
  displayName: "Spokesperson / VSL",
  description:
    "A scripted host/presenter (incl. an AI avatar) delivers a polished pitch straight to camera, leading the viewer through the offer toward an action. Differs from testimonial (an authentic peer giving an unscripted review, not a performed sales script) and brand-story (a cinematic mood piece, not a presenter-driven pitch).",
  whenToUse: "conversion",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The presenter delivering the scripted pitch to camera is the vehicle (a synthesized avatar if none is uploaded); the product is shown or referenced as the pitch demands.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["direct-callout", "question"],
  allowedHooks: [
    "direct-callout",
    "question",
    "problem-solution",
    "stat-shock",
    "social-proof",
    "bold-claim",
    "curiosity-gap",
  ],

  fragments: buildFragments("spokesperson", "cinematic_polished"),
};
