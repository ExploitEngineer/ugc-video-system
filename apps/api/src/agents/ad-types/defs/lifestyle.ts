// ── Lifestyle ad type. ──────────────────────────────────────────────────────
// Aspirational real-life use occasion: the product woven into a desirable
// everyday scene, shot like a polished commercial. NET-NEW type (no legacy
// mapping). TYPE-driven seams are authored here; LOOK-driven seams defer to the
// shared cinematic_polished base in fragments/looks.js.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/lifestyle.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const lifestyle: AdTypeDef = {
  id: "lifestyle",
  displayName: "Lifestyle",
  description:
    "Aspirational real-life use occasion — the product woven naturally into a desirable everyday scene, shot cinematically and carried by voiceover. Differs from testimonial (no one reviews to camera; the product just lives in the moment) and brand-story (a concrete product-in-use occasion, not an abstract values/mood piece).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the hero that must be seen in use; a person makes the occasion relatable but the scene can read aspirationally without one.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["relatable-scenario", "pattern-interrupt"],
  allowedHooks: [
    "relatable-scenario",
    "pattern-interrupt",
    "curiosity-gap",
    "direct-callout",
    "bold-claim",
  ],

  fragments: buildFragments("lifestyle", "cinematic_polished"),
};
