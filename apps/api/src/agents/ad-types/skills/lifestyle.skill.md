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

### videoPacing
(Overrides the look base.) Cinematic but smooth (gimbal, not jittery handheld): slow tracking to establish the moment with the product present, a warm close detail of it in use, then a satisfied beat on the soft end card. Shallow depth of field, sun-kissed grade, ambient real-world sound under a warm music bed.

## Notes

NET-NEW type — no `legacyMapping`. Keep this doc and the def in sync: the
TYPE-driven seam prose above must match the strings in `defs/lifestyle.ts`.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Lifestyle (an aspirational real-life USE OCCASION, the product
woven into a desirable everyday moment, shot like a premium commercial):
- This is NOT a review or a pitch — no one addresses the lens. The product
  simply LIVES inside a real occasion (a slow morning, a commute, a trail,
  a dinner, a workout) and the viewer wants the feeling of owning it.
- The PRODUCT is REQUIRED and is the hero of the moment: clearly present
  and in GENUINE use in every panel, never background dressing. Reproduce
  it exactly from its reference (geometry, label text, logo, colors); only
  framing, environment and light change between panels.
- Build the 4-panel arc as a cinematic aspirational through-line:
  PANEL 1 — establish the moment: a wide, evocative frame of the desirable
  setting with the product naturally present, golden / soft natural light,
  shallow depth of field.
  PANEL 2 — the product enters the action: an optional person reaches for /
  uses / relies on it in believable everyday use, mid-gesture.
  PANEL 3 — close beauty detail of the product IN context (in-hand or in
  the scene), warm graded light catching its texture.
  PANEL 4 — the payoff beat: a satisfied, lived-in resolution frame, the
  product still visible, soft negative space for a brand end card.
- If a person appears, lock their identity (same face, hair, wardrobe)
  across all four panels and keep real skin texture — they interact with
  the product naturally, they never review it.
- Each scene's `transcript` is a VOICEOVER line for that scene (warm,
  observational, ~1 short sentence) spoken OVER the visuals — never
  lip-synced by anyone on screen; the lines read as one cohesive VO that
  names the moment and the feeling the product brings to it.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
Each line is observational and aspirational, naming the moment or the
feeling the product brings to it — not a feature list or a hard sell.
Keep it ~1 short sentence, evocative and breezy, reading as one continuous
voiceover across the scenes.
```

### videoVoice

```
a warm, aspirational, breezy narrator voice
```

### videoAudioLine

```
Audio: a natural human VOICEOVER narrates each line over the scene (off-screen, never lip-synced on camera), the SAME warm voice verbatim in every slice — quote each line short (5-10 words); light naturalistic ambience of the moment plus a fitting, understated warm music bed. — no on-screen text, no identity drift, no warped face.
```

### narrativeTreatment

```
Treatment: lifestyle — a polished, aspirational real-life occasion carried by voiceover across a 60s 4-segment arc: (1) establish the desirable everyday setting with the product naturally present; (2) the moment unfolds and the product enters genuine use; (3) the payoff feeling the occasion delivers, product clearly in context; (4) settle on a satisfied lived-in resolution and a soft brand end card. The product is required and stays the hero in genuine use throughout, never reviewed or hard-sold; each spoken beat is a warm, observational VO line about the moment.
```

### videoPacing

```
- Cinematic but smooth (gimbal, not jittery handheld): slow tracking to establish the moment with the product present, a warm close detail of it in use, then a satisfied beat on the soft end card. Shallow depth of field, sun-kissed grade, ambient real-world sound under a warm music bed.
```
