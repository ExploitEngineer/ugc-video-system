// ── Social Proof (graphic_text, NET-NEW) ────────────────────────────────────
// Aggregated third-party proof rendered as motion graphics — star ratings,
// review snippets, press logos, user counts. NO single presenter; the words and
// numbers carry every frame. LOOK-driven seams defer to the shared graphic_text
// base; TYPE-driven seams are authored to this kinetic-typography, VO-led type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-social-proof/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("graphic_text");

export const socialProof: AdTypeDef = {
  id: "social-proof",
  displayName: "Social Proof",
  description:
    "Aggregated third-party proof rendered as motion graphics — star ratings, review snippets, press logos, user counts. NO single presenter. Differs from testimonial (one person's spoken first-person account, not aggregated graphics) and stat-shock (a single dramatic statistic, not a stacked wall of reviews/ratings/logos).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The proof (ratings, quotes, counts, press logos) carries the ad as kinetic typography; a product cut-out or face may appear as a supporting accent but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["social-proof", "stat-shock"],
  allowedHooks: [
    "social-proof",
    "stat-shock",
    "curiosity-gap",
    "question",
    "bold-claim",
    "before-after",
    "pattern-interrupt",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Social Proof (aggregated third-party proof as motion graphics):",
      "- The ad is a designed sequence of PROOF rendered as bold kinetic",
      "  typography — star ratings, short review quotes, user/customer counts,",
      "  rating averages and press/publication logos. There is NO single presenter",
      "  and NO spoken first-person account; the proof itself is the subject.",
      "- Each panel stacks ONE proof element large and legible: a 5-star row, a",
      "  punchy review snippet in quote marks, a big number ('50,000+ five-star",
      "  reviews'), or a wall of recognisable press logos. The volume and",
      "  consensus of the proof IS the persuasion.",
      "- A clean product cut-out or inset may anchor a frame, but the words and",
      "  numbers always carry it — never a photographic lifestyle scene.",
      "- The arc builds credibility: open on the strongest proof, stack more,",
      "  land on the aggregate verdict that earns the click.",
      "- Each scene's `transcript` is a short VOICEOVER line for that panel that",
      "  reads the on-frame proof aloud (e.g. 'Rated five stars by over fifty",
      "  thousand people'). The lines read as one cohesive, confident voiceover.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a confident voiceover that states the proof on",
      "  the frame: cite the rating, count, quote or source plainly and let the",
      "  numbers do the convincing — no first-person 'I' story, no sales close.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, credible announcer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER reads each proof line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; rating/notification chimes and a light upbeat bed are allowed as the numbers and stars animate in.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: social proof — a motion-graphics montage of aggregated ratings, review quotes, counts and press logos, carried by a confident voiceover. The spoken beat in each summary is a voiceover line that reads the on-frame proof.",
    ],
  },
};
