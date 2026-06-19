// ── Spokesperson / VSL ──────────────────────────────────────────────────────
// A scripted host/presenter (incl. an AI avatar) delivers a polished, persuasive
// pitch straight to camera. This is the produced, sales-led cousin of the
// authentic testimonial: the speaker is performing a written script, not sharing
// an off-the-cuff peer review.
//
// TYPE-driven seams are authored for this presenter-led, conversion treatment;
// LOOK-driven seams defer to the shared cinematic_polished base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-spokesperson/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("cinematic_polished");

export const spokesperson: AdTypeDef = {
  id: "spokesperson",
  displayName: "Spokesperson / VSL",
  description:
    "A scripted host/presenter (incl. an AI avatar) delivers a polished pitch straight to camera, leading the viewer through the offer toward an action. Differs from testimonial (an authentic peer giving an unscripted review, not a performed sales script) and brand-story (a cinematic mood piece, not a presenter-driven pitch).",
  whenToUse: "conversion",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The presenter delivering the scripted pitch to camera is the vehicle (a synthesized avatar if none is uploaded); the product is shown or referenced as the pitch demands.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["direct-callout", "question"],
  allowedHooks: [
    "direct-callout",
    "question",
    "problem-solution",
    "stat-shock",
    "social-proof",
    "bold-claim",
    "curiosity-gap",
  ],

  fragments: {
    // ---- storyboard seams ----
    // TYPE-driven: a scripted presenter pitching to camera.
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Spokesperson / VSL (a scripted host pitching straight to camera):",
      "- The ad is a confident PRESENTER delivering a polished, persuasive pitch",
      "  directly to the lens — like a host in a produced sales video or a clean",
      "  AI-avatar spokesperson. This is PERFORMED and scripted, NOT an off-the-cuff",
      "  peer review and NOT silent lifestyle b-roll.",
      "- The presenter holds the frame and addresses the camera with composed,",
      "  intentional delivery: open with the hook, lead through the offer, and build",
      "  toward the action. They are well-lit, well-framed and look straight at the",
      "  viewer; energy is upbeat and assured, never casual or shaky.",
      "- The product appears in support of the pitch — held up and presented clearly,",
      "  cleanly inset, or shown in a tight insert beside the presenter — but the",
      "  PERSON and their words carry the frame across the panels.",
      "- The flow is a deliberate pitch arc: grab attention → frame the benefit /",
      "  proof → drive toward the next step. It ENDS on a confident, persuasive beat",
      "  (a clear takeaway or call to act), not a casual personal verdict.",
      "- Each scene's `transcript` is one scripted line the presenter says to camera",
      "  in that scene — crisp, persuasive, benefit-led sales copy that flows as one",
      "  continuous pitch. Keep lines short and punchy; vary their length so the",
      "  delivery sounds confident rather than robotic.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    // TYPE/ASSET-driven: a presenter speaks on camera.
    storyboardSpeakerLabel: (_ctx) => ["the on-screen person"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    // TYPE-driven: scripted persuasive sales copy delivered to camera.
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is scripted, polished sales copy spoken to camera:",
      "  confident, benefit-led and persuasive (not casual peer chat), driving toward",
      "  the action — but still natural enough to perform out loud.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    // TYPE-driven voice descriptor.
    videoVoice: (_ctx) => ["a confident, persuasive, polished presenter voice"],
    // TYPE-driven: lip-synced presenter pitching to camera.
    videoAudioLine: (_ctx) => [
      "Audio: the on-screen presenter SPEAKS each line lip-synced in a confident, polished, persuasive voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short and punchy, mouth visible while speaking; clean studio ambience, an optional light bed of music under the voice.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: spokesperson / VSL — a scripted presenter delivers a polished, persuasive pitch straight to camera across the run, building from hook to offer to call-to-action. The spoken beat in each summary is a crisp, benefit-led scripted line the presenter says to the lens.",
    ],
  },
};
