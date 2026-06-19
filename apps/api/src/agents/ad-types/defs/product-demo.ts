// ── Product Demo (net-new ad type). ─────────────────────────────────────────
// Function-first ad: the product is SHOWN BEING USED, step by step, so the
// viewer understands how it works ("how it works", "in action", "watch it
// work"). NET-NEW — no legacy branch; TYPE-driven seams are authored to the
// demo_clean look (clean studio/tabletop product photography), LOOK-driven seams
// defer to the shared base. Differs from product-showcase (visible in-use
// function vs static hero glamour).
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-product-demo/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("demo_clean");

export const productDemo: AdTypeDef = {
  id: "product-demo",
  displayName: "Product Demo",
  description:
    "Shows the product being used / how it works — function-first, step-by-step ('how it works', 'in action', 'watch it work'). Differs from product-showcase (visible in-use function and clear steps, NOT a static hero glamour shot) and how-to (a demo proves the product works rather than teaching a general skill).",
  whenToUse: "consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the subject and must be shown working; hands or a presenter may operate it but are not required.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["demonstration", "problem-solution"],
  allowedHooks: [
    "demonstration",
    "problem-solution",
    "before-after",
    "curiosity-gap",
    "question",
    "pattern-interrupt",
    "stat-shock",
    "relatable-scenario",
  ],

  fragments: {
    // ---- storyboard seams ----
    // TYPE-driven: function-first, step-by-step demonstration of the product.
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Product Demo (the product SHOWN being used, step by step):",
      "- The ad demonstrates HOW THE PRODUCT WORKS and what it does — function",
      "  first. The product is the clear hero and is shown ACTIVELY IN USE, not",
      "  posed as a static beauty shot. NOT a person reviewing it, NOT abstract",
      "  lifestyle b-roll.",
      "- The panels walk through a real sequence: setup / first state → the",
      "  product in action → the key feature or mechanism doing its job → the",
      "  visible result or finished state. Each panel advances one concrete step",
      "  so the viewer can follow the process and understand the function.",
      "- Hands or a presenter may operate the product, but the FOCUS stays on the",
      "  product and what it's doing — shown clearly and large, with its key parts,",
      "  controls and details readable. Show the mechanism actually working.",
      "- Each scene's `transcript` is one short voiceover line naming the step or",
      "  the benefit being shown in that panel (plain, confident, instructive —",
      "  e.g. 'press once to start', 'now it locks in place'). The four lines read",
      "  as one clear walkthrough that ends on the result, not a sales close.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    // VO-led demo, no live presenter required → voiceover labels the steps.
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    // TYPE-driven: step/benefit labels, not a spoken review.
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a short, plain VOICEOVER label for the step shown",
      "  in that panel — name the action, the feature, or the result it produces.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a clear, confident, instructive voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a clear human VOICEOVER walks through the steps (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short and instructive; tactile product sounds (clicks, taps, mechanism) where they fit, light or no music.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: product demo — a function-first walkthrough that shows the product being used step by step. Each summary advances one concrete step (setup → action → key feature → result); the spoken beat is a short voiceover label for that step.",
    ],
  },
};
