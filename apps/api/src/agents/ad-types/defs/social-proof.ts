// ── Social Proof (graphic_text, NET-NEW) ────────────────────────────────────
// Aggregated third-party proof rendered as motion graphics — star ratings,
// review snippets, press logos, user counts. NO single presenter; the words and
// numbers carry every frame. LOOK-driven seams defer to the shared graphic_text
// base; TYPE-driven seams are authored to this kinetic-typography, VO-led type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/social-proof.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const socialProof: AdTypeDef = {
  id: "social-proof",
  displayName: "Social Proof",
  description:
    "Aggregated third-party proof rendered as motion graphics — star ratings, review snippets, press logos, user counts. NO single presenter. Differs from testimonial (one person's spoken first-person account, not aggregated graphics) and stat-shock (a single dramatic statistic, not a stacked wall of reviews/ratings/logos).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The proof (ratings, quotes, counts, press logos) carries the ad as kinetic typography; a product cut-out or face may appear as a supporting accent but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["social-proof", "stat-shock"],
  allowedHooks: [
    "social-proof",
    "stat-shock",
    "curiosity-gap",
    "question",
    "bold-claim",
    "before-after",
    "pattern-interrupt",
  ],

  fragments: buildFragments("social-proof", "graphic_text"),
};
