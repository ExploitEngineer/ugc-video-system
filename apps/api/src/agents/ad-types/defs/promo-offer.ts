// ── Promo / Offer (graphic_text, NET-NEW) ───────────────────────────────────
// A price/discount/urgency push with a hard call-to-action — "% off", "BOGO",
// "sale ends", "use code". Rendered as bold motion graphics: the deal terms and
// the CTA ARE the frame; no live presenter. LOOK-driven seams defer to the shared
// graphic_text base; TYPE-driven seams are authored to this offer-led, VO type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-promo-offer/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const promoOffer: AdTypeDef = {
  id: "promo-offer",
  displayName: "Promo / Offer",
  description:
    "A price/discount/urgency push with a hard call-to-action rendered as motion graphics — '% off', 'BOGO', 'sale ends Sunday', 'use code SAVE20'. The deal terms and the CTA carry every frame; no live presenter. Differs from announcement (announces news WITHOUT a deal — a launch or update, no price/discount/urgency) and social-proof (stacks ratings/reviews, not an offer + CTA).",
  whenToUse: "conversion",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The deal terms and CTA carry the ad as kinetic typography; a product cut-out or face may appear as a supporting accent, but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["direct-callout", "stat-shock"],
  allowedHooks: [
    "direct-callout",
    "stat-shock",
    "negativity-bias",
    "pattern-interrupt",
    "bold-claim",
    "social-proof",
  ],

  fragments: buildFragments("promo-offer", "graphic_text"),
};
