---
name: ad-type-announcement
description: >-
  Announcement ad type. A news/launch/restock reveal rendered as motion graphics
  — "introducing", "now available", "new", "we partnered" — that states WHAT is
  new without a price or urgency; NO single presenter, bold kinetic typography
  carried by a confident voiceover. Use when authoring or revising the
  announcement ad type's detection cues, asset policy, hooks, look, voice, and the
  canonical prompt-fragment prose in defs/announcement.ts.
---

# Ad type — Announcement

> **Executable counterpart:** `apps/api/src/agents/ad-types/defs/announcement.ts`
> Kept 1:1 by `defs-skills-sync.test.ts`. This is a NET-NEW graphic_text type
> (no legacy branch); the TYPE-driven fragment prose is authored here and mirrored
> in the def.

## Intent

Deliver a single piece of NEWS as a designed motion-graphics reveal — a launch, a
new product or feature, a restock, a partnership or a milestone. The framing is
"introducing", "now available", "it's here", "new", "we partnered with…". The
goal is awareness: make the news known and worth caring about. There is no
on-camera presenter and no single spoken account, and crucially no price, deal or
urgency.

## Detection cues

Route here when the brief announces SOMETHING NEW: "introducing", "launching",
"now available", "back in stock", "we partnered with", "meet the new <name>", "the
wait is over". Disambiguation:

- **vs promo-offer** — promo-offer pushes a DEAL: a price, discount, percentage,
  code, "limited time", a countdown or "ends soon" urgency. Announcement states
  only WHAT is new with NO price and NO urgency. A money/deadline angle →
  promo-offer; a pure "here's what's new" → announcement.
- **vs product-showcase** — both can be typography-led, but product-showcase is an
  evergreen hero/glamour reel of features and benefits. Announcement is a
  time-bound NEWS beat ("it just launched"). Evergreen "look how great it is" →
  product-showcase; "it's new / it's here now" → announcement.
- **vs social-proof** — social-proof stacks aggregated external proof (ratings,
  quotes, counts, logos). Announcement reports first-party news from the brand,
  not third-party endorsement.

## Asset policy

- **product: optional**, **person: optional** — the news itself carries the ad as
  kinetic typography. A clean product cut-out or inset may anchor the reveal
  frame, and a face may appear as a supporting accent, but neither is required.

## Favored hooks

- **defaultHooks:** `curiosity-gap`, `pattern-interrupt`
- **allowedHooks:** `curiosity-gap`, `pattern-interrupt`, `stat-shock`,
  `question`, `bold-claim`, `direct-callout`

## Look & treatment

- **lookFamily:** `graphic_text` — bold motion-graphics frames, clean kinetic
  typography as the primary subject, large legible headline words on flat/brand-
  colour backgrounds, simple iconography and shape accents. Never live
  photography. LOOK-driven seams (keyframeLook, captionStyle, shotDirection,
  pacing) defer to the shared `graphic_text` base.

## Script / voice tone

A confident, upbeat announcer voiceover that states the on-frame news plainly
(what's new and where to get it), the same voice throughout, reading as one
cohesive announcement. Not lip-synced; no first-person "I" story; no price,
discount, code or urgency; no hard sales close — let the news be the news.

## Canonical fragment prose

### storyboardTypeBlock
A single piece of NEWS rendered as bold kinetic typography — a launch, a new
product/feature, a restock, a partnership or a milestone, framed as "introducing /
now available / it's here / new / we partnered". No presenter, no first-person
account. It announces WHAT is new only — no price, discount, code, countdown or
"limited time" urgency (that's promo-offer). Each panel reveals ONE beat: build a
little intrigue, drop the headline, the thing that makes it worth knowing, then
where/when it's available. A product cut-out may anchor the reveal but the words
carry it. Each scene's transcript is a short voiceover line that announces the
on-frame news.

### storyboardSpeakerLabel
"the voiceover".

### storyboardTranscriptStyle
Each transcript line is a confident announcement voiceover stating the on-frame
news plainly — what's new and where to get it. No first-person "I" story, no
price, discount, code or urgency, no hard sales close.

### videoVoice
"a confident, upbeat announcer voice".

### videoAudioLine
A natural human VOICEOVER announces each line (not lip-synced on screen), the same
voice throughout; a clean reveal whoosh and a light upbeat bed are allowed as the
headline words animate in.

### narrativeTreatment
Announcement — a motion-graphics reveal of a single piece of news (launch, new
feature, restock or partnership), carried by a confident voiceover, with no price
or urgency; each spoken beat announces the on-frame news.
