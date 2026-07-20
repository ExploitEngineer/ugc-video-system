---
name: ad-type-inspirational
description: >-
  Inspirational ad type. An evocative, cinematic VOICEOVER mood piece that
  follows the feeling or journey the user describes, over filmed scenes —
  product and person both optional. Reproduces the legacy `inspirational`
  treatment. Use when authoring or revising the inspirational ad type's
  detection cues, asset policy, hooks, look, voice, and the canonical
  prompt-fragment prose in defs/inspirational.ts.
---

# Ad type — Inspirational

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/inspirational.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The runtime fragment prose reuses the
> pre-ad-types `inspirational` lines so a run typed `inspirational` generates the
> same cinematic-VO output it did before the registry existed.

## Intent

An evocative, cinematic scene that follows the mood/feeling/journey the user
describes and carries an emotional through-line over the ad, with the product
woven in naturally — narrated by voiceover, not lip-synced.

## Detection cues

Route here for an open, evocative mood/feeling piece carried by voiceover over
FILMED scenes (a "journey", a montage of moments, an aspirational tone).
Disambiguation: a structured narrative about brand VALUES / origin / world →
`brand-story`; typography/no-footage text manifesto → `brand-awareness`; a named
founder telling their origin story → `founder-pov`.

## Asset policy

- **product: optional** and **person: optional** — an open evocative cinematic
  scene can succeed with neither (the legacy `inspirational` freedom).

## Favored hooks

- **defaultHooks:** `striking-visual`, `pattern-interrupt`
- **allowedHooks:** `striking-visual`, `pattern-interrupt`, `curiosity-gap`,
  `relatable-scenario`

## Look & treatment

- **lookFamily:** `cinematic_polished` (intentional lighting, rich color and
  depth, lifted from a high-end commercial). LOOK-driven seams defer to the
  shared base.

## Script / voice tone

Evocative voiceover narration, ~1 short sentence per scene, reading as one
cohesive VO — not lip-synced on screen.

## Notes

Reproduces the legacy `inspirational` treatment (cinematic voiceover). LOOK-driven
seams come from the `cinematic_polished` look base.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the
EXACT directive lines spliced into the prompt (one array element per line,
verbatim). LOOK-driven seams (other than the videoPacing override below) are
omitted — they come from the `cinematic_polished` look base.

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

### storyboardTranscriptStyle

```
- Each transcript line is a VOICEOVER narration line over the visuals (not
  lip-synced on screen): evocative, warm and human, ~1 short sentence, the four
  reading as one cohesive narration that follows the emotional arc.
- Real human phrasing, not ad copy; a character must never read a slogan,
  statistic, price or URL aloud, and never invent a specific figure the prompt
  did not give.
- BAD: "Our hydration system delivers 40% better performance." GOOD: "Some
  mornings, the water just tastes like a fresh start."
```

### videoVoice

```
a calm, measured narrator
```

### videoAudioLine

```
Audio: natural ambience under a light, fitting score.
```

### narrativeTreatment

```
Treatment: inspirational — a cinematic scene carried by voiceover narration. The spoken beat in each summary is a voiceover line.
```

### videoPacing

```
- Smooth gimbal or dolly, NEVER handheld: ONE flowing camera move per beat — a slow establishing dolly, smooth tracking through the human and product moments, rising to settle on the logo. Shallow depth of field, rich graded light, a swelling score under natural ambience.
```
