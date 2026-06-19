// ── Problem-Agitate-Solve (PAS) ─────────────────────────────────────────────
// NET-NEW ad type (no legacy mapping). Authored from the PAS copywriting
// framework (Problem → Agitate → Solve), grounded in loss-aversion: name a pain,
// intensify it, then land the product as the relief. Rendered in the
// ugc_authentic look so the pain reads as a real, relatable phone-captured
// moment rather than a glossy commercial.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-problem-agitate-solve/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("ugc_authentic");

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

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Problem-Agitate-Solve (a pain-first arc resolved by the product):",
      "- The ad follows the PAS framework across the panels: PROBLEM first (show",
      "  a real, relatable frustration or pain the viewer recognises), then",
      "  AGITATE (make that pain land — the annoyance, the cost, the repeated",
      "  hassle, the failed workaround), then SOLVE (the PRODUCT arrives and",
      "  resolves it cleanly). It is NOT a flat product demo and NOT a spoken",
      "  review.",
      "- The opening panels DRAMATIZE the problem in an everyday setting — the",
      "  messy, slow, broken, or annoying status quo — so the viewer feels 'that's",
      "  me'. Hold on the frustration long enough to sting before any product",
      "  appears.",
      "- The PRODUCT enters as the turning point and owns the closing panels: show",
      "  it clearly resolving the exact pain set up earlier — the relief, the fix,",
      "  the better-after. The contrast between the agitated problem and the",
      "  product's solve is the whole point; make it legible.",
      "- Each scene's `transcript` is the line for that beat — naming the pain,",
      "  twisting the knife, then the relief — in plain, punchy language ('tired",
      "  of…', 'sick of…', 'struggling with…' → 'now…'). Keep lines short; let the",
      "  arc read as one continuous problem-to-relief through-line.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "Each transcript line maps to its PAS beat — name the pain, agitate it, then",
      "deliver the relief — in plain, conversational, pain-named phrasing.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["an empathetic, relatable voice that turns confident on the solve"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER carries each line (not lip-synced on screen), the SAME voice throughout — starting frustrated/empathetic on the problem and shifting to relieved and confident as the product solves it; quote each line verbatim in its slice and keep it short; light room ambience, optional subtle score.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: Problem-Agitate-Solve — a pain-first arc. The early summaries dramatize and agitate a named frustration; the later summaries introduce the product as the resolution. The spoken beat in each summary is a voiceover line that moves from problem to relief.",
    ],
  },
};
