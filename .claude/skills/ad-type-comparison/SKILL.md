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

## Notes

NET-NEW type — no `legacyMapping`. Keep the brand-safety guard intact in both
the def prose and this doc whenever revising.
