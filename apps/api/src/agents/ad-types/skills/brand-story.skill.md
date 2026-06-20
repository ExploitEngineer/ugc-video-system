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

### videoPacing
(Overrides the look base.) Smooth gimbal or dolly, NEVER handheld: ONE flowing camera move per beat — a slow establishing dolly, smooth tracking through the human and product moments, rising to settle on the logo. Shallow depth of field, rich graded light, a swelling score under natural ambience.

## Notes

Behaviour must remain byte-identical to the pre-refactor `inspirational` path.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the
EXACT directive lines spliced into the prompt (one array element per line,
verbatim). VERBATIM legacy prose — do not reword (guarded by
`fragment-regression.test.ts`). LOOK-driven seams are omitted (they come from the
`cinematic_polished` look base).

### storyboardTypeBlock

```
AD TYPE — Inspirational (open-ended cinematic):
- The ad is an evocative, cinematic scene that follows whatever the
  user describes (mood, journey, lifestyle, story), with the product
  woven in naturally. The arc builds an emotional through-line over
  the ~15s.
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
Treatment: inspirational — a cinematic scene carried by voiceover narration. The spoken beat in each summary is a voiceover line.
```

### videoPacing

```
- Smooth gimbal or dolly, NEVER handheld: ONE flowing camera move per beat — a slow establishing dolly, smooth tracking through the human and product moments, rising to settle on the logo. Shallow depth of field, rich graded light, a swelling score under natural ambience.
```
