---
name: ad-type-explainer
description: >-
  Explainer ad type. An educational breakdown of how the product/service works or
  why it matters — "here's how", "the science", "why X" — rendered as motion
  graphics / kinetic typography with voiceover and no live footage. Use when
  authoring or revising the explainer ad type's detection cues, asset policy,
  hooks, look, voice, and the canonical prompt-fragment prose in
  defs/explainer.ts.
---

# Ad type — Explainer

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/explainer.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. This is a NET-NEW graphic_text type
> (no legacy branch); the TYPE-driven fragment prose is authored here and mirrored
> in the def.

## Intent

Teach one idea so the viewer understands it: how the product works, the mechanism
or science behind it, or why a problem matters — rendered as bold motion graphics,
kinetic typography, simple diagrams and labelled animated steps. The persuasion is
clarity, not emotion: a logical walk-through, not a filmed scene. There is no
on-camera presenter and no real product footage.

## Detection cues

Route here when the brief asks to EXPLAIN or TEACH: "here's how it works", "the
science behind", "why X matters", "what makes it different", "explained", a
step-by-step / diagrammed breakdown of a mechanism or concept. Disambiguation:

- **vs product-demo** — product-demo proves a benefit with REAL in-use footage of
  the physical product being operated (demo_clean studio look). Explainer is
  abstract graphics/diagrams/type, no real footage. Hands operating the product →
  product-demo; animated steps and diagrams explaining the concept → explainer.
- **vs brand-awareness** — both are typography/no-footage graphic_text, but
  brand-awareness is an identity / values / manifesto statement, while explainer
  is INFORMATIONAL (how/why something works). "This is who we are" → brand-
  awareness; "here's how/why it works" → explainer.
- **vs brand-story** — brand-story is an emotional, filmed cinematic narrative;
  explainer is an informational graphics breakdown. Mood and feeling → brand-
  story; teaching and understanding → explainer.
- **vs social-proof** — social-proof stacks external proof (ratings, quotes,
  counts, logos); explainer walks through how/why something works. Credibility
  montage → social-proof; concept walk-through → explainer.

## Asset policy

- **product: optional**, **person: optional** — a concept can be explained
  entirely with animated graphics, diagrams and voiceover. A clean product
  cut-out, inset or schematic may anchor a frame to show what is being explained,
  and a face may appear as an accent, but NEITHER asset is required.

## Favored hooks

- **defaultHooks:** `question`, `curiosity-gap`
- **allowedHooks:** `question`, `curiosity-gap`, `stat-shock`,
  `problem-solution`, `contrarian`, `unexpected-comparison`, `bold-claim`,
  `pattern-interrupt`, `negativity-bias`

## Look & treatment

- **lookFamily:** `graphic_text` — bold motion-graphics frames, clean kinetic
  typography as the primary subject, large legible headline words and numbers on
  flat/brand-colour backgrounds, simple iconography, diagrams and labelled steps.
  Never live photography. LOOK-driven seams (keyframeLook, captionStyle,
  shotDirection, pacing) defer to the shared `graphic_text` base.

## Script / voice tone

A clear, knowledgeable explainer voiceover that narrates the on-frame explanation
step by step, the same voice throughout, reading as one cohesive teaching VO. Not
lip-synced; no first-person "I" story; no hard sales close — clarity does the
convincing.

## Canonical fragment prose

### storyboardTypeBlock
An educational how/why breakdown rendered as bold kinetic typography, simple
diagrams, labelled steps and animated icons — no presenter, no real product
footage; the explanation itself is the subject. Each panel advances ONE step
large and legible (a posed question, a defined term, a numbered step, a labelled
diagram, a "so that's why…" payoff), and the clarity of the breakdown IS the
persuasion. A product cut-out or schematic may anchor a frame but the words,
numbers and diagrams carry it. The arc is logical, not emotional: open on the
question or surprising fact, walk through the how/why step by step, land on the
clear takeaway. Each scene's transcript is a short voiceover line that reads out
the on-frame explanation.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line is a clear, teaching voiceover that narrates the step on the
frame — explain the how or why plainly and informatively, building one point to
the next; no first-person "I" story, no hard sales close.

### videoVoice
"a clear, knowledgeable explainer voice".

### videoAudioLine
A natural human VOICEOVER narrates each explanation line (not lip-synced on
screen), the same voice throughout, teaching and clear; subtle whoosh/tick accents
and a light neutral bed are allowed as the type and diagrams animate in.

### narrativeTreatment
Explainer — a motion-graphics breakdown of how the product works or why it
matters, built step by step with diagrams and kinetic type and carried by a clear
teaching voiceover; each spoken beat narrates the on-frame explanation.

### videoPacing
(Overrides the look base.) Clean flat-design motion, NO camera: the problem line types in, then three labelled steps (or a simple diagram) enter in causal order with smooth eases, resolving on the payoff and CTA. Keep all text legible, light music bed, soft UI ticks.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Explainer (an educational HOW/WHY breakdown as pure motion graphics):
- The ad TEACHES one idea — how the product works, the mechanism or science
  behind it, or why a problem matters — rendered as bold kinetic typography,
  flat-design diagrams, labelled animated steps and simple icons. There is NO
  on-screen presenter and NO real product footage; the designed explanation IS
  the subject, and clarity (not emotion) does the persuading.
- Build the panels as a logical 4-beat teaching arc, each panel ONE step, large
  and legible: Panel 1 = a title / hook card ("HOW IT WORKS" or a posed question
  or surprising stat) in oversized bold type; Panel 2 = a labelled 3-4 step flow
  with arrows and flat icons, each step's short label in quotes; Panel 3 = a
  simple cutaway/diagram of the mechanism with leader-line labels showing WHY it
  works; Panel 4 = a clean summary / takeaway card landing the key payoff plus a
  light brand mark.
- The product appears only as a clean cut-out, inset or schematic to anchor WHAT
  is being explained — the words, numbers, arrows and diagrams always carry the
  frame. Keep every label and number verbatim and perfectly legible (legibility
  is the #1 failure mode for this look); no live photography, no people.
- Each scene's `transcript` is a short VOICEOVER line that reads out that panel's
  on-frame explanation (e.g. "Here's how it actually works", "Step two: it locks
  the seal", "And that's why it lasts twice as long"), building one point to the
  next so the lines read as one cohesive, clear teaching voiceover.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a clear, teaching voiceover that narrates the step on
  the frame — explain the how or why plainly and informatively, building one
  point to the next; keep it short (5-10 words), no first-person "I" story, no
  hard sales close.
```

### videoVoice

```
a clear, friendly, knowledgeable teacher voice
```

### videoAudioLine

```
Audio: a friendly, teacherly real human VOICEOVER narrates each explanation line off-screen (no lip-sync, no on-screen person), the SAME voice throughout; quote each line verbatim in its time-slice and keep it short, even and clear; a light neutral music bed plus soft UI ticks/whooshes as the type and diagrams animate in — no people on screen, keep all text and numbers legible, no garbled letters.
```

### narrativeTreatment

```
Treatment: explainer — a motion-graphics breakdown carried by a friendly teaching voiceover; segment 1 opens on the question/title card, segment 2 walks the labelled how-it-works steps, segment 3 reveals the WHY with a diagram/cutaway, segment 4 lands the clear takeaway and brand mark; no presenter, no real product footage — the spoken beat in each summary narrates the on-frame explanation.
```

### videoPacing

```
- Clean flat-design motion, NO camera: the problem line types in, then three labelled steps (or a simple diagram) enter in causal order with smooth eases, resolving on the payoff and CTA. Keep all text legible, light music bed, soft UI ticks.
```
