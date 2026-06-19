// ── Unboxing ad type. ───────────────────────────────────────────────────────
// A packaging reveal plus first-impressions reaction, phone-captured. NET-NEW
// type (no legacyMapping) on the shared `ugc_authentic` look base. The TYPE-driven
// seams are authored for the unboxing beat (sealed box → open → reveal → react);
// the LOOK-driven seams defer to the shared phone-captured base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-unboxing/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const unboxing: AdTypeDef = {
  id: "unboxing",
  displayName: "Unboxing",
  description:
    "A packaging reveal plus first-impressions reaction — sealed box/bag opened on camera, the product lifted out and shown, with genuine in-the-moment delight ('unboxing', 'what is inside', 'just arrived'). Phone-captured. Differs from testimonial (a considered review, not a live reveal) and demo (a feature walkthrough, not the open-the-package moment).",
  whenToUse: "awareness|consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the payoff of the reveal so it must be present; a person's hands/reaction add credibility but the unbox can play on hands and product alone.",
  },
  lookFamily: "ugc_authentic",
  defaultHooks: ["curiosity-gap", "demonstration"],
  allowedHooks: [
    "curiosity-gap",
    "demonstration",
    "pattern-interrupt",
    "social-proof",
    "bold-claim",
    "relatable-scenario",
  ],

  fragments: buildFragments("unboxing", "ugc_authentic"),
};
