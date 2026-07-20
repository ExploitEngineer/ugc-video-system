// ── Legacy `ugc` lives here. ────────────────────────────────────────────────
// This def is the formalised home of the legacy `adType === "ugc"` treatment.
// The fragment PROSE is the runtime source in the companion SKILL.md (loaded +
// parsed by skill-loader.ts); the verbatim legacy lines there keep the output
// BYTE-IDENTICAL (guarded by fragment-regression.test.ts). LOOK seams delegate to
// the ugc_authentic look base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/testimonial.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const testimonial: AdTypeDef = {
  id: "testimonial",
  displayName: "UGC / Testimonial",
  description:
    "A real person speaks to camera giving a first-person review/endorsement with an authentic, phone-captured feel. Home of the legacy 'ugc' type. Differs from founder-pov (a customer/creator, not the founder).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The credible human voice on camera is mandatory; the product is optional — held or shown when uploaded, otherwise a pure talking-head endorsement. Product is OPTIONAL (not required) so a no-product 'create a UGC ad' stays a talking testimonial instead of being downgraded to a voiceover type (matches the skill doc + research/00 edge case 1).",
  },
  lookFamily: "ugc_authentic",
  defaultHooks: ["confession", "relatable-scenario"],
  allowedHooks: [
    "confession",
    "relatable-scenario",
    "problem-solution",
    "before-after",
    "question",
    "curiosity-gap",
  ],
  // A UGC review is a person speaking to camera — a character leads by default.
  characterDefault: true,
  legacyMapping: "ugc",
  fragments: buildFragments("testimonial", "ugc_authentic"),
};
