---
name: ad-type-product-demo
description: >-
  Product Demo ad type. A function-first ad that shows the product being used,
  step by step, so the viewer understands how it works ("how it works", "in
  action", "watch it work") — clean studio/tabletop product photography, no
  presenter required. Use when authoring or revising the product-demo ad type's
  detection cues, asset policy, hooks, look, voice, and the canonical
  prompt-fragment prose in defs/product-demo.ts.
---

# Ad type — Product Demo

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/product-demo.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods. The
> LOOK-driven seams (`storyboardKeyframeLook`, `storyboardCaptionStyle`,
> `storyboardShotDirection`, `videoPacing`) defer to the shared `demo_clean`
> base in `fragments/looks.ts` and are not authored here.

## Intent

Prove how the product works by showing it in use. The job is to advance a viewer
from interested to convinced by walking through a concrete, function-first
sequence — setup, action, the key mechanism doing its job, the visible result —
so they understand exactly what the product does and how. The product, shown
working, is the hero; any human presence only operates it.

## Detection cues

Route here when the brief is about the product's FUNCTION and process: "how it
works", "in action", "watch it work", "step by step", "see it do X", "how to
use it", a setup-to-result walkthrough. Expect clear stages and a visible
mechanism rather than mood or endorsement.

Disambiguation (neighbours):

- vs **product-showcase** → a demo shows the product *in use* with readable
  steps and a working mechanism; product-showcase is a static hero / glamour
  reveal emphasising desirability over function. If the brief stresses *what it
  does* and *how*, choose product-demo; if it stresses *how good it looks*,
  choose product-showcase.
- vs **how-to / tutorial** → a demo proves THIS product works (product is the
  subject); a how-to teaches a general task or skill where the product is just
  one tool. If the takeaway is "this product does the job", choose product-demo.
- vs **testimonial** → a demo is product-led with a voiceover labelling steps; a
  testimonial is a person on camera giving a first-person verdict. No human
  review here.

## Asset policy

- **product: required** — the product is the subject and must be shown working;
  the demo cannot exist without it.
- **person: optional** — hands or a presenter may operate the product, but are
  not required; the focus stays on the product and its function.

## Favored hooks

- **defaultHooks:** `demonstration`, `problem-solution`
- **allowedHooks:** `demonstration`, `problem-solution`, `before-after`,
  `curiosity-gap`, `question`, `pattern-interrupt`, `stat-shock`,
  `relatable-scenario`

## Look & treatment

- **lookFamily:** `demo_clean` (crisp studio/tabletop product photography — the
  product is the hero on a clean, uncluttered surface, controlled even lighting,
  accurate colour, sharp macro detail, deliberate reveal-and-hold pacing). The
  LOOK-driven seams defer to the shared base in `fragments/looks.ts`.

## Script / voice tone

A clear, confident, instructive voiceover. Plain and direct, labelling each
step or benefit as it is shown ("press once to start", "now it locks in
place") — informative, not salesy, never an over-hyped announcer. Ends on the
result, not a hard call-to-action.

## Canonical fragment prose

The TYPE-driven seams below are authored to the `demo_clean` look (no live
presenter required). Keep this prose aligned with `defs/product-demo.ts`.

### storyboardTypeBlock
Function-first: the product is SHOWN being used, step by step, as the clear
hero — not posed as a static beauty shot and not a person reviewing it. Panels
walk a real sequence (setup → in action → key feature/mechanism → visible
result); each panel advances one concrete step. Hands or a presenter may operate
it, but focus stays on the product and what it's doing, parts and controls
readable. Each `transcript` is a short voiceover line naming the step or benefit
in that panel; the lines read as one clear walkthrough ending on the result.

### storyboardSpeakerLabel
"the voiceover" — VO-led demo, no live presenter on camera.

### storyboardTranscriptStyle
Each transcript line is a short, plain voiceover label for the step shown in
that panel — name the action, the feature, or the result it produces.

### videoVoice
"a clear, confident, instructive voice".

### videoAudioLine
A clear human voiceover walks through the steps (not lip-synced on screen), the
same voice throughout; lines quoted verbatim, short and instructive; tactile
product sounds (clicks, taps, mechanism) where they fit, light or no music.

### narrativeTreatment
Product demo — a function-first walkthrough that shows the product being used
step by step. Each summary advances one concrete step (setup → action → key
feature → result); the spoken beat is a short voiceover label for that step.

## Notes

Net-new type with no legacy mapping. Do not set `legacyMapping` in the def. Keep
the function/step emphasis sharp so the detector separates this from the static
product-showcase reveal.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Product Demo (the product SHOWN being USED, step by step — function first):
- This is a clean demo_clean sheet: studio/tabletop product photography on a
  seamless white or soft neutral-gradient sweep, the product the clear hero,
  shown ACTIVELY IN USE — NOT a static beauty shot, NOT a person reviewing it.
- The 4 panels are an ORDERED function walkthrough, one concrete step each:
  Panel 1 — product at rest / closed / its starting state, hero on the sweep,
    label and key controls readable; transcript: name the product or the setup
    (e.g. "this is how it works").
  Panel 2 — hands enter and BEGIN the action: open it, press it, load it; close
    on the working part; transcript: name the first action ("press once to start").
  Panel 3 — product MID-ACTION, the key feature or mechanism doing its job, the
    function visible and large; transcript: name the feature ("it locks in place").
  Panel 4 — the clear END RESULT / finished state, product at rest again with the
    outcome shown; transcript: name the result ("done in seconds"), not a sales close.
- Optional person = HANDS ONLY operating the product; focus stays on the product
  and what it is doing, its parts/controls/details sharp and macro-readable.
- If the product carries label text, reproduce it EXACTLY/verbatim from the
  reference — no invented words, no garbled letters, no extra logos.
- The four transcript lines read as ONE plain instructive voiceover walkthrough,
  setup → action → mechanism → result, ending on the outcome, never a hard CTA.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a short, plain VOICEOVER label for the step shown in
  that panel — name the action, the feature, or the result it produces; keep it
  under ~8 words, instructive and direct, never an over-hyped announcer pitch.
```

### videoVoice

```
a clear, confident, instructive voiceover
```

### videoAudioLine

```
Audio: a clear off-screen VOICEOVER (neutral, instructive, the SAME voice throughout, NOT lip-synced on screen) walks the steps, each line quoted verbatim and short; tactile interaction SFX (click, tap, pour, snap, mechanism) where they fit, light or no music; no garbled product label, keep the product unwarped.
```

### narrativeTreatment

```
Treatment: product demo — a function-first walkthrough across four segments: (1) product at rest / setup, (2) hands begin the action, (3) the key feature or mechanism doing its job, (4) the visible end result; each spoken beat is a short voiceover label for that step, closing on the outcome, not a sales close.
```
