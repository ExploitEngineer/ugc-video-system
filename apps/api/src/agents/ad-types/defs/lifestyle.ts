// ── Lifestyle ad type. ──────────────────────────────────────────────────────
// Aspirational real-life use occasion: the product woven into a desirable
// everyday scene, shot like a polished commercial. NET-NEW type (no legacy
// mapping). TYPE-driven seams are authored here; LOOK-driven seams defer to the
// shared cinematic_polished base in fragments/looks.js.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-lifestyle/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("cinematic_polished");

export const lifestyle: AdTypeDef = {
  id: "lifestyle",
  displayName: "Lifestyle",
  description:
    "Aspirational real-life use occasion — the product woven naturally into a desirable everyday scene, shot cinematically and carried by voiceover. Differs from testimonial (no one reviews to camera; the product just lives in the moment) and brand-story (a concrete product-in-use occasion, not an abstract values/mood piece).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the hero that must be seen in use; a person makes the occasion relatable but the scene can read aspirationally without one.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["relatable-scenario", "pattern-interrupt"],
  allowedHooks: [
    "relatable-scenario",
    "pattern-interrupt",
    "curiosity-gap",
    "direct-callout",
    "bold-claim",
  ],

  fragments: {
    // ---- storyboard seams ----
    // TYPE-driven: aspirational product-in-use scene, VO over the visuals.
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Lifestyle (an aspirational real-life use occasion):",
      "- The ad is a desirable everyday moment in which the product is woven in",
      "  NATURALLY as part of the scene — used, enjoyed or relied on in a real",
      "  occasion (a morning ritual, a commute, a gathering, a workout), NOT",
      "  reviewed or pitched. It should feel like a polished lifestyle commercial.",
      "- The PRODUCT is the hero of the moment: shown clearly in genuine use",
      "  within the scene, never hidden as background dressing. Any person on",
      "  screen interacts with it believably — reaching for it, using it, reacting",
      "  to it — so the occasion sells the feeling of owning it.",
      "- The arc builds an aspirational through-line over the ~15s: set the",
      "  scene → the product enters the moment → the payoff / feeling it delivers.",
      "- Each scene's `transcript` is a VOICEOVER line for that scene (warm,",
      "  evocative, ~1 short sentence) spoken over the visuals — it is NOT",
      "  lip-synced by anyone on screen. The lines should read as one cohesive",
      "  voiceover describing the moment and what the product brings to it.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    // No live presenter reviews to camera → the spoken layer is voiceover.
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    // TYPE-driven nuance on the spoken line style.
    storyboardTranscriptStyle: (_ctx) => [
      "Each line is observational and aspirational, naming the moment or the",
      "feeling the product brings to it — not a feature list or a hard sell.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a warm, aspirational narrator"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER narrates each line over the scene (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; light naturalistic ambience of the moment plus a fitting, understated score.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: lifestyle — a polished, aspirational real-life occasion with the product woven into the moment in genuine use, carried by voiceover. The spoken beat in each summary is a warm, observational voiceover line about the moment.",
    ],
  },
};
