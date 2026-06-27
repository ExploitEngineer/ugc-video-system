---
name: ad-type-testimonial
description: >-
  Testimonial / UGC Review ad type. A real person speaks first-person to camera
  giving an authentic, phone-captured review or endorsement. Home of the legacy
  `ugc` treatment. Use when authoring or revising the testimonial ad type's
  detection cues, asset policy, hooks, look, voice, and the canonical
  prompt-fragment prose that defs/testimonial.ts moves into its FragmentSet.
---

# Ad type — Testimonial / UGC Review

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/testimonial.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to TYPE-driven `FragmentSet` methods. For
> this legacy type the prose is moved **verbatim** from the pre-refactor prompt
> files (`// VERBATIM-MOVE` markers in the def).

## Intent

A credible peer gives an honest, first-person verdict on the product in a
native, non-salesy, phone-captured style. The job is to lower skepticism by
showing a real human reaction before any brand claim. This is the formalised
legacy `ugc` type.

## Detection cues

Route here when the brief implies a single customer/creator reviewing the
product ("review", "testimonial", "honest take", "I tried", "as a customer"),
one person on camera speaking. Disambiguation: a genuine first-person customer
experience → `testimonial`; a scripted/hosted pitch (incl. AI avatar) →
`spokesperson`; the founder's own story → `founder-pov`; aggregated ratings/
quotes with no single presenter → `social-proof`.

## Asset policy

- **product: optional** — held, shown, or only referenced.
- **person: required** — the human voice is the vehicle (synthesized if none is
  uploaded).

## Favored hooks

- **defaultHooks:** `testimonial`, `problem-solution`
- **allowedHooks:** `testimonial`, `problem-solution`, `confession`,
  `direct-callout`, `before-after`, `question`, `relatable-scenario`,
  `social-proof`, `curiosity-gap`

## Look & treatment

- **lookFamily:** `ugc_authentic` (phone-captured, handheld, natural light,
  talking-to-camera). The LOOK-driven seams defer to the shared base in
  `fragments/looks.ts`.

## Script / voice tone

First-person, conversational, unscripted-sounding; starts mid-thought; sounds
like a real person, never an announcer.

## Canonical fragment prose

The TYPE-driven seams carry the **verbatim** legacy UGC strings.

### storyboardTypeBlock
The person actively demonstrates the product to the lens across the panels;
ends on a real personal verdict, never a sales close.

### storyboardSpeakerLabel
"the on-screen person".

### videoVoice
"a warm, conversational, natural-sounding voice".

### videoAudioLine
The on-screen person SPEAKS each line lip-synced, mouth visible.

### narrativeTreatment
UGC — a real person casually talking about the product the way they speak.

### videoPacing
(Overrides the look base.) Handheld iPhone micro-shake, eye-level medium shot held on the speaker; small natural head and hand movement, a gentle push-in to close. Natural light, synced lip dialogue, ambient room tone, no music.

## Notes

Behaviour must remain byte-identical to the pre-refactor `ugc` path; do not
reword the verbatim blocks.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the
EXACT directive lines spliced into the prompt (one array element per line,
verbatim). VERBATIM legacy prose — do not reword (guarded by
`fragment-regression.test.ts`). LOOK-driven seams are omitted (they come from the
`ugc_authentic` look base).

### storyboardTypeBlock

```
AD TYPE — UGC (a real person SHOWING the product to camera):
- The ad is a REAL PERSON talking TO CAMERA about the product the way
  they'd show it to a friend — relaxed, genuine, off-the-cuff. NOT a
  scripted ad, review read or sales pitch, and NOT silent lifestyle b-roll.
- They ACTIVELY DEMONSTRATE the product to the lens across the panels: hold
  it up close to camera, take it off / put it on (or pick it up / handle
  it), turn or rotate it to show its key parts and details, point at a
  feature, and show it actually working — like a creator doing a real
  hands-on review. The PRODUCT is the focus of most panels, shown clearly
  and large to camera, NOT just worn or held passively in the background.
- They look at and address the camera. The flow is natural: show the
  product → demonstrate / use it → an honest reaction. It ENDS on a real
  personal verdict, never a sales close or call-to-action.
- AVOID passive lifestyle filler that hides the product: walking in,
  dropping a bag, stretching, relaxing, gazing away, or candid moments not
  addressed to camera.
- Each scene's `transcript` is one natural spoken line the on-screen
  person says in that scene (first person, the way people really talk —
  contractions, casual phrasing, not ad copy), tied to what they're
  SHOWING/doing with the product. Keep lines short and let their length
  vary; the lines flow as one continuous, natural bit of talking.
```

### storyboardSpeakerLabel

```
the on-screen person
```

### videoVoice

```
a warm, conversational, natural-sounding voice
```

### videoAudioLine

```
Audio: the on-screen person SPEAKS each line lip-synced in a natural, real human voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short, mouth visible while speaking; light room ambience, no music.
```

### narrativeTreatment

```
Treatment: UGC — a real person casually talking about the product the way they actually speak (not a scripted ad or review read). The spoken beat in each summary is a natural first-person line.
```

### videoPacing

```
- Handheld iPhone micro-shake, eye-level medium shot held on the speaker; small natural head and hand movement, a gentle push-in to close. Natural light, synced lip dialogue, ambient room tone, no music.
```
