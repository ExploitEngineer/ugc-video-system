---
name: ad-type-promo-offer
description: >-
  Promo / Offer ad type. A price/discount/urgency push with a hard
  call-to-action — "% off", "BOGO", "sale ends Sunday", "use code SAVE20" —
  rendered as bold motion graphics with NO live presenter; kinetic typography
  carried by a confident, upbeat voiceover. Use when authoring or revising the
  promo-offer ad type's detection cues, asset policy, hooks, look, voice, and the
  canonical prompt-fragment prose in defs/promo-offer.ts.
---

# Ad type — Promo / Offer

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/promo-offer.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. This is a NET-NEW graphic_text type
> (no legacy branch); the TYPE-driven fragment prose is authored here and mirrored
> in the def.

## Intent

Convert by deal: a designed motion-graphics push built around ONE offer — a
discount, sale, bundle (BOGO) or coupon code — pushed with urgency and a hard
call-to-action. The deal terms, the deadline and the CTA are the argument. There
is no on-camera presenter and no first-person spoken account; the words and
numbers carry every frame.

## Detection cues

Route here when the brief leads with a DEAL and a CTA: "40% off", "BOGO", "buy
one get one", "use code SAVE20", "sale ends Sunday", "today only", "limited time",
"flash sale", "claim yours", strikethrough pricing, a countdown. Disambiguation:

- **vs announcement** — announcement announces NEWS without a deal: a launch, a
  new feature, a restock, an event — no price, discount or urgency. Promo/offer
  always carries a saving/code/deadline + CTA. A "now available" message with no
  deal → announcement; a "% off, ends Sunday, use code" message → promo-offer.
- **vs social-proof** — social-proof stacks aggregated ratings, review quotes,
  counts and press logos as the persuasion. Promo/offer stacks deal terms and a
  CTA. A wall of credibility → social-proof; a wall of savings + urgency →
  promo-offer. (Social proof may APPEAR inside a promo as a supporting accent.)
- **vs product-showcase** — showcase glamorises the product and its features with
  no offer and no urgency. If the central message is the price/deal, not the
  product beauty → promo-offer.

## Asset policy

- **product: optional**, **person: optional** — the deal terms and CTA carry the
  ad as kinetic typography. A clean product cut-out or a face may appear as a
  supporting accent, but neither is required.

## Favored hooks

- **defaultHooks:** `direct-callout`, `stat-shock`
- **allowedHooks:** `direct-callout`, `stat-shock`, `negativity-bias`,
  `pattern-interrupt`, `bold-claim`, `social-proof`

## Look & treatment

- **lookFamily:** `graphic_text` — bold motion-graphics frames, clean kinetic
  typography as the primary subject, large legible headline words and numbers on
  flat/brand-colour backgrounds, with strikethrough prices, percentage badges,
  promo-code tags and countdown/urgency cues. Never live photography. LOOK-driven
  seams (keyframeLook, captionStyle, shotDirection, pacing) defer to the shared
  `graphic_text` base.

## Script / voice tone

A confident, upbeat announcer voiceover that calls out the deal on the frame
(saving, code, deadline, CTA), the same voice throughout, energetic and urgent,
reading as one cohesive VO. Not lip-synced; no first-person "I" story; short,
imperative, action-driving lines that end hard on the call-to-action.

## Canonical fragment prose

### storyboardTypeBlock
A designed sequence built around ONE deal — discount, sale, bundle or coupon —
pushed with urgency and a hard call-to-action, rendered as bold kinetic
typography. No live presenter, no first-person story. Each panel slams ONE deal
element large and legible: the headline saving ("40% OFF", "BOGO"), the promo
code, the urgency ("SALE ENDS SUNDAY", "TODAY ONLY") and the CTA ("SHOP NOW").
Big numbers, strikethrough prices and countdown cues persuade. A product cut-out
may anchor a frame but the deal terms and CTA carry it. The arc opens on the
headline offer, stacks the terms and urgency, and ends hard on the CTA. Each
scene's transcript is a short, punchy voiceover line that calls out the on-frame
deal.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line is a punchy, urgent voiceover that calls out the deal on the
frame — name the saving, code, deadline or CTA plainly, short and imperative; no
first-person "I" story, no soft close.

### videoVoice
"a confident, upbeat announcer voice".

### videoAudioLine
A natural human VOICEOVER reads each deal line (not lip-synced on screen), the
same voice throughout, energetic and urgent; a driving upbeat bed plus punchy
whooshes and a stamp/cash-register accent as the numbers and CTA punch in.

### narrativeTreatment
Promo / offer — a motion-graphics push built around one deal (discount, bundle or
code), stacking the terms and urgency and driving hard to a call-to-action,
carried by a confident, upbeat voiceover; each spoken beat calls out the on-frame
offer.
