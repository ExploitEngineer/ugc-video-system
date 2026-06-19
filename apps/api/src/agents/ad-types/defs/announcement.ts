// ── Announcement (graphic_text, NET-NEW) ────────────────────────────────────
// A news/launch/restock reveal rendered as motion graphics — "introducing", "now
// available", "new", "we partnered". States WHAT is new without a price or
// urgency (that is promo-offer). NO single presenter; bold kinetic typography and
// a confident voiceover carry every frame. LOOK-driven seams defer to the shared
// graphic_text base; TYPE-driven seams are authored to this announcement type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-announcement/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("graphic_text");

export const announcement: AdTypeDef = {
  id: "announcement",
  displayName: "Announcement",
  description:
    "A news/launch/restock reveal rendered as motion graphics — 'introducing', 'now available', 'new', 'we partnered'. States WHAT is new without a price or urgency. Differs from promo-offer (no deal, discount, code or deadline) and from product-showcase (a one-time NEWS beat, not an evergreen feature glamour reel).",
  whenToUse: "awareness",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The news itself carries the ad as kinetic typography; a clean product cut-out or a face may anchor the reveal as a supporting accent, but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["curiosity-gap", "pattern-interrupt"],
  allowedHooks: [
    "curiosity-gap",
    "pattern-interrupt",
    "stat-shock",
    "question",
    "bold-claim",
    "direct-callout",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Announcement (a NEWS / launch / restock reveal as motion graphics):",
      "- The ad delivers a single piece of NEWS rendered as bold kinetic",
      "  typography — a launch, a new product or feature, a restock, a partnership",
      "  or a milestone. The framing is 'introducing', 'now available', 'it's",
      "  here', 'new', 'we partnered with…'. There is NO presenter and NO spoken",
      "  first-person account; the announcement itself is the subject.",
      "- It announces WHAT is new only — it does NOT push a price, discount, code,",
      "  countdown or 'limited time' urgency (that would be a promo-offer). Keep it",
      "  confident and newsworthy, not a sale.",
      "- Each panel reveals ONE beat of the news large and legible: build a little",
      "  intrigue, then drop the headline ('Introducing <name>'), then the key",
      "  thing that makes it worth knowing, then where/when it's available.",
      "- A clean product cut-out or inset may anchor the reveal frame, but the",
      "  words always carry it — never a photographic lifestyle scene.",
      "- Each scene's `transcript` is a short VOICEOVER line for that panel that",
      "  announces the on-frame news (e.g. 'Introducing the new one' / 'Available",
      "  now'). The lines read as one cohesive, confident announcement.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a confident announcement voiceover that states the",
      "  on-frame news plainly — what's new and where to get it. No first-person",
      "  'I' story, no price, discount, code or urgency, no hard sales close.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, upbeat announcer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER announces each line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; a clean reveal whoosh and a light upbeat bed are allowed as the headline words animate in.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: announcement — a motion-graphics reveal of a single piece of news (launch, new feature, restock or partnership), carried by a confident voiceover, with no price or urgency. The spoken beat in each summary is a voiceover line that announces the on-frame news.",
    ],
  },
};
