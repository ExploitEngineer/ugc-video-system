// ── Legacy `inspirational` lives here. ──────────────────────────────────────
// This def is the formalised home of the legacy `inspirational` treatment — the
// `else` side of today's `if (adType === "ugc") … else …` branches. Each
// TYPE-driven seam carries the EXACT current inspirational branch text so
// behaviour is BYTE-IDENTICAL once the builders dispatch through the registry
// (Chunk F). Do not paraphrase.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts, authored in Chunk H):
//   .claude/skills/ad-type-brand-story/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

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
    // VERBATIM-MOVE: image/storyboard/prompt.ts `typeBlock` (else / inspirational).
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Inspirational (open-ended cinematic):",
      "- The ad is an evocative, cinematic scene that follows whatever the",
      "  user describes (mood, journey, lifestyle, story), with the product",
      "  woven in naturally. The arc builds an emotional through-line over",
      "  the ~15s.",
      "- Each scene's `transcript` is a VOICEOVER NARRATION line for that",
      "  scene (evocative, ~1 short sentence), spoken over the visuals — it is",
      "  NOT necessarily lip-synced by anyone on screen. The four lines should",
      "  read as one cohesive voiceover.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    // VERBATIM-MOVE: image/storyboard/prompt.ts `speaker` (else / inspirational).
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    // No separate inspirational transcript ternary (it lives inside typeBlock) → [].
    storyboardTranscriptStyle: (_ctx) => [],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    // VERBATIM-MOVE: video/prompt.ts VOICE["inspirational"] (the Record is DELETED).
    videoVoice: (_ctx) => ["a calm, measured narrator"],
    // VERBATIM-MOVE: video/prompt.ts inspirational `audioLine`.
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER narrates each line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; a light fitting score is allowed.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    // VERBATIM-MOVE: narrative-outline/prompt.ts `isUgc === false` treatment.
    narrativeTreatment: (_ctx) => [
      "Treatment: inspirational — a cinematic scene carried by voiceover narration. The spoken beat in each summary is a voiceover line.",
    ],
  },
};
