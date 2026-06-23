---
name: ad-type-spokesperson
description: >-
  Spokesperson / VSL ad type. A scripted host or presenter (including an AI
  avatar) delivers a polished, persuasive pitch straight to camera, leading the
  viewer from hook to offer to call-to-action. Use when authoring or revising the
  spokesperson ad type's detection cues, asset policy, hooks, look, voice, and the
  canonical prompt-fragment prose that defs/spokesperson.ts carries in its
  FragmentSet.
---

# Ad type — Spokesperson / VSL

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/spokesperson.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods in
> the def.

## Intent

A confident, scripted presenter pitches the product directly to camera in a
produced, sales-led style — the format of a classic video sales letter (VSL) or
a clean AI-avatar host read. The job is to lead the viewer through the offer with
persuasive, benefit-led copy and drive toward an action. This is the polished,
performed cousin of the authentic testimonial.

## Detection cues

Route here when the brief implies a host or presenter reading a written pitch to
camera ("spokesperson", "presenter", "VSL", "sales video", "host", "pitch to
camera", "explainer with a presenter", "AI avatar/spokesperson"), one person
delivering polished, persuasive copy.

Neighbour disambiguation:
- A scripted, performed sales pitch to camera → **spokesperson**.
- A genuine, unscripted first-person customer/creator review → **testimonial**
  (authentic peer, phone-captured, not a sales script).
- A cinematic, emotive mood piece carried by voiceover with no presenter holding
  the frame → **brand-story**.
- The founder telling their own origin/mission story → **founder-pov**.
- Aggregated ratings/quotes rendered as graphics with no single presenter →
  **social-proof**.

## Asset policy

- **product: optional** — shown or referenced as the pitch demands; held up,
  inset, or cut to in tight inserts beside the presenter.
- **person: required** — the presenter delivering the scripted pitch is the
  vehicle (a synthesized avatar is used if none is uploaded).

## Favored hooks

- **defaultHooks:** `direct-callout`, `question`
- **allowedHooks:** `direct-callout`, `question`, `problem-solution`,
  `stat-shock`, `social-proof`, `bold-claim`, `curiosity-gap`

## Look & treatment

- **lookFamily:** `cinematic_polished` (produced, color-graded, intentional
  lighting; a still lifted from a high-end commercial). The LOOK-driven seams
  (keyframeLook, captionStyle, shotDirection, pacing) defer to the shared base in
  `fragments/looks.ts`.

## Script / voice tone

Scripted, confident and persuasive — benefit-led sales copy delivered to camera,
not casual peer chat. The presenter sounds like a polished host: assured, upbeat
and intentional, building from hook to offer to call-to-action, while still
natural enough to perform out loud (short, punchy, varied lines).

## Canonical fragment prose

### storyboardTypeBlock
A confident presenter delivers a polished, performed pitch straight to camera
(produced sales video or clean AI-avatar host); the product appears in support
of the pitch while the person and their words carry the frame; the flow is a
deliberate pitch arc (attention → benefit/proof → action) ending on a confident,
persuasive call-to-act beat, never a casual personal verdict. Each scene's
`transcript` is one scripted, benefit-led line that flows as a continuous pitch.

### storyboardSpeakerLabel
"the on-screen person".

### storyboardTranscriptStyle
Each transcript line is scripted, polished sales copy spoken to camera —
confident, persuasive and benefit-led (not casual peer chat), driving toward the
action while still natural to perform.

### videoVoice
"a confident, persuasive, polished presenter voice".

### videoAudioLine
The on-screen presenter SPEAKS each line lip-synced in a confident, polished,
persuasive voice (same voice throughout), mouth visible, clean studio ambience
with an optional light music bed under the voice.

### narrativeTreatment
Spokesperson / VSL — a scripted presenter delivers a polished, persuasive pitch
straight to camera across the run, building from hook to offer to
call-to-action; each spoken beat is a crisp, benefit-led scripted line.

### videoPacing
(Overrides the look base.) Polished medium shot, camera LOCKED for clean lip-sync (no head-turns during speech): confident open, hold steady through the scripted segments, end on a direct CTA. Soft three-point light, slightly blurred branded background, authoritative synced dialogue, faint music bed.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Spokesperson / VSL (a scripted host pitching straight to camera):
- The ad is a confident PRESENTER (a real person or a clean AI-avatar host)
  delivering a polished, performed sales script directly to the lens — the look
  of a produced video sales letter, NOT an off-the-cuff peer review and NOT
  silent lifestyle b-roll. The SAME presenter (locked identity: same face,
  features, hair, skin tone, wardrobe) holds every panel.
- Direct the storyboard as a 4-panel pitch arc the presenter performs to camera:
  Panel 1 — polished medium close-up, eye contact, confident open expression
  (the hook lands here); Panel 2 — presenter gesturing as they pitch, framed
  slightly wider to show poise and the produced set; Panel 3 — presenter holds
  the product up toward camera and presents it clearly (or a tight product
  insert beside them if the product is optional/absent); Panel 4 — closing CTA
  expression, leaning toward the lens, driving the next step.
- Look: controlled studio key + rim lighting, premium color grade, slightly
  blurred branded background, shallow depth of field; keep real skin texture
  (pores, fine detail) so the polish never reads waxy. Keep the presenter
  well-lit, well-framed and looking straight at the viewer across all panels.
- When the presenter shows a phone or screen, their OWN thumb / finger physically
  performs any interaction (tap, swipe, scroll) — the on-screen content never
  scrolls, swipes or changes by itself.
- Each scene's `transcript` is ONE scripted line the presenter says to camera in
  that panel — crisp, persuasive, benefit-led sales copy that flows as one
  continuous pitch (hook → benefit/proof → call-to-act). Keep each line short and
  punchy (roughly 5-10 words for clean lip-sync); vary their length so the
  delivery sounds confident and human, not robotic.
```

### storyboardSpeakerLabel

```
the on-screen person
```

### storyboardTranscriptStyle

```
- Each transcript line is scripted, polished sales copy spoken to camera:
  confident, benefit-led and persuasive (not casual peer chat), driving toward
  the action — short and punchy (~5-10 words), still natural enough to perform
  out loud, the lines flowing together as one continuous pitch.
- Even when polished, talk like a real person: use contractions (you'll, it's,
  we're), and NEVER read a statistic, price, percentage or URL aloud — those go
  on-screen as text.
- BAD: "Experience unparalleled, revolutionary performance today." GOOD: "You'll
  feel the difference by tomorrow morning — I mean it."
```

### videoVoice

```
a confident, authoritative, polished presenter voice
```

### videoAudioLine

```
Audio: the on-screen presenter SPEAKS each line lip-synced in a confident, authoritative, clear presenter voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short (~5-10 words) and punchy, lock the camera and keep the mouth visible while speaking for clean lip-sync; quiet studio room tone under a faint music bed; no on-screen text, no warped face.
```

### narrativeTreatment

```
Treatment: spokesperson / VSL — a scripted presenter delivers a polished, persuasive pitch straight to camera across four segments: hook (grab attention, eye contact) → benefit (frame the value) → proof (back the claim) → call-to-action (drive the next step); the spoken beat in each summary is a crisp, benefit-led scripted line the presenter says to the lens in the SAME voice throughout.
```

### videoPacing

```
- Polished medium shot, camera LOCKED for clean lip-sync (no head-turns during speech): confident open, hold steady through the scripted segments, end on a direct CTA. Soft three-point light, slightly blurred branded background, authoritative synced dialogue, faint music bed.
```
