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
//   .claude/skills/ad-type-before-after/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("demo_clean");

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

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Before / After (a visible transformation driven by the product):",
      "- The ad shows a clear CONTRAST between a worse 'before' state and a better",
      "  'after' result, with the PRODUCT as the thing that caused the change. The",
      "  arc is: establish the before state → apply/use the product → reveal the",
      "  improved after. It is a RESULT contrast over time, NOT a step-by-step",
      "  how-to (that's product-demo) and NOT a rival-product face-off (comparison).",
      "- Render both states in the SAME clean studio/tabletop framing so the change",
      "  reads instantly: same surface, angle and lighting, only the result differs.",
      "  The early panels show the before; the product enters and acts; the final",
      "  panels HOLD on the satisfying after result, large and clear to camera.",
      "- META POLICY GUARD: for weight-loss, body, skin, anti-aging or wrinkle",
      "  subjects do NOT render a literal before/after split-screen of a person and",
      "  do NOT imply negative self-perception — Meta prohibits this. Instead frame",
      "  it POSITIVELY and AFTER-FORWARD: show the confident, improved result and the",
      "  product, never a degrading 'before' of a body or face.",
      "- Each scene's `transcript` is one short VOICEOVER line for that scene that",
      "  narrates the journey from problem to result (before → product → after),",
      "  spoken over the visuals — not lip-synced by anyone on screen. The lines",
      "  read as one cohesive voiceover building to the payoff.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Transcript lines are concise voiceover that names the before pain, then the",
      "  after win — punchy and benefit-led (e.g. 'Before…' / 'After one use…'),",
      "  never disparaging a person's body or appearance.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, reassuring voice that lands the payoff"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER narrates each line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short, building from the before to the satisfying after; a light, uplifting score is allowed and a subtle reveal cue on the after is welcome.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: before/after — a transformation carried by voiceover, contrasting a worse before state with the improved after result driven by the product. Each summary's spoken beat is a voiceover line moving the arc from problem to payoff; for body/skin/weight subjects stay positive and after-forward and never use a degrading before split-screen.",
    ],
  },
};
