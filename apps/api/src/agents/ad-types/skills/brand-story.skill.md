---
name: ad-type-brand-story
description: >-
  Brand Story ad type. A cinematic, emotionally-driven narrative about brand
  values, origin, world, or a customer journey — a polished, structured mood
  piece with voiceover. Sibling of the `inspirational` type (an open evocative
  mood piece). Use when authoring or revising the brand-story ad type's detection
  cues, asset policy, hooks, look, voice, and the canonical prompt-fragment prose
  in defs/brand-story.ts.
---

# Ad type — Brand Story

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/brand-story.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. A `cinematic_polished` VO sibling of the
> `inspirational` type — both are voiceover-led cinematic; brand-story carries a
> structured through-story about the brand, inspirational an open evocative mood.

## Intent

A cinematic narrative with an emotional through-line about the brand — its
values, origin, world, or a customer journey — with the product woven in
naturally and carried by voiceover.

## Detection cues

Route here for a structured cinematic brand narrative — values, "our journey",
"why we exist", an origin/world story over FILMED scenes. Disambiguation: an open
evocative mood/feeling montage without a required through-story → `inspirational`;
typography/no-footage text manifesto → `brand-awareness`; a named founder telling
their origin story → `founder-pov`.

## Asset policy

- **product: optional** and **person: optional** — an open cinematic scene can
  succeed with neither.

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
A structured cinematic brand narrative following the user's described
values/journey/story; each scene's transcript is a VOICEOVER line.

### storyboardSpeakerLabel
"the voiceover".

### videoVoice
"a calm, measured narrator".

### videoAudioLine
A natural human VOICEOVER narrates each line (not lip-synced on screen).

### narrativeTreatment
Brand story — a cinematic brand narrative carried by voiceover narration.

### videoPacing
(Overrides the look base.) Smooth gimbal or dolly, NEVER handheld: ONE flowing camera move per beat — a slow establishing dolly, smooth tracking through the human and product moments, rising to settle on the logo. Shallow depth of field, rich graded light, a swelling score under natural ambience.

## Notes

A cinematic_polished VO type; LOOK-driven seams come from the shared base.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the
EXACT directive lines spliced into the prompt (one array element per line,
verbatim). LOOK-driven seams (other than the videoPacing override below) are
omitted — they come from the `cinematic_polished` look base.

### storyboardTypeBlock

```
AD TYPE — Brand Story (cinematic brand narrative):
- The ad is a structured, cinematic brand narrative that follows what the
  user describes (the brand's values, origin, world, or a customer
  journey), with the product woven in naturally. The arc builds an
  emotional through-line over the ~15s.
- Each scene's `transcript` is a VOICEOVER NARRATION line for that
  scene (evocative, ~1 short sentence), spoken over the visuals — it is
  NOT necessarily lip-synced by anyone on screen. The four lines should
  read as one cohesive voiceover.
```

### storyboardSpeakerLabel

```
the voiceover
```

### videoVoice

```
a calm, measured narrator
```

### videoAudioLine

```
Audio: a natural, real human VOICEOVER narrates each line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; a light fitting score is allowed.
```

### narrativeTreatment

```
Treatment: brand story — a cinematic brand narrative carried by voiceover narration. The spoken beat in each summary is a voiceover line.
```

### videoPacing

```
- Smooth gimbal or dolly, NEVER handheld: ONE flowing camera move per beat — a slow establishing dolly, smooth tracking through the human and product moments, rising to settle on the logo. Shallow depth of field, rich graded light, a swelling score under natural ambience.
```
