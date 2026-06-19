---
name: ad-type-problem-agitate-solve
description: >-
  Problem-Agitate-Solve (PAS) ad type. Opens on a named pain or frustration,
  agitates it, then lands the product as the resolution ("tired of", "sick of",
  "struggling with"). Pain-first arc rendered in the authentic phone-captured
  ugc look. Use when authoring or revising the PAS ad type's detection cues,
  asset policy, hooks, look, voice, and the canonical prompt-fragment prose in
  defs/problem-agitate-solve.ts.
---

# Ad type — Problem-Agitate-Solve (PAS)

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/problem-agitate-solve.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods.

## Intent

A structured pain-first narrative built on the PAS copywriting framework
(Problem → Agitate → Solve), grounded in loss aversion: the pain of a problem
is felt about twice as strongly as the pleasure of a gain. Name a relatable
frustration, intensify it so the viewer feels "that's me", then present the
product as the clean resolution. The contrast between the agitated problem and
the product's solve is the whole device.

## Detection cues

Route here when the brief leads with a **pain point** and resolves it with the
product — "tired of", "sick of", "fed up with", "struggling with", "the worst
part is", "until I found", "no more". A clear before-pain → product-relief arc.

Disambiguation (neighbours):
- **product-demo** starts *from the product* and walks its function; PAS starts
  *from the pain* and the product arrives late as the fix. If there is no
  dramatized problem up front → `product-demo`.
- **testimonial** leads with a *person's first-person verdict* on camera; PAS is
  a structured pain-first arc, typically voiceover-led, not a spoken review.
- **before-after** centers on a *visible time-state contrast* of one subject;
  PAS centers on a *named emotional/functional pain* and its resolution (it may
  borrow a before/after hook but the spine is the pain narrative).
- **comparison** contrasts the product against a *rival or "old way"*; PAS
  contrasts the *problem state* against the product, with no competitor.

## Asset policy

- **product: required** — the product must appear as the "solve"; the whole arc
  resolves on it.
- **person: optional** — the problem can be dramatized with product/scene
  footage or carried by voiceover; a person may appear in the relatable scenario
  but is not mandatory.

## Favored hooks

- **defaultHooks:** `problem-solution`, `negativity-bias`
- **allowedHooks:** `problem-solution`, `negativity-bias`, `pattern-interrupt`,
  `contrarian`, `question`, `relatable-scenario`, `before-after`,
  `curiosity-gap`

## Look & treatment

- **lookFamily:** `ugc_authentic` (phone-captured, handheld, natural light, real
  lived-in setting). The authentic look makes the dramatized problem read as a
  genuine relatable moment rather than a glossy ad. LOOK-driven seams
  (`storyboardKeyframeLook`, `storyboardCaptionStyle`, `storyboardShotDirection`,
  `videoPacing`) defer to the shared `ugc_authentic` base in
  `fragments/looks.ts`.

## Script / voice tone

Plain, conversational, pain-named language that the viewer recognises ("tired
of…", "sick of…", "struggling with…" → "now…"). The voice is empathetic and a
little frustrated through the problem, then shifts to relieved and confident on
the solve. Short, punchy lines that read as one continuous problem-to-relief
through-line. Voiceover-led, not lip-synced on screen.

## Canonical fragment prose

### storyboardTypeBlock
PAS arc across the panels: PROBLEM first (dramatize a real, relatable
frustration in an everyday setting so the viewer feels "that's me"), then
AGITATE (let the annoyance, cost, repeated hassle, or failed workaround sting),
then SOLVE (the product enters as the turning point and owns the closing panels,
resolving the exact pain set up earlier). Each scene's transcript is the line
for its beat — name the pain, twist it, then the relief — in plain, punchy
phrasing; the arc reads as one continuous through-line.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line maps to its PAS beat — name the pain, agitate it, then
deliver the relief — in plain, conversational, pain-named phrasing.

### videoVoice
"an empathetic, relatable voice that turns confident on the solve".

### videoAudioLine
A natural human VOICEOVER carries each line (not lip-synced on screen), the same
voice throughout — frustrated/empathetic on the problem, relieved and confident
on the solve.

### narrativeTreatment
Problem-Agitate-Solve — a pain-first arc: early summaries dramatize and agitate a
named frustration, later summaries introduce the product as the resolution; each
spoken beat is a voiceover line moving from problem to relief.

## Notes

Product is mandatory (it is the "solve"); never let the product appear before the
pain is established. Keep the agitation honest and relatable, not alarmist.
