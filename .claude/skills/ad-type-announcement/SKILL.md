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

## Runtime fragments

Loaded at runtime by `skill-loader.ts`: each `### <seam>` fenced block holds the exact directive lines spliced into the prompt (one array element per line, verbatim).

### storyboardTypeBlock

```
AD TYPE — Announcement (a single piece of NEWS revealed as kinetic typography, NO presenter, NO live photography):
- The ad delivers ONE news beat — a launch, a new product/feature, a restock, a
  partnership or a milestone — framed as "introducing / now available / it's here /
  new / we partnered with…". The designed WORDS are the subject; there is no person
  on camera and no first-person account.
- POLICY GUARD: announce WHAT is new ONLY. Do NOT show a price, percentage, discount,
  promo code, countdown, "limited time" or "ends soon" urgency — any deal/deadline
  angle is promo-offer, not announcement. Keep it newsworthy and confident, never a sale.
- Layout: a clean 2x2 four-panel grid (15s) or N×4 master grid (30/45/60s), thin white
  gutters, equal self-contained panels, a small label "1"/"2"/"3"/"4" top-left of each.
- Panel arc — build intrigue, then drop the headline, then the reason it matters, then
  where/when:
  - Panel 1 (intrigue): a restrained teaser line on a minimal brand-color field, large
    legible bold sans type, generous negative space — e.g. "SOMETHING NEW IS HERE".
  - Panel 2 (headline): the actual news in oversized type — "INTRODUCING <name>" — the
    biggest words of the sheet; a clean product cut-out may anchor the frame as an accent.
  - Panel 3 (the reason): one line stating the single thing that makes it worth knowing —
    the standout feature, what changed, who it's with — verbatim in quotes, legible.
  - Panel 4 (availability + lockup): brand wordmark plus a short "AVAILABLE NOW" /
    "STAY TUNED" / "COMING <date>" line; render every string verbatim, no invented copy.
- Each panel's `transcript` is the short VOICEOVER line for that panel that announces the
  on-frame news (e.g. "Something new is here" / "Introducing <name>" / "<the standout
  thing>" / "Available now"). The four lines read as one cohesive, confident announcement.
```

### storyboardSpeakerLabel

```
the voiceover
```

### storyboardTranscriptStyle

```
- Each transcript line is a confident announcement voiceover that states the on-frame
  news plainly — what's new and where to get it — short enough to render legibly as the
  matching headline. No first-person "I" story, no price, discount, code or urgency, no
  hard sales close; let the news be the news.
```

### videoVoice

```
a confident, upbeat announcer voiceover, intriguing and premium, the same voice throughout
```

### videoAudioLine

```
Audio: Voiceover (confident, premium announcer) announces each line off-screen (no on-screen person, no lip-sync), the SAME voice throughout; quote each line verbatim in its time-slice and keep it short, or run music-only with the on-screen text carrying the news; a cinematic ambient riser builds and a single impact hit lands on the headline reveal as the words animate in. — no people, no jitter, keep all text and numbers legible, no garbled letters.
```

### narrativeTreatment

```
Treatment: announcement — a premium kinetic-typography reveal of ONE piece of news, carried by a confident announcer voiceover (or music-only), with NO price, discount, code or urgency (policy guard): 0-15s build intrigue, 15-30s drop the headline news, 30-45s state the single thing that makes it worth knowing, 45-60s land availability and the brand lockup; each summary's spoken beat is a voiceover line announcing the on-frame news.
```
