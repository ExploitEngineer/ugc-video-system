---
name: ad-type-before-after
description: >-
  Before / After (Transformation) ad type. A product-led ad built around a
  visible contrast from a worse "before" state to an improved "after" result
  driven by the product, rendered in a clean studio/tabletop demo look with
  voiceover. Use when authoring or revising the before-after ad type's detection
  cues, asset policy, hooks, look, voice, and the canonical prompt-fragment
  prose in defs/before-after.ts. Carries the Meta before/after policy guard.
---

# Ad type — Before / After (Transformation)

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/before-after.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods in
> the def; the LOOK-driven seams delegate to the shared `demo_clean` base in
> `fragments/looks.ts`.

## Intent

Sell the result. The ad makes a worse "before" state and a better "after" state
visible side by side in time, with the product as the agent of change. The job
is to let the transformation do the persuading: establish the before, show the
product act, then hold on a satisfying, clearly-improved after.

## Detection cues

Route here when the brief promises a transformation or visible result over time
— "before and after", "transformation", "in one use", "watch it change", "from
X to Y", "results", "see the difference". One subject (an object, surface, room,
or person) shown in two time states.

Neighbour disambiguation:
- vs **product-demo** — demo shows a *process / how it works* step by step;
  before-after shows a *time-based result contrast* (the change, not the
  procedure).
- vs **comparison** — comparison contrasts the product against a *rival product
  or the "old way"*; before-after contrasts *two time states of the same
  subject* using one product.
- vs **problem-agitate-solve** — PAS leads with and dwells on the *pain*;
  before-after leads with the *visible state* and resolves quickly into the
  result, carried by the image contrast rather than agitation.

## Asset policy

- **product: required** — the product must visibly drive the change between the
  before and after states.
- **person: optional** — many transformations are object/surface based (cleaning,
  restoration, organisation, repair); a person may appear but isn't needed.

## Favored hooks

- **defaultHooks:** `before-after`, `problem-solution`
- **allowedHooks:** `before-after`, `problem-solution`, `curiosity-gap`,
  `stat-shock`, `negativity-bias`, `demonstration`, `pattern-interrupt`

## Look & treatment

- **lookFamily:** `demo_clean` — crisp studio/tabletop product photography, the
  product the clear hero, controlled even lighting, accurate colour. The
  LOOK-driven seams (`storyboardKeyframeLook`, `storyboardCaptionStyle`,
  `storyboardShotDirection`, `videoPacing`) defer to the shared base.
- Render the before and after in the **same** surface, angle and lighting so the
  change reads instantly; let the after reveal land and hold.

### Meta policy guard (mandatory)

Per Meta's Health & Wellness / Advertising Standards, literal side-by-side
before/after comparisons are **prohibited** for weight loss and for
anti-aging/wrinkle treatments, as is content implying negative self-perception.
For weight-loss, body, skin, anti-aging or wrinkle subjects: **do not** render a
literal before/after split-screen of a person and **do not** imply a degrading
"before". Use **positive, after-forward framing** — show the confident, improved
result and the product. This guard is encoded in the `storyboardTypeBlock` and
`narrativeTreatment` prose and must not be softened.

## Script / voice tone

Confident and reassuring, building from the before pain to the after win. Punchy
and benefit-led ("Before…" / "After one use…"); never disparaging a person's
body or appearance.

## Canonical fragment prose

The TYPE-driven seams carry this type's authored prose.

### storyboardTypeBlock
A visible contrast from a worse before state to a better after result, with the
product as the cause; same clean framing for both states so the change reads
instantly; early panels = before, product enters and acts, final panels hold on
the after. Includes the Meta policy guard (no literal body/skin before/after
split-screen; positive, after-forward framing instead). Each scene `transcript`
is one short voiceover line narrating before → product → after.

### storyboardSpeakerLabel
"the voiceover" — this is a graphic/product-led demo look with no required
on-screen presenter.

### storyboardTranscriptStyle
Concise voiceover that names the before pain then the after win — punchy and
benefit-led, never disparaging a person's appearance.

### videoVoice
"a confident, reassuring voice that lands the payoff".

### videoAudioLine
A natural human voiceover narrates each line (not lip-synced), same voice
throughout, building to the satisfying after; a light uplifting score and a
subtle reveal cue on the after are allowed.

### narrativeTreatment
Before/after — a transformation carried by voiceover, contrasting the worse
before with the improved after driven by the product; each beat moves problem →
payoff; body/skin/weight subjects stay positive and after-forward with no
degrading split-screen.

## Notes

High Meta-policy risk type — the after-forward guard is the load-bearing rule.
Keep this doc in sync with `defs/before-after.ts` (the sync test greps for the
def path string above).
