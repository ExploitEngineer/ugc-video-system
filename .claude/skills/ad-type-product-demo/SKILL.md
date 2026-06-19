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
