// apps/api/src/agents/ad-types/defs/testimonial.ts
//
// ── Legacy `ugc` lives here. ────────────────────────────────────────────────
// This def is the formalised home of the legacy `adType === "ugc"` treatment.
// SKELETON: the prompt strings are NOT inlined here yet. Each TYPE-driven seam
// carries a `// VERBATIM-MOVE: <file>:<lines>` marker. Claude Code moves the
// exact current UGC branch text into that array so behaviour is BYTE-IDENTICAL.
// Do not paraphrase — copy the strings verbatim.
//
// Companion skill doc (must stay 1:1): .claude/skills/ad-type-testimonial/SKILL.md
// (enforced by defs-skills-sync.test.ts)

import type { AdTypeDef, FragmentCtx } from "../types";
import { lookBase } from "../fragments/looks";

const look = lookBase("ugc_authentic");

export const testimonial: AdTypeDef = {
  id: "testimonial",
  displayName: "Testimonial / UGC Review",
  description:
    "A person speaks to camera giving a first-person review/endorsement, authentic phone-captured feel. Home of the legacy 'ugc' type. Differs from founder-pov (a customer/creator, not the founder) and social-proof (aggregated graphics, not one spoken account).",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "optional",
    person: "required",
    rationale:
      "The credible human voice is mandatory; the product may be held, shown, or only referenced.",
  },
  lookFamily: "ugc_authentic",
  defaultHooks: ["testimonial", "problem-solution"],
  allowedHooks: [
    "testimonial",
    "problem-solution",
    "confession",
    "direct-callout",
    "before-after",
    "question",
    "relatable-scenario",
    "social-proof",
    "curiosity-gap",
  ],
  legacyMapping: "ugc",

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      // VERBATIM-MOVE: image/storyboard/prompt.ts:<TYPEBLOCK_UGC_START>-<...END>
      // (the UGC side of the `typeBlock`: product presented on-camera, the person
      //  demonstrating/reviewing it to camera)
    ],
    // LOOK-driven → reuse the shared ugc_authentic base (no per-type authoring).
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx),
    storyboardSpeakerLabel: (_ctx) => [
      // VERBATIM-MOVE: image/storyboard/prompt.ts:<SPEAKER_LABEL_UGC>
      // (the "the on-screen person" wording used on the UGC branch)
    ],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<UGC transcript ternary>
      // SEAM-VERIFY: first-person spoken review lines. If no such ternary, return [].
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => [
      // VERBATIM-MOVE: video/prompt.ts:<VOICE.ugc value>
      // (the string previously at VOICE["ugc"] — the Record is DELETED; this
      //  method replaces that single value)
    ],
    videoAudioLine: (_ctx) => [
      // VERBATIM-MOVE: video/prompt.ts:<UGC audio line>
      // (the UGC side of the UGC-vs-voiceover audio line)
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      // VERBATIM-MOVE: narrative-outline/prompt.ts:<isUgc === true branch>
      // (the UGC script-treatment branch)
    ],
  },
};
