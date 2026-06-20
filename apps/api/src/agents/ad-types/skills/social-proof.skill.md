---
name: ad-type-social-proof
description: >-
  Social Proof ad type. Aggregated third-party proof rendered as motion graphics
  — star ratings, review snippets, press logos, user counts — with NO single
  presenter; bold kinetic typography carried by a confident voiceover. Use when
  authoring or revising the social-proof ad type's detection cues, asset policy,
  hooks, look, voice, and the canonical prompt-fragment prose in
  defs/social-proof.ts.
---

# Ad type — Social Proof

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/social-proof.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. This is a NET-NEW graphic_text type
> (no legacy branch); the TYPE-driven fragment prose is authored here and mirrored
> in the def.

## Intent

Persuade by consensus: a designed montage of aggregated third-party proof — star
ratings, short review quotes, customer/user counts, rating averages and press
logos — rendered as bold motion graphics. The volume and agreement of the proof
is the argument. There is no on-camera presenter and no single spoken account.

## Detection cues

Route here when the brief leans on AGGREGATED proof: "thousands of 5-star
reviews", "rated #1", "as seen in <press>", "join 50,000+ customers", a wall of
ratings/quotes/logos. Disambiguation:

- **vs testimonial** — testimonial is ONE real person speaking their own
  first-person review to camera (live, phone-captured). Social proof is the
  aggregate of many reviews as graphics, no presenter. A single named human
  account → testimonial; a stacked wall of ratings/quotes → social-proof.
- **vs stat-shock** — stat-shock leads on ONE dramatic statistic as the hook.
  Social proof stacks MANY proof points (ratings + counts + quotes + logos). One
  jaw-dropping number → stat-shock; a montage of credibility → social-proof.
- **vs brand-awareness** — both are typography/no-footage, but brand-awareness is
  a values/manifesto message; social-proof is specifically external proof.

## Asset policy

- **product: optional**, **person: optional** — the proof (ratings, quotes,
  counts, press logos) carries the ad as kinetic typography. A clean product
  cut-out or a face may appear as a supporting accent, but neither is required.

## Favored hooks

- **defaultHooks:** `social-proof`, `stat-shock`
- **allowedHooks:** `social-proof`, `stat-shock`, `curiosity-gap`, `question`,
  `bold-claim`, `before-after`, `pattern-interrupt`

## Look & treatment

- **lookFamily:** `graphic_text` — bold motion-graphics frames, clean kinetic
  typography as the primary subject, large legible headline words and numbers on
  flat/brand-colour backgrounds, simple iconography (stars, checkmarks, logos).
  Never live photography. LOOK-driven seams (keyframeLook, captionStyle,
  shotDirection, pacing) defer to the shared `graphic_text` base.

## Script / voice tone

A confident, credible announcer voiceover that reads the on-frame proof aloud
(rating, count, quote or source), the same voice throughout, reading as one
cohesive VO. Not lip-synced; no first-person "I" story; no hard sales close —
the numbers do the convincing.

## Canonical fragment prose

### storyboardTypeBlock
A designed sequence of PROOF as bold kinetic typography — star ratings, review
quotes, user/customer counts, rating averages, press/publication logos. No
presenter, no first-person account; each panel stacks ONE proof element large and
legible, the volume and consensus IS the persuasion. A product cut-out may anchor
a frame but the words/numbers carry it. The arc opens on the strongest proof,
stacks more, lands on the aggregate verdict. Each scene's transcript is a short
voiceover line that reads the on-frame proof aloud.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line is a confident voiceover stating the proof on the frame —
cite the rating, count, quote or source plainly and let the numbers convince; no
first-person "I" story, no sales close.

### videoVoice
"a confident, credible announcer voice".

### videoAudioLine
A natural human VOICEOVER reads each proof line (not lip-synced on screen), the
same voice throughout; rating/notification chimes and a light upbeat bed are
allowed as the numbers and stars animate in.

### narrativeTreatment
Social proof — a motion-graphics montage of aggregated ratings, review quotes,
counts and press logos, carried by a confident voiceover; each spoken beat reads
the on-frame proof.

### videoPacing
(Overrides the look base.) Snappy beat-synced motion graphics, NO camera: star ratings animate in and fill, review cards slide and stack on the rhythm, then the aggregate stat locks center. Keep every number legible, upbeat music bed, soft UI ticks.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Social Proof (aggregated third-party proof as motion graphics, NO person, NO live photography):
- The ad is a designed 4-panel montage of PROOF rendered as bold kinetic
  typography on flat brand-colour backgrounds — the words, numbers, stars and
  logos ARE the subject; there is no presenter and no first-person account.
- Panel 1 — a big star-rating card: a five gold-star row plus an oversized
  rating headline (e.g. the literal '4.9/5') filling the frame; transcript is
  the voiceover opening on the strongest proof, e.g. "Rated four-point-nine out
  of five."
- Panel 2 — a wall of stylised review-screenshot cards: short customer quotes
  in quote marks, each with its own 5-star row stacked in a grid; transcript
  reads one quote/consensus line aloud, e.g. "Thousands of five-star reviews."
- Panel 3 — a big-number stat callout in oversized bold sans-serif (e.g.
  '50,000+ Happy Customers'); transcript states the aggregate count, e.g. "Over
  fifty thousand people made the switch."
- Panel 4 — a press / publication logo strip with a pull-quote and the brand
  mark, landing the aggregate verdict; transcript is the closing VO line, e.g.
  "Loved everywhere — see why."
- A clean product cut-out may anchor a single frame as an accent, but the
  numbers/quotes/logos always carry it. Render every rating, count, quote and
  source name VERBATIM and perfectly legible; no garbled or invented text.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a confident voiceover that reads the on-frame proof —
  cite the rating, count, quote or source plainly and let the numbers convince;
  keep it short, no first-person "I" story, no hard sales close.
```

### videoVoice

```
a confident, credible, upbeat announcer voice
```

### videoAudioLine

```
Audio: a real human VOICEOVER (off-screen, NOT lip-synced) reads each proof line in the SAME energetic voice throughout, quoted verbatim and kept short; an upbeat music bed plus soft UI ticks and rating/notification chimes play as stars and numbers animate in. — no people on screen, keep all text and numbers legible, no garbled letters.
```

### narrativeTreatment

```
Treatment: social proof — a 60s 4-segment kinetic-typography montage carried by a confident voiceover: open on the strongest star rating, stack a wall of review quotes, hit the big aggregate count, then land the press-logo verdict + brand mark; each spoken beat reads the on-frame proof, NO presenter, NO live footage.
```

### videoPacing

```
- Snappy beat-synced motion graphics, NO camera: star ratings animate in and fill, review cards slide and stack on the rhythm, then the aggregate stat locks center. Keep every number legible, upbeat music bed, soft UI ticks.
```
