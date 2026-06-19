// ── Promo / Offer (graphic_text, NET-NEW) ───────────────────────────────────
// A price/discount/urgency push with a hard call-to-action — "% off", "BOGO",
// "sale ends", "use code". Rendered as bold motion graphics: the deal terms and
// the CTA ARE the frame; no live presenter. LOOK-driven seams defer to the shared
// graphic_text base; TYPE-driven seams are authored to this offer-led, VO type.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-promo-offer/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("graphic_text");

export const promoOffer: AdTypeDef = {
  id: "promo-offer",
  displayName: "Promo / Offer",
  description:
    "A price/discount/urgency push with a hard call-to-action rendered as motion graphics — '% off', 'BOGO', 'sale ends Sunday', 'use code SAVE20'. The deal terms and the CTA carry every frame; no live presenter. Differs from announcement (announces news WITHOUT a deal — a launch or update, no price/discount/urgency) and social-proof (stacks ratings/reviews, not an offer + CTA).",
  whenToUse: "conversion",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "The deal terms and CTA carry the ad as kinetic typography; a product cut-out or face may appear as a supporting accent, but neither is required.",
  },
  lookFamily: "graphic_text",
  defaultHooks: ["direct-callout", "stat-shock"],
  allowedHooks: [
    "direct-callout",
    "stat-shock",
    "negativity-bias",
    "pattern-interrupt",
    "bold-claim",
    "social-proof",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Promo / Offer (a price/discount/urgency push as motion graphics):",
      "- The ad is a designed sequence built around ONE deal — a discount, sale,",
      "  bundle or coupon — pushed with urgency and a hard call-to-action. The",
      "  OFFER is the subject, rendered as bold kinetic typography; there is NO",
      "  live presenter and NO first-person spoken story.",
      "- Each panel slams ONE deal element large and legible: the headline saving",
      "  ('40% OFF', 'BUY 1 GET 1 FREE'), the promo code ('USE CODE SAVE20'), the",
      "  urgency ('SALE ENDS SUNDAY', 'TODAY ONLY', 'WHILE STOCKS LAST') and the",
      "  CTA ('SHOP NOW', 'CLAIM YOURS'). Big numbers, strikethrough prices and",
      "  countdown cues do the persuading.",
      "- A clean product cut-out or inset may anchor a frame, but the deal terms",
      "  and CTA always carry it — never a photographic lifestyle scene.",
      "- The arc drives to action: open on the headline offer, stack the terms and",
      "  urgency, and END hard on the CTA so the viewer knows exactly what to do",
      "  and that it expires.",
      "- Each scene's `transcript` is a short, punchy VOICEOVER line for that panel",
      "  that calls out the deal on the frame (e.g. 'Forty percent off — this",
      "  weekend only'). The lines read as one urgent, confident voiceover.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Each transcript line is a punchy, urgent voiceover that calls out the deal",
      "  on the frame: name the saving, code, deadline or CTA plainly — short,",
      "  imperative, action-driving; no first-person 'I' story, no soft close.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, upbeat announcer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a natural, real human VOICEOVER reads each deal line (not lip-synced on screen), the SAME voice throughout, energetic and urgent; quote each line verbatim in its slice and keep it short; a driving upbeat bed plus punchy whooshes and a stamp/cash-register accent as the numbers and CTA punch in.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: promo / offer — a motion-graphics push built around one deal (discount, bundle or code), stacking the terms and urgency and driving hard to a call-to-action, carried by a confident, upbeat voiceover. The spoken beat in each summary is a voiceover line that calls out the on-frame offer.",
    ],
  },
};
