---
name: ad-type-founder-pov
description: >-
  Founder POV ad type. The founder tells their own first-person origin and
  mission story ("I started this", "why we built it") — an insider account, not
  a customer review or a hired host. Polished, voiceover-led, intimate to camera
  or over filmed beats of their world. Use when authoring or revising the
  founder-pov ad type's detection cues, asset policy, hooks, look, voice, and the
  canonical prompt-fragment prose that defs/founder-pov.ts carries in its
  FragmentSet.
---

# Ad type — Founder POV

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/founder-pov.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods in
> the def. This is a NET-NEW type, so the prose is authored (no verbatim legacy
> source).

## Intent

The person who built the product speaks in first person about *why it exists* —
their origin, the problem they personally hit, the belief or mission behind it.
The job is to earn trust through the maker's real conviction: an honest founder
letter said aloud, not a sales pitch and not a customer's verdict. Best at the
top of the funnel where brand belief and a human face behind the product matter.

## Detection cues

Route here when the brief is told from the MAKER's seat — "I started", "why we
built", "our story", "when I founded", "the reason we created this", "as the
founder" — one insider voice recounting how/why the product came to be.

Neighbour disambiguation:

- A first-person account from a **customer/creator** who *bought or tried* the
  product ("I tried", "as a customer", "honest review") → `testimonial`, not
  here. Founder POV is the insider who *made* it.
- A polished **hired host / avatar reading a script** to pitch the product →
  `spokesperson`. Founder POV is the actual founder telling a personal story,
  not a presenter performing copy.
- A cinematic **brand mood piece with no named speaker** required (abstract
  values, customer-journey montage, anonymous VO) → `brand-story`. Founder POV
  is explicitly anchored to the founder as the on-screen/narrating "I".

## Asset policy

- **product: optional** — it appears as the thing the founder made, or is only
  referenced while they tell the story.
- **person: required** — the founder is the storyteller and credibility anchor;
  a person is mandatory (synthesized if none is uploaded).

## Favored hooks

- **defaultHooks:** `confession`, `problem-solution`
- **allowedHooks:** `confession`, `problem-solution`, `curiosity-gap`,
  `contrarian`, `direct-callout`, `relatable-scenario`, `question`,
  `pattern-interrupt`

The `confession` opener ("I'll be honest…", "for years I couldn't…") fits the
intimate founder register; `problem-solution` carries the why-we-built-it arc.

## Look & treatment

- **lookFamily:** `cinematic_polished` — produced, color-graded, voiceover-led
  keyframes; intimate to-camera framing or filmed beats of the founder's world
  and workspace. The LOOK-driven seams (`storyboardKeyframeLook`,
  `storyboardCaptionStyle`, `storyboardShotDirection`, `videoPacing`) defer to
  the shared base in `fragments/looks.ts`.

## Script / voice tone

First-person and insider: "I…", "we…", "that's why…". Sincere, grounded and
personal — an honest founder talking, never a customer's review and never
scripted announcer copy. Short lines that vary in length and read as one
continuous heartfelt account. No hard call-to-action close.

## Canonical fragment prose

The TYPE-driven seams carry this authored prose (the def is the source of truth;
keep these in sync).

### storyboardTypeBlock
The FOUNDER speaks in first person about why the product exists — origin, the
problem they personally hit, the mission behind building it. Insider/maker, not
a customer and not a hired host. Sincere and grounded, never a hard sell; the
arc runs from where it started → the driving problem/belief → what they built
and why it matters. Each scene's transcript is one short first-person founder
line, intimate to camera or as voiceover over a filmed beat of their world.

### storyboardSpeakerLabel
"the on-screen person" — the founder, present as the human anchor.

### storyboardTranscriptStyle
First-person founder speech with insider "I/we" framing ("I built this
because…", "that's why we…"); sincere and personal, never a customer review or
scripted announcer copy.

### videoVoice
"a sincere, grounded, personal founder voice".

### videoAudioLine
The founder SPEAKS each line in a sincere real voice — lip-synced when on
camera, or as their own intimate voiceover over a filmed beat — the same voice
throughout, short verbatim lines, light ambience or a restrained score, never a
loud hard-sell tone.

### narrativeTreatment
Founder POV — the founder narrates their own origin and mission in first person
across the beats (insider "I/we" framing, sincere not salesy), each spoken beat
a personal line moving the story from where it began to why the product matters.

## Notes

The distinguishing signal across all seams is *insider authorship*: the voice
owns the product's creation. If the voice merely *uses* or *reviews* the product,
it is `testimonial`; if it only *performs* a pitch, it is `spokesperson`.
