// ── Before / After (Transformation) ─────────────────────────────────────────
// A product-led transformation ad: a visible contrast from a worse "before"
// state to an improved "after" result driven by the product. Rendered in the
// clean studio/tabletop demo look (no required presenter). TYPE-driven seams
// authored per this type; LOOK-driven seams delegate to the demo_clean base.
//
// META POLICY GUARD: for weight-loss / anti-aging / wrinkle verticals Meta
// PROHIBITS literal before/after split-screen and negative-self-perception
// framing — the typeBlock + treatment below forbid it and require positive,
// after-forward framing instead. Do not soften that guard when revising.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/before-after.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const beforeAfter: AdTypeDef = {
  id: "before-after",
  displayName: "Before / After (Transformation)",
  description:
    "A visible contrast from a worse 'before' state to an improved 'after' result/transformation achieved with the product. Differs from product-demo (a process/how-it-works, not a time-based result contrast) and comparison (contrast vs a rival product, not two time states of one subject).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product must visibly drive the change between states; a person is optional since many transformations are object/surface based (e.g. cleaning, restoration, organisation).",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["before-after", "problem-solution"],
  allowedHooks: [
    "before-after",
    "problem-solution",
    "curiosity-gap",
    "stat-shock",
    "negativity-bias",
    "demonstration",
    "pattern-interrupt",
  ],

  fragments: buildFragments("before-after", "demo_clean"),
};
