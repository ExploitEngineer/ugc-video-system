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
