// ── Problem-Agitate-Solve (PAS) ─────────────────────────────────────────────
// NET-NEW ad type (no legacy mapping). Authored from the PAS copywriting
// framework (Problem → Agitate → Solve), grounded in loss-aversion: name a pain,
// intensify it, then land the product as the relief. Rendered in the
// ugc_authentic look so the pain reads as a real, relatable phone-captured
// moment rather than a glossy commercial.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-problem-agitate-solve/SKILL.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const problemAgitateSolve: AdTypeDef = {
  id: "problem-agitate-solve",
  displayName: "Problem-Agitate-Solve (PAS)",
  description:
    "Opens on a named pain/frustration, agitates it, then the product resolves it ('tired of', 'sick of', 'struggling with'). Follows the PAS framework: name a pain point, intensify it, then present the product as the resolution. Differs from product-demo (starts from the product, not the pain) and testimonial (leads with a person's verdict, not a structured pain-first arc).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product must appear as the 'solve'; the problem can be dramatized with product/scene footage or voiceover, so a person is optional.",
  },
  lookFamily: "ugc_authentic",
  defaultHooks: ["problem-solution", "negativity-bias"],
  allowedHooks: [
    "problem-solution",
    "negativity-bias",
    "pattern-interrupt",
    "contrarian",
    "question",
    "relatable-scenario",
    "before-after",
    "curiosity-gap",
  ],

  fragments: buildFragments("problem-agitate-solve", "ugc_authentic"),
};
