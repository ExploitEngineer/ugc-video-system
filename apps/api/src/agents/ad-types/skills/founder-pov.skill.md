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

### videoPacing
(Overrides the look base.) Cinematic medium shot on a subtle gimbal (not handheld), camera locked during the spoken lines for clean lip-sync: settle on eye contact, hold through the delivery, a gentle slow push-in to close. Soft directional key, shallow depth of field, sincere synced dialogue, sparse piano underscore.

## Notes

The distinguishing signal across all seams is *insider authorship*: the voice
owns the product's creation. If the voice merely *uses* or *reviews* the product,
it is `testimonial`; if it only *performs* a pitch, it is `spokesperson`.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Founder POV (the MAKER telling their own first-person origin/mission story):
- The ad is the FOUNDER speaking in first person about why this product exists —
  the origin, the problem they personally hit, the belief that drove building it.
  They are the INSIDER who MADE it, NOT a customer reviewing a purchase and NOT a
  hired host reading ad copy. Sincere, grounded, never a hard sell, no hard CTA close.
- Render a cinematic 2x2 four-panel grid that reads as ONE continuous founder beat:
  (1) cinematic medium portrait of the founder, soft directional key + rim light,
  eye contact to camera, shallow depth of field, warm filmic grade;
  (2) the founder in their authentic origin/workspace setting, wider establishing
  frame — the world the product came from;
  (3) hands-on detail of the craft or the product they built, intimate close-up;
  (4) reflective close-up of the founder, a quiet, earned-conviction expression.
- IDENTITY LOCK across all four panels: keep the SAME founder — identical face,
  bone structure, hair, wardrobe and age — treated as fixed source material, never
  idealized or restyled; real skin texture (pores, fine flyaways), no plastic finish.
  If a product appears, preserve its exact label/colors verbatim, never reinvent it.
- Each scene's `transcript` is ONE short first-person founder line (intimate to
  camera, or as their own voiceover over a filmed beat): "I…", "we…", "that's why…".
  Keep lines short and varied so the four read as one heartfelt account moving from
  where it started → the driving problem/belief → what they built and why it matters.
```

### storyboardSpeakerLabel

```
the on-screen person
```

### storyboardTranscriptStyle

```
- Transcript lines are first-person FOUNDER speech with insider "I/we" framing
  (e.g. "I built this because…", "that's why we…"), sincere and personal —
  never a customer's review and never scripted announcer copy; no hard-CTA close.
```

### videoVoice

```
a sincere, grounded, personal founder voice
```

### videoAudioLine

```
Audio: the founder SPEAKS each line in the SAME sincere human voice throughout (fitting their apparent age, gender and energy) — lip-synced and camera locked while on screen, or as their own intimate voiceover over a filmed beat; quote each line verbatim, keep it short, calm and deliberate, over quiet room tone and a sparse piano underscore; no identity drift, no on-screen text, no loud hard-sell music.
```

### narrativeTreatment

```
Treatment: Founder POV — across the four 15s segments the founder narrates their own origin and mission in first person (insider "I/we" framing, sincere not salesy, no hard-CTA close): seg 1 opens intimate to camera on who they are and the spark, seg 2 returns to the origin problem/belief that drove them, seg 3 shows what they built and the craft behind it, seg 4 lands on why it matters now — each spoken beat a short personal founder line in one consistent voice.
```

### videoPacing

```
- Cinematic medium shot on a subtle gimbal (not handheld), camera locked during the spoken lines for clean lip-sync: settle on eye contact, hold through the delivery, a gentle slow push-in to close. Soft directional key, shallow depth of field, sincere synced dialogue, sparse piano underscore.
```
