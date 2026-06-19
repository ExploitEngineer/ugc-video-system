// ── Ad type: Product Showcase (NET-NEW, no legacy mapping). ──────────────────
// Hero/glamour treatment — the product is the subject, shown off as static beauty
// + features/benefits with NO narrative arc and NO step-by-step in-use function.
// LOOK-driven seams defer to the shared `demo_clean` base (clean studio/tabletop
// product photography). TYPE-driven seams are authored here, concise + on-brand.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-product-showcase/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const productShowcase: AdTypeDef = {
  id: "product-showcase",
  displayName: "Product Showcase",
  description:
    "Hero/glamour shots of the product showing it off — static beauty plus features/benefits, with NO narrative and NO step-by-step. Differs from product-demo (no visible in-use function) and lifestyle (isolated hero, not product in a human context).",
  whenToUse: "consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the subject and cannot be skipped; a person is at most a background prop, so person stays optional.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["bold-claim", "curiosity-gap", "stat-shock"],
  allowedHooks: [
    "bold-claim",
    "curiosity-gap",
    "stat-shock",
    "pattern-interrupt",
    "question",
    "before-after",
    "demonstration",
    "unexpected-comparison",
    "social-proof",
  ],

  fragments: buildFragments("product-showcase", "demo_clean"),
};
