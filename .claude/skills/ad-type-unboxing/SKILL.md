---
name: ad-type-unboxing
description: >-
  Unboxing ad type. A real person (or just their hands) opens a just-arrived,
  sealed package on camera and reacts to the product as it's revealed for the
  first time — anticipation, the act of opening, the reveal, a genuine
  first-impression. Phone-captured on the shared ugc_authentic look. Use when
  authoring or revising the unboxing ad type's detection cues, asset policy,
  hooks, look, voice, and the canonical prompt-fragment prose that
  defs/unboxing.ts carries in its FragmentSet.
---

# Ad type — Unboxing

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/unboxing.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods in
> the def. The LOOK-driven seams defer to the shared `ugc_authentic` base in
> `fragments/looks.ts` and are not re-authored here.

## Intent

Capture the spontaneous moment a customer opens a just-arrived package and meets
the product for the first time. The job is to manufacture anticipation and
deliver a satisfying reveal — the sealed box is the question, the product is the
payoff — closing on a genuine, in-the-moment first impression rather than a
considered verdict or a sales pitch.

## Detection cues

Route here when the brief implies opening a package on camera or a first-look
reveal: "unboxing", "what's inside", "just arrived", "open the box", "first
impressions", "haul", "came in the mail", an arc that starts with a sealed
box/mailer/bag. There is usually a single creator and a strong before/after
contrast between closed package and revealed product.

Disambiguation (neighbours):
- A considered, talking-to-camera review of a product they already own →
  `testimonial`, not unboxing (no live package-opening beat).
- A feature-by-feature walkthrough of how the product works on a clean surface →
  `demo`, not unboxing (the open-the-package moment is the whole point here).
- Aggregated ratings/quotes or "everyone's getting one" graphics with no single
  reveal → `social-proof`.
- A polished, color-graded brand reveal with VO → `brand-story`; unboxing stays
  raw and phone-captured.

## Asset policy

- **product: required** — the product is the payoff of the reveal, so it must be
  present and shown emerging from the packaging.
- **person: optional** — a person's face and reaction add credibility, but the
  unbox can play on hands + product + voiceover alone if no person is uploaded.

## Favored hooks

- **defaultHooks:** `curiosity-gap`, `demonstration`
- **allowedHooks:** `curiosity-gap`, `demonstration`, `pattern-interrupt`,
  `social-proof`, `bold-claim`, `relatable-scenario`

The sealed package is a natural curiosity-gap opener; the act of opening and
showing is the demonstration.

## Look & treatment

- **lookFamily:** `ugc_authentic` (phone-captured, handheld, natural light, real
  lived-in setting, true skin/material texture). The LOOK-driven seams
  (`keyframeLook`, `captionStyle`, `shotDirection`, `pacing`) all defer to the
  shared base in `fragments/looks.ts`; do not re-author them per type.

## Script / voice tone

Excited, reactive, first-person and unscripted-sounding. Lines land in the
moment — naming what just appeared, reacting to it — with contractions and
casual phrasing, never an announcer or a rehearsed review read.

## Canonical fragment prose

One subsection per TYPE-driven seam; each carries the prose the def returns.

### storyboardTypeBlock
A genuine unboxing: a sealed box/mailer/bag that just arrived is opened on
camera and the product inside is revealed for the first time, spontaneous and
real. Move beat by beat across the panels — closed package held up (anticipation)
→ hands opening/tearing/lifting → the product emerging → the product held up close
and turned to show its key parts. The packaging and the reveal are the focus,
shown large and clear. Carry an honest first-impressions reaction through it and
end on that real first verdict, never a sales close. Avoid skipping straight to a
clean hero shot with no packaging, and avoid lifestyle filler that hides the box
or the moment of opening. Each scene's `transcript` is one natural, reactive
spoken line tied to what's being opened or revealed in that panel.

### storyboardSpeakerLabel
"the on-screen person" — when a person appears they're on camera reacting; the
hands-only/voiceover variant still routes through this label.

### storyboardTranscriptStyle
The spoken line is a live, reactive first-impression anchored to the moment in
the box (naming what just appeared or reacting to it), never a rehearsed review
read.

### videoVoice
"an excited, genuine, first-impressions voice".

### videoAudioLine
The on-screen person speaks each line lip-synced in a natural, excited real human
voice, mouth visible; include the real tactile sounds of opening the package
(tape, cardboard, rustle) and light room ambience, no music.

### narrativeTreatment
Unboxing — a real person opening the just-arrived package on camera and reacting
to the product as it's revealed, building from sealed box to first verdict; each
summary's spoken beat is a natural, reactive first-person line tied to that step
of the reveal.

## Notes

This is a NET-NEW type (no `legacyMapping`). Keep the def and this doc in sync —
`defs-skills-sync.test.ts` greps this file's path out of the def header comment
and checks the seam headings against the FragmentSet.
