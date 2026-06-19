// apps/api/src/agents/ad-types/defs/brand-story.ts
//
// ── Legacy `inspirational` lives here. ──────────────────────────────────────
// This def is the formalised home of the legacy `inspirational` treatment — i.e.
// the `else` side of today's `if (adType === "ugc") … else …` branches.
// SKELETON: each TYPE-driven seam carries a `// VERBATIM-MOVE` marker; Claude
// Code moves the exact current `else`/inspirational branch text in, byte-identical.
//
// Companion skill doc (must stay 1:1): .claude/skills/ad-type-brand-story/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types";
import { lookBase } from "../fragments/looks";

const look = lookBase("cinematic_polished");

export const brandStory: AdTypeDef = {
  id: "brand-story",
  displayName: "Brand Story",
  description:
    "Cinematic, emotionally-driven narrative about brand values, world, or a customer journey — polished mood piece with voiceover. Primary home of the legacy 'inspirational' type. Differs from founder-pov (no named speaker required) and brand-awareness (graphics/text manifesto, not filmed scenes).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "An open cinematic scene can succeed with neither a clear product nor a presenter, though either may appear — mirrors the legacy 'inspirational' freedom.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["curiosity-gap", "pattern-interrupt"],
  allowedHooks: [
    "curiosity-gap",
    "pattern-interrupt",
    "question",
    "relatable-scenario",
    "bold-claim",
  ],
  legacyMapping: "inspirational",

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      // VERBATIM-MOVE: image/storyboard/prompt.ts:<TYPEBLOCK_INSP_START>-<...END>
      // (the inspirational/`else` side of the `typeBlock`: open cinematic scene,
      //  product woven in cinematically rather than demonstrated on-camera)
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => [
      // VERBATIM-MOVE: image/storyboard/prompt.ts:<SPEAKER_LABEL_INSP>
      // (the "the voiceover" wording used on the inspirational branch)
    ],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<inspirational transcript ternary>
      // SEAM-VERIFY: voiceover narration lines. If no such ternary, return [].
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => [
      // VERBATIM-MOVE: video/prompt.ts:<VOICE.inspirational value>
      // (the string previously at VOICE["inspirational"])
    ],
    videoAudioLine: (_ctx) => [
      // VERBATIM-MOVE: video/prompt.ts:<voiceover audio line>
      // (the inspirational/voiceover side of the audio line)
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      // VERBATIM-MOVE: narrative-outline/prompt.ts:<isUgc === false branch>
      // (the inspirational script-treatment branch)
    ],
  },
};
