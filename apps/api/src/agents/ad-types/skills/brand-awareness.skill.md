---
name: ad-type-brand-awareness
description: >-
  Brand Awareness / Manifesto ad type. A pure slogan / manifesto / value
  statement rendered in kinetic typography — the canonical no-product,
  no-person type, where words and motion graphics carry the whole ad with a
  confident voiceover. Use when authoring or revising the brand-awareness ad
  type's detection cues, asset policy, hooks, look, voice, and the canonical
  prompt-fragment prose in defs/brand-awareness.ts.
---

# Ad type — Brand Awareness / Manifesto

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/brand-awareness.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. This is a NET-NEW graphic_text type
> (no legacy branch); the TYPE-driven fragment prose is authored here and mirrored
> in the def.

## Intent

Build recognition and affinity by stating what the brand believes: a pure
slogan / manifesto / value statement rendered as bold motion typography. The
message itself is the whole ad — no product demo, no presenter. This is the
CANONICAL neither-asset type: typography and motion graphics carry everything,
even when no product image and no person are supplied.

## Detection cues

Route here when the brief is a values / belief / mission statement with no
demo and no narrative scenes: "we believe…", a tagline or rallying slogan,
manifesto language, brand-identity / awareness goals, "stand for", "our
mission". Disambiguation:

- **vs brand-story** — brand-story tells the values through FILMED cinematic
  scenes with a narrative arc (a journey, a world, characters). Brand-awareness
  states the values directly as TEXT in motion graphics, no footage. Filmed mood
  piece → brand-story; words-on-screen manifesto → brand-awareness.
- **vs social-proof** — both are typography / no-footage, but social-proof shows
  EXTERNAL proof (ratings, review quotes, press logos, counts). Brand-awareness
  is the brand's OWN belief/values message. Other people's praise → social-proof;
  the brand's own manifesto → brand-awareness.
- **vs spokesperson** — spokesperson has a live host delivering the message to
  camera. Brand-awareness has no presenter; the words are the hero.

## Asset policy

- **product: optional**, **person: optional** — the brand's words and motion
  typography carry the entire ad. A clean product cut-out or a brief face may
  flash as a supporting accent, but the manifesto stands on type alone with
  NEITHER asset present. This is the canonical no-product, no-person type.

## Favored hooks

- **defaultHooks:** `pattern-interrupt`, `contrarian`
- **allowedHooks:** `pattern-interrupt`, `contrarian`, `curiosity-gap`,
  `question`, `stat-shock`, `bold-claim`, `unexpected-comparison`,
  `direct-callout`

## Look & treatment

- **lookFamily:** `graphic_text` — bold motion-graphics frames, clean kinetic
  typography as the primary subject, large legible headline words on flat /
  brand-colour backgrounds, simple iconography and shape accents, ONE focal
  headline per frame. Never live photography; no presenter. LOOK-driven seams
  (keyframeLook, captionStyle, shotDirection, pacing) defer to the shared
  `graphic_text` base.

## Script / voice tone

A confident, conviction-driven brand voiceover that declares each manifesto
line on screen, the same voice throughout, reading as one cohesive statement of
belief. Not lip-synced; declarative and quotable; no feature list and no sales
close — the belief itself is the persuasion. A building, anthemic score may rise
as the words animate in.

## Canonical fragment prose

### storyboardTypeBlock
A pure slogan / manifesto rendered as bold kinetic typography — the brand's
belief, mission or values stated as words on screen, no product demo and no
presenter. Each panel lands ONE line of the manifesto large and legible,
building one continuous statement across the frames; words punch in and out on
brand colour with a single focal headline per frame. A product cut-out or brief
face may flash as a supporting accent but the words own every frame. The arc
opens on a pattern-interrupting line, escalates the belief, lands on the brand
name / tagline. Each scene's transcript is a short voiceover line that speaks the
on-frame manifesto words.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line is a confident, declarative voiceover that speaks the
on-frame manifesto words — a belief or value stated plainly, not a feature list
or sales close; punchy, quotable, brand-voiced.

### videoVoice
"a confident, conviction-driven brand voice".

### videoAudioLine
A natural human VOICEOVER declares each manifesto line (not lip-synced on
screen), the same voice throughout; a building, anthemic score is allowed as the
words animate in.

### narrativeTreatment
Brand awareness / manifesto — a kinetic-typography statement of the brand's
belief and values, no product demo and no presenter, carried by a confident
voiceover; each spoken beat speaks the on-frame manifesto words.

### videoPacing
(Overrides the look base.) Bold expressive kinetic type, NO camera: short phrases animate in one at a time on the rhythm, scale and weight shift to build to the core slogan, then the logo resolves. Abstract shapes and textures only, keep every word legible, anthemic music bed.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Brand Awareness / Manifesto (a value statement as pure kinetic typography):
- This is the CANONICAL neither-asset type: author for NO product and NO person on
  screen. There is no product cut-out and no face anywhere — words, motion graphics,
  brand colour and abstract shapes/textures carry the WHOLE ad. The typography IS the
  visual subject in every panel; never a photographic lifestyle scene, never a presenter.
- Lay the panels as one continuous manifesto that builds rhythm line by line:
  Panel 1 — the opening slogan / pattern-interrupting belief line set LARGE in bold
    kinetic type on a solid brand-colour field, the single focal headline of the frame.
  Panel 2 — the second manifesto line at a DIFFERENT weight and scale, escalating the
    belief; simple shape or color-block accent, generous safe margins.
  Panel 3 — the third line building the rhythm and conviction toward the payoff, type
    pushed for emphasis, still ONE focal headline.
  Panel 4 — the brand WORDMARK + tagline lockup resolving the statement, the final beat.
- Every on-frame line is rendered VERBATIM and perfectly legible — quote the exact words,
  no invented copy, no duplicate text, all kerning crisp; legibility is the #1 failure mode.
- The arc opens on a pattern-interrupting line, escalates the belief across the middle,
  and lands on the brand name / tagline as the closing frame.
- Each scene's `transcript` is a short VOICEOVER line that speaks that panel's on-frame
  manifesto words exactly (e.g. "We don't make ordinary"). The lines read as one cohesive,
  confident statement of belief — never a feature list, never a sales close.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a confident, declarative voiceover that speaks the on-frame
  manifesto words verbatim — a belief or value stated plainly, punchy and quotable,
  brand-voiced; not a feature list and not a sales close.
```

### videoVoice

```
a resonant, conviction-driven brand voice
```

### videoAudioLine

```
Audio: a real human VOICEOVER declares each manifesto line off-screen (there is no face, so nothing is lip-synced), the SAME resonant voice and cadence throughout; quote each line verbatim in its slice and keep it short; an anthemic, building music bed rises as the words animate in — or run music-only with the on-screen text carrying the message. — no people, no product, keep every word legible, no garbled letters.
```

### narrativeTreatment

```
Treatment: brand awareness / manifesto — a kinetic-typography statement of the brand's belief carried across four segments with NO product and NO person on screen: open on a pattern-interrupting belief line, escalate the values through the middle two segments, and resolve on the brand wordmark + tagline; a resonant voiceover speaks the on-frame manifesto words verbatim over an anthemic music bed.
```

### videoPacing

```
- Bold expressive kinetic type, NO camera: short phrases animate in one at a time on the rhythm, scale and weight shift to build to the core slogan, then the logo resolves. Abstract shapes and textures only, keep every word legible, anthemic music bed.
```
