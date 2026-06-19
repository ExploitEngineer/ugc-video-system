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

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("graphic_text");

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

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Explainer (an educational how/why breakdown as motion graphics):",
      "- The ad TEACHES one idea: how the product works, the science or mechanism",
      "  behind it, or why a problem matters — rendered as bold kinetic typography,",
      "  simple diagrams, labelled steps and animated icons. There is NO live",
      "  presenter and NO real product footage; the explanation itself is the subject.",
      "- Each panel advances ONE step of the explanation, large and legible: a posed",
      "  question, a key term defined, a numbered step, a labelled diagram of the",
      "  mechanism, or a 'so that's why…' payoff. The clarity of the breakdown IS the",
      "  persuasion — designed layouts, not a photographic scene.",
      "- A clean product cut-out, inset or simple schematic may anchor a frame to show",
      "  what is being explained, but the words, numbers and diagrams always carry it.",
      "- The arc is logical, not emotional: open on the question or surprising fact,",
      "  walk through the how/why step by step, land on the clear takeaway.",
      "- Each scene's `transcript` is a short VOICEOVER line for that panel that reads",
      "  out the on-frame explanation (e.g. 'Here's why it lasts twice as long'). The",
      "  lines read as one cohesive, clear, teaching voiceover.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a clear, teaching voiceover that narrates the step on",
      "  the frame — explain the how or why plainly and informatively, building one",
      "  point to the next; no first-person 'I' story, no hard sales close.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a clear, knowledgeable explainer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER narrates each explanation line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short, teaching and clear; subtle whoosh/tick accents and a light neutral bed are allowed as the type and diagrams animate in.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: explainer — a motion-graphics breakdown of how the product works or why it matters, built step by step with diagrams and kinetic type and carried by a clear teaching voiceover. The spoken beat in each summary is a voiceover line that narrates the on-frame explanation.",
    ],
  },
};
