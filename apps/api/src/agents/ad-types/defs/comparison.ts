// ── Comparison (Us-vs-Them) ad type. ────────────────────────────────────────
// NET-NEW type (no legacy mapping). Side-by-side contrast of the product against
// a GENERIC alternative — never a named/depicted real competitor brand or logo.
// LOOK-driven seams defer to the shared `demo_clean` base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-comparison/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const comparison: AdTypeDef = {
  id: "comparison",
  displayName: "Comparison (Us-vs-Them)",
  description:
    "Side-by-side contrast positioning the product against a generic alternative or 'the old way' ('vs', 'better than', 'don't settle for'), calling out a demonstrable advantage. Differs from before-after (two time states of one user, not a rival) and product-showcase (no contrast reference). Never names or depicts a real competitor brand.",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "Both the product and the contrast item drive the message; the comparison is often pure split-screen product graphics, so a presenter is optional.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["unexpected-comparison", "contrarian"],
  allowedHooks: [
    "unexpected-comparison",
    "contrarian",
    "stat-shock",
    "pattern-interrupt",
    "question",
    "negativity-bias",
    "demonstration",
    "before-after",
    "social-proof",
  ],

  fragments: buildFragments("comparison", "demo_clean"),
};
