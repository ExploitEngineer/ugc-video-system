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

### videoPacing
(Overrides the look base.) Handheld, natural light with a cold-to-warm shift at the turn: slouched, frustrated framing on the pain, ONE hard cut to brighter upright energy as the product enters, then a relieved push-in to camera. Synced dialogue, ambient sound, no music.

## Notes

Product is mandatory (it is the "solve"); never let the product appear before the
pain is established. Keep the agitation honest and relatable, not alarmist.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Problem-Agitate-Solve (a pain-first arc the PRODUCT resolves):
- Direct the storyboard as a 4-panel narrative arc that runs PROBLEM →
  AGITATE → SOLVE → RELIEF, one beat per panel, read left-to-right as
  ordered steps — NOT four glamour angles and NOT a flat product demo.
- Panel 1 (PROBLEM): dramatize the named pain in a real, lived-in home
  setting — the messy, slow, broken, or annoying status quo — candid and
  relatable so the viewer thinks "that's me". POLICY GUARD: the product is
  ABSENT here; it must not appear before the pain is established.
- Panel 2 (AGITATE): push in close on the problem — the failed workaround,
  the repeated hassle, the cost — so the frustration stings; still no product.
- Panel 3 (SOLVE): the PRODUCT enters as the turning point — hands reaching
  for it / using it — clearly aimed at the exact pain set up in panels 1-2.
- Panel 4 (RELIEF): the satisfied better-after with the product visible; the
  contrast between the agitated problem and the clean solve is the whole point.
- Keep any on-screen person's identity, wardrobe, and hair consistent across
  all four panels (ugc_authentic handheld phone look, natural window light).
- Each scene's `transcript` is that beat's spoken line: panel 1 names the pain
  ("tired of…"), panel 2 twists the knife, panels 3-4 land the relief ("now…")
  — short, plain, conversational, one continuous problem-to-relief through-line.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
Each transcript line maps to its PAS beat — name the pain, agitate it, then
deliver the relief — in plain, conversational, pain-named phrasing ("tired
of…", "sick of…", "struggling with…" → "now…"). Keep each line short (under
~16 words) and verbatim-quotable; the lines chain into one through-line.
```

### videoVoice

```
an empathetic, relatable voice that turns confident on the solve
```

### videoAudioLine

```
Audio: a real human VOICEOVER carries each line in the SAME voice throughout — frustrated/empathetic over the problem, shifting to relieved and confident as the product solves it; quote each line verbatim in its slice, keep it short, with ambient room tone and a cold→warm tonal shift marking the turn; — no music, no logo, no on-screen text, no jitter, no warped hands.
```

### narrativeTreatment

```
Treatment: Problem-Agitate-Solve, 4 segments — (1) name the pain in a real everyday setting, (2) agitate it (cost, repeated hassle, failed workaround) so it stings, (3) introduce the PRODUCT as the turning point resolving that exact pain (POLICY GUARD: product never appears before the pain is established), (4) land the relieved better-after with the product visible; each spoken beat is a voiceover line moving frustrated→relieved across the arc.
```

### videoPacing

```
- Handheld, natural light with a cold-to-warm shift at the turn: slouched, frustrated framing on the pain, ONE hard cut to brighter upright energy as the product enters, then a relieved push-in to camera. Synced dialogue, ambient sound, no music.
```
