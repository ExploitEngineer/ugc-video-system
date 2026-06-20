---
name: ad-type-comparison
description: >-
  Comparison (Us-vs-Them) ad type. A side-by-side contrast positioning the
  product against a generic alternative or "the old way" ("vs", "better than",
  "don't settle for"), landing a demonstrable advantage in clean studio/tabletop
  product photography. NET-NEW type, no legacy mapping. Includes a brand-safety
  guard forbidding any named or depicted real competitor brand or logo. Use when
  authoring or revising the comparison ad type's detection cues, asset policy,
  hooks, look, voice, and the canonical prompt-fragment prose in
  defs/comparison.ts.
---

# Ad type — Comparison (Us-vs-Them)

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/comparison.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. The headings under **Canonical
> fragment prose** map one-for-one to the TYPE-driven `FragmentSet` methods.

## Intent

Win a consideration/conversion decision by putting the product head-to-head
against a generic alternative and proving ONE clear, demonstrable advantage. The
job is to reframe the choice as "this vs that — and this is obviously better,"
so the viewer feels they'd be settling for less with anything else.

## Detection cues

Route here when the brief asks for a head-to-head contrast: "vs", "versus",
"compared to", "better than", "us vs them", "don't settle for", "why pay more
for", "the old way", "ordinary [category]". Two contrasting subjects (product +
alternative), often split-screen.

Disambiguation:
- **before-after** — contrast is two *time states of the same user/object* (a
  transformation), not a rival item. If there's a "before me / after me" arc,
  route there.
- **product-showcase / product-demo** — single-subject framing with NO rival or
  "old way" reference. If nothing is being beaten, it's not a comparison.
- **social-proof** — aggregated ratings/quotes, not a demonstrated head-to-head.

## Asset policy

- **product: required** — the product is the winning side and must be shown.
- **person: optional** — the contrast is usually pure split-screen product
  graphics; a presenter may appear but is not needed (voiceover carries it).

## Favored hooks

- **defaultHooks:** `unexpected-comparison`, `contrarian`
- **allowedHooks:** `unexpected-comparison`, `contrarian`, `stat-shock`,
  `pattern-interrupt`, `question`, `negativity-bias`, `demonstration`,
  `before-after`, `social-proof`

## Look & treatment

- **lookFamily:** `demo_clean` (crisp studio/tabletop product photography, clean
  uncluttered backdrop, controlled even lighting, sharp macro detail). The
  LOOK-driven seams (`keyframeLook`, `captionStyle`, `shotDirection`, `pacing`)
  defer to the shared base in `fragments/looks.js`. Comparisons read best as
  clean split-screen / back-to-back product frames, the winner crisp and
  hero-lit, the generic side plain by contrast.

## Script / voice tone

Confident, persuasive, announcer-style voiceover. Lines are punchy and
contrastive ("the old way takes twice as long", "why settle for ordinary"),
each naming exactly one point of difference, building to the product as the
obvious choice. Never smug or dishonest; the win is demonstrated, not asserted.

## Brand safety

**Hard rule:** NEVER name, label, depict, or imply a specific real competitor
brand, product name, or logo. The rival side is ALWAYS a generic, unbranded
stand-in — "the old way", an "ordinary [category]", a plain/no-name or
blank-label placeholder. No recognisable trademarks or real brand text on the
losing side. (Naming competitors triggers Meta's Personal Attributes / Privacy
Violations policy, the single most common Meta ad-rejection reason.) This guard
is carried in the prompt prose, not the schema.

## Canonical fragment prose

The TYPE-driven seams carry this comparison-specific prose; the LOOK-driven
seams defer to `demo_clean`.

### storyboardTypeBlock
A side-by-side us-vs-them contrast against a GENERIC alternative ("the old way"
/ an ordinary [category]), each panel making one concrete point of difference on
the product itself, the product staying the clear winner, ending on it as the
obvious choice. Explicitly forbids naming or depicting any real competitor brand
or logo — the rival is always a generic, unbranded stand-in.

### storyboardSpeakerLabel
"the voiceover" — the comparison is product-led graphics narrated by VO, not a
person speaking on camera.

### storyboardTranscriptStyle
Punchy, contrastive comparison copy ("vs", "better", "why settle"), one point of
difference per line, always against the generic alternative — never a real
competitor brand name.

### videoVoice
"a confident, persuasive announcer voice".

### videoAudioLine
A confident VOICEOVER narrates each comparison line (not lip-synced on screen),
same voice throughout, short and punchy, a light driving score allowed under the
contrast beats.

### narrativeTreatment
Comparison — each beat pits the product against a generic alternative (never a
named competitor), landing one concrete advantage per beat and closing on the
product as the obvious better choice; the spoken beat is a short contrastive
voiceover line.

### videoPacing
(Overrides the look base.) Locked split-screen: both sides act in parallel with a slow synchronized push, even neutral lighting on each, then the winning side resolves to center. Keep both halves legible throughout, subtle music and light SFX.

## Notes

NET-NEW type — no `legacyMapping`. Keep the brand-safety guard intact in both
the def prose and this doc whenever revising.

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Comparison (a clean studio us-vs-them contrast that proves ONE advantage):
- The storyboard contrasts the product (the WINNER) against a GENERIC unbranded
  alternative — 'the old way', an 'ordinary [category]', a plain no-name / blank-
  label stand-in — across the 4 panels, earning ONE demonstrable verdict: the
  product wins. Use SEQUENTIAL full-frame panels in matched clean studio/tabletop
  framing — do NOT cram the product and the rival into one divided split-screen
  panel (it reads as two scenes jammed together); alternate clean full panels.
- BRAND-SAFETY GUARD (carry verbatim): NEVER name, label, depict, or imply a
  specific real competitor brand, product name, or logo. The rival is ALWAYS a
  generic, unbranded placeholder. No recognisable trademarks, no real brand text.
- Panel 1: the PRODUCT ('our way') performs the task cleanly and well — full
  frame, the clear hero in sharp focus.
- Panel 2: the GENERIC 'old way' attempts the SAME task in the SAME framing and
  falls short — plain, underwhelming, honest, never sabotaged or faked.
- Panel 3: macro close-up on the PRODUCT's winning advantage (speed, finish,
  result, ease), sharp on the product itself.
- Panel 4: product hero as the obvious winner, centered on a clean sweep, label
  crisp and legible.
- PHYSICAL REALISM: show every product/tool used the CORRECT, real way — a knife
  cuts edge-down with its SHARP side (never the spine or the flat), a spray fires
  from the nozzle, etc.; keep the product's true geometry, a single real item.
- Each panel's `transcript` is one short VOICEOVER line for that beat that states
  or sharpens the contrast ('the old way takes twice as long', 'ours, in one
  pass') — spoken over the visuals, NOT lip-synced by anyone on screen. The lines
  read as one confident, continuous voiceover building to the verdict.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Transcript lines are punchy comparison copy: short, contrastive, and confident
  ('vs', 'better', 'why settle'), each naming exactly ONE point of difference.
- Always pitched against the generic 'old way' / 'ordinary' version — never a
  named or implied real competitor brand. Build to a one-line winner verdict.
```

### videoVoice

```
a confident, persuasive, assured announcer voice
```

### videoAudioLine

```
Audio: a confident off-screen VOICEOVER (assured, fair, brisk) narrates each comparison line — same voice throughout, quoted verbatim per slice, short and punchy, never lip-synced on screen; crisp product interaction SFX and a subtle driving music bed under the contrast beats; keep both sides' labels legible, no garbled logo text, no real competitor brand audio or name.
```

### narrativeTreatment

```
Treatment: comparison (60s, 4 segments) — 0-15s open on the us-vs-them split, product 'OUR WAY' vs the generic 'OLD WAY', land the first concrete advantage; 15-30s drive the product's winning point in clean macro detail; 30-45s show the generic alternative falling short, honest and unbranded (BRAND-SAFETY GUARD: never name or depict a real competitor brand or logo); 45-60s close on the product hero as the obvious better choice with a one-line verdict. Each spoken beat is a short contrastive voiceover line, same voice throughout.
```

### videoPacing

```
- Locked split-screen: both sides act in parallel with a slow synchronized push, even neutral lighting on each, then the winning side resolves to center. Keep both halves legible throughout, subtle music and light SFX.
```
