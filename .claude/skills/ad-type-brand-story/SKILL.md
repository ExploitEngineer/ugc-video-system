---
name: ad-type-brand-story
description: >-
  Brand Story ad type. A cinematic, emotionally-driven narrative about brand
  values, world, or a customer journey — a polished mood piece with voiceover.
  Primary home of the legacy `inspirational` treatment. Use when authoring or
  revising the brand-story ad type's detection cues, asset policy, hooks, look,
  voice, and the canonical prompt-fragment prose in defs/brand-story.ts.
---

# Ad type — Brand Story

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/brand-story.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. For this legacy type the TYPE-driven
> fragment prose is moved **verbatim** from the pre-refactor `inspirational`
> branch (`// VERBATIM-MOVE` markers in the def).

## Intent

An evocative, cinematic scene that carries an emotional through-line over the
ad, with the product woven in naturally. The formalised legacy `inspirational`
type.

## Detection cues

Route here for a cinematic emotional brand narrative, values, "our journey", a
mood piece carried by voiceover over FILMED scenes. Disambiguation: filmed
cinematic scenes → `brand-story`; typography/no-footage text manifesto →
`brand-awareness`; a named founder telling their origin story → `founder-pov`.

## Asset policy

- **product: optional** and **person: optional** — an open cinematic scene can
  succeed with neither (mirrors the legacy `inspirational` freedom).

## Favored hooks

- **defaultHooks:** `curiosity-gap`, `pattern-interrupt`
- **allowedHooks:** `curiosity-gap`, `pattern-interrupt`, `question`,
  `relatable-scenario`, `bold-claim`

## Look & treatment

- **lookFamily:** `cinematic_polished` (intentional lighting, rich color and
  depth, lifted from a high-end commercial). LOOK-driven seams defer to the
  shared base.

## Script / voice tone

Evocative voiceover narration, ~1 short sentence per scene, reading as one
cohesive VO — not lip-synced on screen.

## Canonical fragment prose

### storyboardTypeBlock
An evocative cinematic scene following the user's described mood/journey/story;
each scene's transcript is a VOICEOVER line.

### storyboardSpeakerLabel
"the voiceover".

### videoVoice
"a calm, measured narrator".

### videoAudioLine
A natural human VOICEOVER narrates each line (not lip-synced on screen).

### narrativeTreatment
Inspirational — a cinematic scene carried by voiceover narration.

## Notes

Behaviour must remain byte-identical to the pre-refactor `inspirational` path.
