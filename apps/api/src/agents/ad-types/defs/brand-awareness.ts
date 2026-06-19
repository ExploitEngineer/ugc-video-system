// ── Brand Awareness / Manifesto (graphic_text, NET-NEW) ─────────────────────
// A pure slogan/manifesto/value statement in kinetic typography — the CANONICAL
// no-product, no-person type. The words and motion carry the WHOLE ad; nothing
// is filmed. LOOK-driven seams defer to the shared graphic_text base; TYPE-driven
// seams are authored to this typographic, VO-led manifesto type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-brand-awareness/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("graphic_text");

export const brandAwareness: AdTypeDef = {
  id: "brand-awareness",
  displayName: "Brand Awareness / Manifesto",
  description:
    "A pure slogan/manifesto/value statement rendered in kinetic typography — the CANONICAL no-product, no-person type, where words and motion graphics carry the whole ad. Differs from brand-story (filmed cinematic scenes with a narrative arc, not text-led) and social-proof (external ratings/quotes/logos, not the brand's own values message).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The brand's words and motion typography carry the entire ad; a product cut-out or a face may flash as a supporting accent, but the manifesto stands on type alone with neither asset present.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["pattern-interrupt", "contrarian"],
  allowedHooks: [
    "pattern-interrupt",
    "contrarian",
    "curiosity-gap",
    "question",
    "stat-shock",
    "bold-claim",
    "unexpected-comparison",
    "direct-callout",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Brand Awareness / Manifesto (a value statement as motion graphics):",
      "- The ad is a pure SLOGAN / MANIFESTO rendered as bold kinetic typography —",
      "  the brand's belief, mission or values stated as words on screen. There is",
      "  NO product demo and NO presenter; the message itself is the subject.",
      "- Each panel lands ONE line of the manifesto large and legible — a phrase, a",
      "  belief, a rallying value — building one continuous statement across the",
      "  frames. Words punch in and out; simple shapes, brand colour and a single",
      "  focal headline per frame carry it. The TYPOGRAPHY is the whole visual.",
      "- A clean product cut-out or a brief face may flash as a supporting accent,",
      "  but the words always own the frame — never a photographic lifestyle scene.",
      "- The arc builds conviction: open on a pattern-interrupting line, escalate",
      "  the belief, land on the brand name / tagline as the final frame.",
      "- Each scene's `transcript` is a short VOICEOVER line that speaks the on-frame",
      "  manifesto words (e.g. 'We don't make ordinary'). The lines read as one",
      "  cohesive, confident statement of belief — not a product pitch.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a confident, declarative voiceover that speaks the",
      "  on-frame manifesto words — a belief or value stated plainly, not a feature",
      "  list or sales close; punchy, quotable, brand-voiced.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, conviction-driven brand voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER declares each manifesto line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; a building, anthemic score is allowed as the words animate in.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: brand awareness / manifesto — a kinetic-typography statement of the brand's belief and values, no product demo and no presenter, carried by a confident voiceover. The spoken beat in each summary is a voiceover line that speaks the on-frame manifesto words.",
    ],
  },
};
