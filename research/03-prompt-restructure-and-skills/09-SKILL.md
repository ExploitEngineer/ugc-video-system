---
name: ad-type-testimonial
description: >-
  Testimonial / UGC Review ad type. A real person speaks first-person to camera
  giving an authentic, phone-captured review or endorsement. Home of the legacy
  `ugc` treatment. Use this skill when authoring or revising the testimonial ad
  type's detection cues, asset policy, hooks, look, voice, and the canonical
  prompt-fragment prose that defs/testimonial.ts moves into its FragmentSet.
---

# Ad type — Testimonial / UGC Review

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/testimonial.ts`
> This doc and that def are kept 1:1 by `defs-skills-sync.test.ts`. The section
> names under **Canonical fragment prose** map one-for-one to `FragmentSet`
> methods. When you change prose here, change the matching method there (and vice
> versa). For the two legacy types the prose is moved **verbatim** from the
> current prompt files — see the `// VERBATIM-MOVE` markers in the def.

## Intent

A credible peer gives an honest, first-person verdict on the product, in a
native, non-salesy, phone-captured style. The job is to lower skepticism by
showing a real human reaction before any brand claim. This is the formalised
legacy `ugc` type.

## Detection cues

Route the prompt here when the brief implies:

- a single named/implied **customer or creator** reviewing the product (not the
  founder → that's `founder-pov`; not a hired host reading a script → that's
  `spokesperson`);
- words like "review", "testimonial", "honest take", "what real users say",
  "as a customer";
- one **person on camera** speaking, as opposed to aggregated ratings/quotes
  (many signals, no single presenter → `social-proof`).

Disambiguation: authenticity claim is the key. A genuine first-person experience
→ `testimonial`; a scripted/hosted pitch (incl. AI avatar) → `spokesperson`.

## Asset policy

- **product: optional** — may be held, shown, or only referenced; if no product
  image is supplied, the product-reference step is skipped and the product
  becomes B-roll/insert when present.
- **person: required** — the human voice is the vehicle; a person is invented or
  derived if none is uploaded, and the person-reference step always runs.

(Encoded in `assetPolicy` on the def; `hasProduct`/`hasPerson` reach fragments as
explicit ctx params.)

## Favored hooks

- **defaultHooks:** `testimonial`, `problem-solution`
- **allowedHooks:** `testimonial`, `problem-solution`, `confession`,
  `direct-callout`, `before-after`, `question`, `relatable-scenario`,
  `social-proof`, `curiosity-gap`
- Asset guardrail: `testimonial`/`confession` need a person (always satisfied
  here). The hook's `openingDirective` is layered onto scene 1 / the first video
  slice by `hooks/compose.ts` — it does not change the base treatment below.

## Look & treatment

- **lookFamily:** `ugc_authentic` (phone-captured, handheld, natural light,
  talking-to-camera, minimal editing).
- The LOOK-driven seams (`storyboardKeyframeLook`, `storyboardShotDirection`,
  `videoPacing`, `storyboardCaptionStyle`) are **not re-authored here** — the
  def delegates them to the shared `ugc_authentic` base in `fragments/looks.ts`.
  Edit the look base to change them for all `ugc_authentic` types at once.

## Script / voice tone

First-person, conversational, unscripted-sounding; starts mid-thought; sounds
like a real person, never an announcer. The product is praised through lived
experience, not feature lists.

## Canonical fragment prose

The blocks below correspond to the **TYPE-driven** `FragmentSet` methods on
`defs/testimonial.ts`. For this legacy type they are the **verbatim** current
UGC strings; record them here so the doc and the runtime carry the same prose.
(LOOK-driven seams are intentionally omitted — they live in the look base.)

### storyboardTypeBlock

<!-- VERBATIM from image/storyboard/prompt.ts UGC `typeBlock`. Paste the exact
     current text. Product is presented on-camera, the person reviewing it. -->

### storyboardSpeakerLabel

<!-- VERBATIM: the "the on-screen person" wording from the UGC branch. -->

### storyboardTranscriptStyle

<!-- VERBATIM-IF-EXISTS: first-person spoken review lines. If the real file has
     no separate transcript ternary, leave this empty and the def returns []. -->

### videoVoice

<!-- VERBATIM: the former VOICE["ugc"] value (the Record is deleted). -->

### videoAudioLine

<!-- VERBATIM: the UGC side of the UGC-vs-voiceover audio line. -->

### narrativeTreatment

<!-- VERBATIM: the `isUgc === true` script-treatment branch from
     narrative-outline/prompt.ts. -->

## Notes

- Behaviour must remain byte-identical to the pre-refactor `ugc` path. Do not
  reword the verbatim blocks during the refactor; only relocate them.
- New, non-legacy ad types author original prose in these sections rather than
  moving existing strings.
