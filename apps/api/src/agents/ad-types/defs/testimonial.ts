// ── Legacy `ugc` lives here. ────────────────────────────────────────────────
// This def is the formalised home of the legacy `adType === "ugc"` treatment.
// Each TYPE-driven seam carries the EXACT current UGC branch text so behaviour is
// BYTE-IDENTICAL once the storyboard/video/narrative builders dispatch through
// the registry (Chunk F). Do not paraphrase — these strings are copied verbatim.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts, authored in Chunk H):
//   .claude/skills/ad-type-testimonial/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

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
    // VERBATIM-MOVE: image/storyboard/prompt.ts `typeBlock` (adType === "ugc").
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — UGC (a real person SHOWING the product to camera):",
      "- The ad is a REAL PERSON talking TO CAMERA about the product the way",
      "  they'd show it to a friend — relaxed, genuine, off-the-cuff. NOT a",
      "  scripted ad, review read or sales pitch, and NOT silent lifestyle b-roll.",
      "- They ACTIVELY DEMONSTRATE the product to the lens across the panels: hold",
      "  it up close to camera, take it off / put it on (or pick it up / handle",
      "  it), turn or rotate it to show its key parts and details, point at a",
      "  feature, and show it actually working — like a creator doing a real",
      "  hands-on review. The PRODUCT is the focus of most panels, shown clearly",
      "  and large to camera, NOT just worn or held passively in the background.",
      "- They look at and address the camera. The flow is natural: show the",
      "  product → demonstrate / use it → an honest reaction. It ENDS on a real",
      "  personal verdict, never a sales close or call-to-action.",
      "- AVOID passive lifestyle filler that hides the product: walking in,",
      "  dropping a bag, stretching, relaxing, gazing away, or candid moments not",
      "  addressed to camera.",
      "- Each scene's `transcript` is one natural spoken line the on-screen",
      "  person says in that scene (first person, the way people really talk —",
      "  contractions, casual phrasing, not ad copy), tied to what they're",
      "  SHOWING/doing with the product. Keep lines short and let their length",
      "  vary; the lines flow as one continuous, natural bit of talking.",
    ],
    // LOOK-driven → reuse the shared ugc_authentic base (no per-type authoring).
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx),
    // VERBATIM-MOVE: image/storyboard/prompt.ts `speaker` (adType === "ugc").
    storyboardSpeakerLabel: (_ctx) => ["the on-screen person"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    // No separate UGC transcript ternary (it lives inside typeBlock) → [].
    storyboardTranscriptStyle: (_ctx) => [],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    // VERBATIM-MOVE: video/prompt.ts VOICE["ugc"] (the Record is DELETED).
    videoVoice: (_ctx) => ["a warm, conversational, natural-sounding voice"],
    // VERBATIM-MOVE: video/prompt.ts UGC `audioLine`.
    videoAudioLine: (_ctx) => [
      "Audio: the on-screen person SPEAKS each line lip-synced in a natural, real human voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short, mouth visible while speaking; light room ambience, no music.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    // VERBATIM-MOVE: narrative-outline/prompt.ts `isUgc === true` treatment.
    narrativeTreatment: (_ctx) => [
      "Treatment: UGC — a real person casually talking about the product the way they actually speak (not a scripted ad or review read). The spoken beat in each summary is a natural first-person line.",
    ],
  },
};
