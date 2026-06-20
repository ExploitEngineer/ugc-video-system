---
name: ad-type-product-showcase
description: >-
  Product Showcase ad type. A hero/glamour treatment that shows off the product
  itself — static beauty shots plus features/benefits, with no narrative arc and
  no step-by-step in-use function. Use when authoring or revising the
  product-showcase ad type's detection cues, asset policy, hooks, look, voice,
  and the canonical prompt-fragment prose that defs/product-showcase.ts carries
  in its FragmentSet.
---

# Ad type — Product Showcase

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/product-showcase.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods.
> LOOK-driven seams (keyframeLook, captionStyle, shotDirection, pacing) defer to
> the shared `demo_clean` base in `fragments/looks.ts` and are not re-authored.

## Intent

Make the product look its absolute best and let it carry the ad on its own. The
job is pure desire-building: confident hero shots and tight feature/benefit
details, presented directly with no story, no person's review, and no in-use
walkthrough. Funnel stage: **consideration**.

## Detection cues

Route here when the brief asks to "show off / showcase the product," wants
"hero shots," "glamour shots," "beauty shots," "highlight the features," or a
clean product-focused reveal with no person and no usage steps. Cues: the
product is the subject, language is feature/benefit-forward, no action verbs
about operating it.

Neighbour disambiguation:
- vs **product-demo** — showcase is STATIC beauty + features; the moment the
  brief shows the product *functioning / being used / steps to operate it*, it is
  `product-demo`, not showcase.
- vs **lifestyle** — showcase isolates the product as a hero; product woven into
  a desirable human/real-life context → `lifestyle`.
- vs **testimonial** — no person gives a spoken first-person review here; one
  person reviewing to camera → `testimonial`.
- vs **before-after** — no time-based contrast of two states; a before→after
  transformation → `before-after`.
- vs **comparison** — no named rival or "old way" reference; a side-by-side
  against a competitor → `comparison`.

## Asset policy

- **product: required** — the product is the subject and cannot be skipped.
- **person: optional** — at most a background prop; never owns the frame.

Rationale: a glamour/hero ad is defined by the product being shown off, so the
product step can never be skipped, while a presenter is unnecessary.

## Favored hooks

- **defaultHooks:** `bold-claim`, `curiosity-gap`, `stat-shock`
- **allowedHooks:** `bold-claim`, `curiosity-gap`, `stat-shock`,
  `pattern-interrupt`, `question`, `before-after`, `demonstration`,
  `unexpected-comparison`, `social-proof`

## Look & treatment

- **lookFamily:** `demo_clean` (crisp studio/tabletop product photography — the
  product is the clear hero on a clean surface or seamless backdrop, controlled
  even lighting, accurate colour, sharp macro detail, deliberate reveal-and-hold
  pacing, minimal clean captions). The LOOK-driven seams defer to the shared base
  in `fragments/looks.ts`.

## Script / voice tone

Voiceover-led, no live presenter. Crisp, confident, benefit-forward premium ad
copy in third person — name one feature or benefit per line, short and upscale,
never conversational and never first-person.

## Canonical fragment prose

The TYPE-driven seams carry the prose below.

### storyboardTypeBlock
A hero/glamour reveal that shows the product off as the star: confident hero
shots, flattering angles, tight macro feature/benefit details — one selling point
per panel, reading as a feature/benefit montage. NOT a person's review, NOT an
in-use walkthrough, NOT a story or lifestyle scene; the product stays large,
sharp and unobstructed in every panel. Each scene `transcript` is one short
voiceover line naming the feature or benefit that panel shows off, and the lines
read as one cohesive voiceover.

### storyboardSpeakerLabel
"the voiceover" (no live presenter; `demo_clean` graphic/VO treatment).

### storyboardTranscriptStyle
Third-person product/benefit copy spoken as voiceover — no first-person "I", no
in-use narration; one feature or benefit per line, short and confident.

### videoVoice
"a polished, confident premium-brand announcer voice".

### videoAudioLine
A polished voiceover (not lip-synced on screen) states each feature/benefit line
in the same confident voice throughout, quoted verbatim and kept short; a
tasteful upscale score and subtle product-foley accents are allowed.

### narrativeTreatment
Product Showcase — a hero montage showing the product off with glamour shots and
tight feature/benefit details, no story arc and no in-use steps; each spoken beat
is a confident voiceover line naming one feature or benefit.

### videoPacing
(Overrides the look base.) ONE slow camera move per beat: a gentle orbit or push-in that reveals the product, then settle and HOLD the hero shot. Soft studio light, shallow depth of field, crisp product SFX under a subtle music bed.

## Notes

Keep the showcase boundary sharp: the instant the brief implies the product
being operated, used, or stepped through, it belongs to `product-demo`, not here.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Product Showcase (a hero/glamour reveal of the product itself):
- The ad SHOWS OFF the product as the undisputed star — clean, premium beauty
  shots that make it look its best. NOT a person reviewing it, NOT a how-to /
  in-use walkthrough, and NOT a story or lifestyle scene. There is no narrative
  arc and no step-by-step function: the four panels are a feature/benefit
  montage, not a sequence of actions.
- Direct the 4-panel grid as a cohesive glamour SET — keep lighting, background
  and grade identical across all panels so they read as one shoot. Vary only the
  camera distance and angle: Panel 1 a confident front three-quarter HERO on a
  seamless sweep; Panel 2 a tight MACRO of the key feature, texture or finish;
  Panel 3 a clean top-down FLAT-LAY of the whole product; Panel 4 a dramatic
  low-angle hero with a soft reflection. The product fills ~50-70% of each frame,
  centered, large, sharp and unobstructed, with its label/markings legible.
- Each panel highlights ONE selling point (a standout feature, material or
  benefit) — call out what that crop is showing off (the finish, the build, a
  benefit) so the set reads as premium catalog copy in pictures.
- A person, if present at all, is only a background prop holding or framing the
  product and never owns the frame. Preserve product geometry, label text, logo
  and exact colors from the reference in every panel — do not restyle, recolor,
  re-letter or invent markings.
- Each scene's `transcript` is ONE short VOICEOVER line (third-person, no "I",
  no in-use narration) naming the feature or benefit that panel shows off —
  crisp, confident, benefit-forward premium ad copy. The four lines read as one
  cohesive voiceover building the product's appeal.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
Each transcript line is third-person product/benefit copy spoken as voiceover
(no first-person "I", no in-use narration) — one feature or benefit per line,
short, confident and upscale, like premium ad copy rather than conversation.
```

### videoVoice

```
a polished, confident premium-brand announcer voice
```

### videoAudioLine

```
Audio: an off-screen VOICEOVER (a calm, confident announcer, measured pace) states each feature/benefit line in the SAME voice throughout, quoted verbatim and kept short (5-10 words); crisp product-foley accents and a subtle, upscale music bed underneath; keep any on-screen product text and logo legible — no garbled logo text, no morphing product.
```

### narrativeTreatment

```
Treatment: Product Showcase — a glamour hero montage in four beats, no story arc and no in-use steps: open on the confident hero shot, move to a tight macro of the standout feature/texture, then a clean top-down or alternate angle, and resolve on a dramatic hero with the brand mark; each spoken beat is one short confident voiceover line naming a single feature or benefit.
```

### videoPacing

```
- ONE slow camera move per beat: a gentle orbit or push-in that reveals the product, then settle and HOLD the hero shot. Soft studio light, shallow depth of field, crisp product SFX under a subtle music bed.
```
