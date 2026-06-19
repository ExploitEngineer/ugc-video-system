// ── Founder POV ad type. ────────────────────────────────────────────────────
// The FOUNDER tells their own first-person origin / mission story — an insider
// account ("I started this because…", "why we built…"), NOT a customer review.
// NET-NEW type: the TYPE-driven seams are authored here (no legacy verbatim
// source). LOOK-driven seams reuse the shared cinematic_polished base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-founder-pov/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("cinematic_polished");

export const founderPov: AdTypeDef = {
  id: "founder-pov",
  displayName: "Founder POV",
  description:
    "The founder tells their first-person origin/mission story ('I started this', 'why we built it') — an insider, not a customer. Polished, VO-led, intimate-to-camera or over filmed scenes. Differs from testimonial (a customer/creator review) and spokesperson (a hired host reading a script).",
  whenToUse: "awareness|consideration",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The founder is the storyteller and credibility anchor, so a person is mandatory; the product they built may appear or only be referenced.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["confession", "problem-solution"],
  allowedHooks: [
    "confession",
    "problem-solution",
    "curiosity-gap",
    "contrarian",
    "direct-callout",
    "relatable-scenario",
    "question",
    "pattern-interrupt",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Founder POV (the maker telling their own story):",
      "- The ad is the FOUNDER speaking in first person about why this product",
      "  exists — their origin, the problem they personally hit, the mission",
      "  behind building it. They are an INSIDER and the maker, NOT a customer",
      "  reviewing a purchase and NOT a hired host reading ad copy.",
      "- The tone is sincere, personal and grounded — an honest founder letter",
      "  said aloud. It earns trust through real conviction, not a sales pitch,",
      "  and never ends on a hard call-to-action.",
      "- The arc moves through their story: where it started → the problem or",
      "  belief that drove them → what they built and why it matters now. The",
      "  product appears as the thing they made, woven into the story.",
      "- Each scene's `transcript` is one first-person line the founder says",
      "  (intimate to camera, or as voiceover over a filmed beat of their world",
      "  or workspace) — 'I…', 'we…', 'that's why…'. Keep the lines short, let",
      "  their length vary, and let the four read as one continuous, heartfelt",
      "  bit of the founder talking.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the on-screen person"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Transcript lines are first-person FOUNDER speech (insider 'I/we'",
      "  framing, e.g. 'I built this because…', 'that's why we…'), sincere and",
      "  personal — never a customer's review and never scripted announcer copy.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a sincere, grounded, personal founder voice"],
    videoAudioLine: (_ctx) => [
      "Audio: the founder SPEAKS each line in a sincere, real human voice (the SAME voice throughout, fitting their apparent age, gender and energy) — lip-synced when they are on camera, or as their own intimate voiceover over a filmed beat; quote each line verbatim in its slice, keep it short; light room ambience or a restrained score, never a loud hard-sell tone.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: Founder POV — the founder narrates their own origin and mission in first person across the beats (insider 'I/we' framing, sincere not salesy). The spoken beat in each summary is a personal founder line moving the story from where it began to why the product matters.",
    ],
  },
};
