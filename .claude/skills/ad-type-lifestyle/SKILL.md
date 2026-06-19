---
name: ad-type-lifestyle
description: >-
  Lifestyle ad type. An aspirational real-life use occasion — the product woven
  naturally into a desirable everyday scene, shot cinematically and carried by
  voiceover. Use when authoring or revising the lifestyle ad type's detection
  cues, asset policy, hooks, look, voice, and the canonical prompt-fragment
  prose in defs/lifestyle.ts.
---

# Ad type — Lifestyle

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/lifestyle.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods in
> the def.

## Intent

Show the product living inside a desirable everyday moment — a morning ritual, a
commute, a gathering, a workout — so the viewer wants the feeling of owning it.
The product is woven into the occasion in genuine use, never reviewed or
pitched. A polished lifestyle commercial that sells aspiration through context.

## Detection cues

Route here when the brief describes a product-in-use scene or occasion ("a day
in the life", "morning routine", "out on the trail", "at the dinner table",
"how it fits your day") shot like a commercial, with the product enjoyed in
context. Disambiguation:

- A concrete product-in-use occasion, no one addressing the lens → `lifestyle`.
- A person speaking first-person to camera reviewing it → `testimonial`.
- An abstract values / mood / brand-journey piece with no specific use occasion
  → `brand-story`.
- A clean studio/tabletop product showcase with no real-life setting →
  `product-demo`.

## Asset policy

- **product: required** — the hero that must be seen in genuine use.
- **person: optional** — a person makes the occasion relatable, but the scene
  can read aspirationally on the product and setting alone.

## Favored hooks

- **defaultHooks:** `relatable-scenario`, `pattern-interrupt`
- **allowedHooks:** `relatable-scenario`, `pattern-interrupt`, `curiosity-gap`,
  `direct-callout`, `bold-claim`

## Look & treatment

- **lookFamily:** `cinematic_polished` (intentional lighting, rich color and
  depth, lifted from a high-end commercial). The LOOK-driven seams
  (`storyboardKeyframeLook`, `storyboardCaptionStyle`, `storyboardShotDirection`,
  `videoPacing`) defer to the shared base in `fragments/looks.ts`.

## Script / voice tone

Warm, evocative voiceover, ~1 short sentence per scene, reading as one cohesive
VO over the visuals — observational and aspirational, naming the moment or the
feeling the product brings to it, never a feature list or hard sell. Not
lip-synced on screen.

## Canonical fragment prose

### storyboardTypeBlock
An aspirational everyday moment with the product woven in naturally as part of
the scene — used and enjoyed in a real occasion, the product the clear hero of
the moment, an aspirational arc over the ~15s (set the scene → product enters →
the payoff feeling). Each scene's transcript is a voiceover line over the
visuals, not lip-synced.

### storyboardSpeakerLabel
"the voiceover" — no live presenter reviews to camera.

### storyboardTranscriptStyle
Each line is observational and aspirational, naming the moment or the feeling
the product brings to it — not a feature list or a hard sell.

### videoVoice
"a warm, aspirational narrator".

### videoAudioLine
A natural human VOICEOVER narrates each line over the scene (not lip-synced on
screen), same voice throughout; light naturalistic ambience plus an understated
fitting score.

### narrativeTreatment
Lifestyle — a polished, aspirational real-life occasion with the product woven
into the moment in genuine use, carried by voiceover; each spoken beat is a
warm, observational voiceover line about the moment.

## Notes

NET-NEW type — no `legacyMapping`. Keep this doc and the def in sync: the
TYPE-driven seam prose above must match the strings in `defs/lifestyle.ts`.
