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

### videoPacing
(Overrides the look base.) Identical locked framing on both halves: hold the BEFORE state, ONE clean cut or quick wipe at the midpoint, then the AFTER state with a slow push-in on the improvement. Even lighting, stable camera, a light whoosh on the transition.

## Notes

High Meta-policy risk type — the after-forward guard is the load-bearing rule.
Keep this doc in sync with `defs/before-after.ts` (the sync test greps for the
def path string above).

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Before / After (a visible RESULT contrast driven by the product):
- The ad lands one transformation: a worse 'before' state turns into a better
  'after' result, with the PRODUCT as the agent of change. Arc across the 4
  panels: (1) establish the BEFORE state of the subject, neutral and honest;
  (2) the product enters and is applied/in use on that same subject; (3) the
  improved AFTER result of the same subject; (4) product hero beside the result.
- Render BEFORE and AFTER in the SAME clean studio/tabletop framing — identical
  surface, angle, distance and lighting — so the only thing that changes is the
  result and the contrast reads instantly. It is a RESULT-over-time contrast,
  NOT a step-by-step how-to (product-demo) and NOT a rival face-off (comparison).
- Demo_clean look: seamless white / soft neutral sweep, soft even softbox light
  from upper-left, gentle contact shadow, accurate true colour, macro-sharp on
  product label and on the changed surface; no props, no clutter, no people
  required. Lock the product's exact label text, logo, colours and geometry.
- Do NOT burn 'BEFORE' / 'AFTER' heading text — or any title/label overlay —
  into the panels. The contrast must read from the IMAGERY itself (the worse
  state versus the improved result in identical framing); the only in-image text
  is the product's own real label and the standard bottom caption bar.
- META POLICY GUARD (mandatory, do NOT soften): do NOT depict human weight-loss,
  body, skin, anti-aging or wrinkle transformations, body-part close-ups, or any
  'implied transformation' (e.g. the product beside a fit/healthy person).
  Restrict the contrast to PRODUCT, OBJECT, SURFACE or non-health results only,
  framed POSITIVELY and AFTER-FORWARD — never a degrading 'before' of a body.
- Each scene's `transcript` is ONE short VOICEOVER line for that panel — not
  lip-synced by anyone on screen — naming the before pain then the after win and
  building as one cohesive voice from problem to payoff (e.g. panel 1 names the
  before, the middle panels carry the product, the last lands the after result).
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Transcript lines are concise voiceover that names the before pain, then the
  after win — punchy and benefit-led (e.g. 'Before…' / 'After one use…'),
  5-10 words, never disparaging a person's body or appearance.
```

### videoVoice

```
a confident, reassuring voiceover that lands the payoff
```

### videoAudioLine

```
Audio: a natural human VOICEOVER narrates each line off-screen (not lip-synced on screen), the SAME measured voice verbatim throughout, building from the before to the satisfying after; a light whoosh on the before→after transition and a subtle uplifting music bed are welcome — no jitter, no morphing between states, no warped or restyled product, no garbled logo text, no degrading body 'before'.
```

### narrativeTreatment

```
Treatment: before/after — a 4-segment voiceover arc: (1) establish the worse before state of the subject in the same clean framing; (2) the product enters and acts on it; (3) the improved after result lands in identical framing so the change reads; (4) product hero holds beside the result with the payoff line; each spoken beat is one voiceover line moving problem → payoff, and for any body/skin/weight subject stay positive and after-forward, restricting the contrast to product/object/surface results with no degrading before split-screen (Meta guard).
```

### videoPacing

```
- Identical locked framing on both halves: hold the BEFORE state, ONE clean cut or quick wipe at the midpoint, then the AFTER state with a slow push-in on the improvement. Even lighting, stable camera, a light whoosh on the transition.
```
