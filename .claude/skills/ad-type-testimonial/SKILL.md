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

## Notes

Behaviour must remain byte-identical to the pre-refactor `ugc` path; do not
reword the verbatim blocks.
