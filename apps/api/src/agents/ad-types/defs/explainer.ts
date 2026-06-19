// ── Explainer (graphic_text, NET-NEW) ───────────────────────────────────────
// An educational breakdown — "here's how it works", "the science", "why X
// matters" — rendered as motion graphics / kinetic typography with voiceover.
// NO live presenter and no real product footage required; the explanation, laid
// out as designed type, diagrams and animated steps, carries every frame.
// LOOK-driven seams defer to the shared graphic_text base; TYPE-driven seams are
// authored to this informational, VO-led type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-explainer/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const explainer: AdTypeDef = {
  id: "explainer",
  displayName: "Explainer",
  description:
    "An educational breakdown of how the product/service works or why it matters — 'here's how', 'the science', 'why X' — frequently motion-graphics / kinetic-typography led with voiceover and no real product footage. Differs from product-demo (real in-use footage, not animated diagrams), brand-awareness (identity/manifesto messaging, not informational how-it-works) and brand-story (emotional film vs informational graphics).",
  whenToUse: "consideration",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "A concept can be explained entirely with animated graphics, diagrams and voiceover; a clean product cut-out or a face may appear as a supporting accent but NEITHER asset is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["question", "curiosity-gap"],
  allowedHooks: [
    "question",
    "curiosity-gap",
    "stat-shock",
    "problem-solution",
    "contrarian",
    "unexpected-comparison",
    "bold-claim",
    "pattern-interrupt",
    "negativity-bias",
  ],

  fragments: buildFragments("explainer", "graphic_text"),
};
