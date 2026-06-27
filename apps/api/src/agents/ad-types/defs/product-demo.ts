// ── Product Demo (net-new ad type). ─────────────────────────────────────────
// Function-first ad: the product is SHOWN BEING USED, step by step, so the
// viewer understands how it works ("how it works", "in action", "watch it
// work"). NET-NEW — no legacy branch; TYPE-driven seams are authored to the
// demo_clean look (clean studio/tabletop product photography), LOOK-driven seams
// defer to the shared base. Differs from product-showcase (visible in-use
// function vs static hero glamour).
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/product-demo.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const productDemo: AdTypeDef = {
  id: "product-demo",
  displayName: "Product Demo",
  description:
    "Shows the product being used / how it works — function-first, step-by-step ('how it works', 'in action', 'watch it work'). The product-led catch-all: also covers hero showcase and unboxing. Hands or a presenter may operate it.",
  whenToUse: "consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the subject and must be shown working; hands or a presenter may operate it but are not required.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["problem-solution", "before-after"],
  allowedHooks: [
    "problem-solution",
    "before-after",
    "striking-visual",
    "pattern-interrupt",
    "curiosity-gap",
  ],
  // The product is the hero; no on-screen character by default (the user can
  // turn one On to add a presenter).
  characterDefault: false,
  fragments: buildFragments("product-demo", "demo_clean"),
};
