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

### videoPacing
(Overrides the look base.) Fast-but-clean beat-synced kinetic type, NO camera (only the motion is fast): the offer slams in, supporting terms and a countdown tick in rhythmically, then the CTA and code lock center with a pulse. Keep the deal text and numbers legible, driving music, impact SFX.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Promo / Offer (a price/discount/urgency push as bold MOTION GRAPHICS, NO live presenter):
- The deal IS the subject: ONE offer — a discount, sale, bundle (BOGO) or coupon
  code — pushed with urgency and a hard call-to-action, rendered as flat kinetic
  typography on solid brand-colour fields. No on-camera person and no first-person
  story; oversized words, big numbers, strikethrough prices and countdown cues do
  all the persuading.
- 4-panel offer-card arc (label each cell "1"/"2"/"3"/"4", thin white gutters,
  equal self-contained panels): Panel 1 SLAMS the headline saving as the hook —
  an oversized "40% OFF" / "BUY 1 GET 1 FREE" filling the frame on brand colour.
  Panel 2 is the urgency card — "SALE ENDS SUNDAY" / "TODAY ONLY" with a subtle
  countdown/clock motif. Panel 3 is the code/terms card — the promo code in
  quotes ("USE CODE SAVE20"), strikethrough old price beside the new price; an
  optional clean product cut-out may anchor this frame as a supporting accent.
  Panel 4 is the hard-CTA button card — "SHOP NOW" / "CLAIM YOURS" locked centre.
- Render ALL copy verbatim and perfectly legible — quote each exact string, no
  duplicate text, no invented words, no garbled numbers; bold geometric sans-serif,
  high contrast, generous safe margins; flat vector graphics only, never a
  photographic lifestyle scene.
- The arc drives to action: open on the headline offer, stack the terms + urgency,
  END hard on the CTA so the viewer knows exactly what to do and that it expires.
- Each scene's `transcript` is a short, punchy VOICEOVER line for that panel that
  calls out the on-frame deal (e.g. "Forty percent off — this weekend only",
  "Use code SAVE20", "Shop now before it's gone"). One urgent, confident voice.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a punchy, urgent spoken line driving to the deal —
  short, imperative, action-driving (5-10 words), with contractions; no
  first-person "I" story, no soft close.
- The actual saving, code, price, deadline or URL stays ON-SCREEN as text; the
  SPOKEN line creates urgency WITHOUT reading the number, price, code or URL aloud.
- BAD: "Get 40% off with code SAVE40 at checkout." GOOD: "Tap the link — this
  price isn't sticking around."
```

### videoVoice

```
a confident, upbeat, high-energy announcer voice
```

### videoAudioLine

```
Audio: a natural human VOICEOVER (high-energy announcer, the SAME voice throughout, energetic and urgent) reads each deal line off-screen — NOT lip-synced, no on-screen person — quoting each line verbatim and short; a driving upbeat music bed plus punchy whooshes and a stamp/cash-register impact SFX as the numbers and CTA punch in; keep every deal number and code legible, no garbled letters, no jitter.
```

### narrativeTreatment

```
Treatment: promo / offer — a 60s motion-graphics push built around ONE deal, no live presenter: Segment 1 SLAMS the headline saving as the hook; Segment 2 stacks the supporting terms and the promo code; Segment 3 ramps the urgency (deadline + countdown); Segment 4 lands the hard call-to-action; carried throughout by one confident, upbeat voiceover that calls out the on-frame offer.
```

### videoPacing

```
- Fast-but-clean beat-synced kinetic type, NO camera (only the motion is fast): the offer slams in, supporting terms and a countdown tick in rhythmically, then the CTA and code lock center with a pulse. Keep the deal text and numbers legible, driving music, impact SFX.
```
