// ── Unboxing ad type. ───────────────────────────────────────────────────────
// A packaging reveal plus first-impressions reaction, phone-captured. NET-NEW
// type (no legacyMapping) on the shared `ugc_authentic` look base. The TYPE-driven
// seams are authored for the unboxing beat (sealed box → open → reveal → react);
// the LOOK-driven seams defer to the shared phone-captured base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-unboxing/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("ugc_authentic");

export const unboxing: AdTypeDef = {
  id: "unboxing",
  displayName: "Unboxing",
  description:
    "A packaging reveal plus first-impressions reaction — sealed box/bag opened on camera, the product lifted out and shown, with genuine in-the-moment delight ('unboxing', 'what is inside', 'just arrived'). Phone-captured. Differs from testimonial (a considered review, not a live reveal) and demo (a feature walkthrough, not the open-the-package moment).",
  whenToUse: "awareness|consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the payoff of the reveal so it must be present; a person's hands/reaction add credibility but the unbox can play on hands and product alone.",
  },
  lookFamily: "ugc_authentic",
  defaultHooks: ["curiosity-gap", "demonstration"],
  allowedHooks: [
    "curiosity-gap",
    "demonstration",
    "pattern-interrupt",
    "social-proof",
    "bold-claim",
    "relatable-scenario",
  ],

  fragments: {
    // ---- storyboard seams ----
    // TYPE-driven: the package-reveal beat structure.
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Unboxing (a real package being opened and revealed to camera):",
      "- The ad is a genuine UNBOXING: a sealed box, mailer or bag that just",
      "  arrived is opened on camera, and the product inside is revealed for the",
      "  first time. It feels spontaneous and real — a creator filming the moment",
      "  they crack it open, NOT a scripted ad or a polished studio reveal.",
      "- Move through the unboxing BEAT BY BEAT across the panels: the closed",
      "  package held up to camera (anticipation), hands opening / tearing / lifting",
      "  the lid, the product emerging out of the packaging, then the product held",
      "  up close and turned to show its key parts. The PACKAGING and the REVEAL are",
      "  the focus — show the box, the act of opening, and what's inside, large and",
      "  clear to camera.",
      "- Carry an honest first-impressions REACTION through it (surprise, delight,",
      "  curiosity). The flow is natural: sealed package → open it → lift the product",
      "  out → genuine reaction to what's revealed. End on that real first verdict,",
      "  not a sales close or call-to-action.",
      "- AVOID skipping straight to a clean hero product shot with no packaging, and",
      "  AVOID passive lifestyle filler that hides the box or the moment of opening.",
      "- Each scene's `transcript` is one natural spoken line for that beat (first",
      "  person, the way people really talk while opening something — short,",
      "  reactive, contractions, not ad copy), tied to what's being opened or",
      "  revealed in that panel. Let line length vary; they flow as one continuous",
      "  bit of talking through the unboxing.",
    ],
    // LOOK-driven → shared ugc_authentic base (phone-captured).
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx),
    // A person may appear; when present they're on camera reacting → on-screen person.
    storyboardSpeakerLabel: (_ctx) => ["the on-screen person"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- The spoken line is a live, reactive first-impression, anchored to the",
      "  moment in the box (e.g. naming what just appeared or reacting to it), never",
      "  a rehearsed review read.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["an excited, genuine, first-impressions voice"],
    videoAudioLine: (_ctx) => [
      "Audio: the on-screen person SPEAKS each line lip-synced in a natural, excited real human voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short and reactive, mouth visible while speaking; include the real tactile sounds of opening the package (tape, cardboard, rustle) and light room ambience, no music.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: unboxing — a real person opening the just-arrived package on camera and reacting to the product as it's revealed, building from sealed box to first verdict. The spoken beat in each summary is a natural, reactive first-person line tied to that step of the reveal.",
    ],
  },
};
