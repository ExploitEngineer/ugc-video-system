// ── Announcement (graphic_text, NET-NEW) ────────────────────────────────────
// A news/launch/restock reveal rendered as motion graphics — "introducing", "now
// available", "new", "we partnered". States WHAT is new without a price or
// urgency (that is promo-offer). NO single presenter; bold kinetic typography and
// a confident voiceover carry every frame. LOOK-driven seams defer to the shared
// graphic_text base; TYPE-driven seams are authored to this announcement type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/announcement.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const announcement: AdTypeDef = {
  id: "announcement",
  displayName: "Announcement",
  description:
    "A news/launch/restock reveal rendered as motion graphics — 'introducing', 'now available', 'new', 'we partnered'. States WHAT is new without a price or urgency. Differs from promo-offer (no deal, discount, code or deadline) and from product-showcase (a one-time NEWS beat, not an evergreen feature glamour reel).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The news itself carries the ad as kinetic typography; a clean product cut-out or a face may anchor the reveal as a supporting accent, but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["curiosity-gap", "pattern-interrupt"],
  allowedHooks: [
    "curiosity-gap",
    "pattern-interrupt",
    "stat-shock",
    "question",
    "bold-claim",
    "direct-callout",
  ],

  fragments: buildFragments("announcement", "graphic_text"),
};
