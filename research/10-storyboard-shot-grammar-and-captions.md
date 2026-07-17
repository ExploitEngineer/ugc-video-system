# 10 - Storyboard shot grammar: where "MCU" came from and who captions are for

Status: fixed 2026-07-16 on `feat/template-library-pipeline`.
Scope: panel captions in both boards — `template/keyframe/prompt.ts` and `image/storyboard/prompt.ts`.
Extends `05-gpt-image-2-prompting.md`.

## TL;DR

- **`MCU` / `OTS` / `CU` are not ours.** Word-boundary grep for `MCU|OTS|CU|MS|ECU|XCU` across the repo: **zero hits** (the only match was a base64 blob in `pnpm-lock.yaml`). No glossary, no vocabulary list, nothing defining them for the model.
- They are **emergent**: the template keyframe prompt asked for *"a shot type + the action"* in *"a few words"*, and the model compressed to standard film shorthand from its own training to fit the budget. Nothing pinned the register, so captions drifted between `WIDE — MESSY LIVING ROOM` and `OTS — MAN SMILES AND GESTURES` run-to-run.
- **Seedance never sees them.** Captions are cropped off before the sheet reaches the video model. They exist for the human reviewing the board — which is exactly why unreadable jargon is a real defect, not a cosmetic one.
- The two boards had **different rules**, and only one was broken.

## Two boards, one of which already got it right

The **normal** pipeline (`image/storyboard/prompt.ts`) already enumerated spelled-out shot types:

```
- `panelCaption` — the on-image caption label, MANDATORY format
  `<SHOT TYPE>. <action that NAMES the product>` (shot type = WIDE SHOT /
  MEDIUM SHOT / MEDIUM CLOSE-UP / CLOSE-UP / EXTREME CLOSE-UP /
  OVER-THE-SHOULDER / POV), then a period, then a vivid action…
```

The **template** pipeline (`template/keyframe/prompt.ts`) did not:

```
- `panelCaption`: the SHORT shot label for this panel's caption bar,
  UPPERCASE, a few words: a shot type + the action (e.g. "WIDE — MESSY
  LIVING ROOM", "CLOSE — HAND LIFTS MUG").
```

*"a shot type"* + *"a few words"* + examples that are themselves already clipped (`WIDE —`, `CLOSE —`). That is an invitation to abbreviate. The board the user flagged was the template keyframe sheet (9 panels — `template_keyframe` logged `scenes: 9`), which is the one with the loose rule. Confirms the diagnosis.

**Lesson worth keeping:** *enumerating* the allowed values (normal pipeline) is weaker than it looks, and *omitting* them (template) fails outright. Both now also **forbid the abbreviations by name** — an enum tells the model what's allowed; a prohibition tells it what the failure looks like. That asymmetry is the same one `[[prompt-negatives]]` documents: naming a specific failure mode works when the failure is a *format*, as opposed to naming visual failures at the video model, which summons them.

## Captions never reach the video model

`cleanStoryboardRefUrl` (`lib/provider-refs.ts`) crops the badges and caption bars pixel-wise before the sheet is handed to Seedance:

- panel count 4 → `cleanSheet2x2`; otherwise `panelGrid(n)` → `cleanSheetGrid`
- then `padToProviderAspect(..., {forceJpeg: true})`, uploaded as a **provider-only** copy; the stored labelled sheet (the UI/review artifact) is untouched

**Fail-open, and worth knowing:** any fetch/crop/encode hiccup logs `"storyboard clean-crop skipped — using labelled sheet"` and falls back to the labelled sheet — so on a crop failure the captions *do* reach Seedance uncropped. Belt-and-braces prompt-side: the keyframe prompt forbids baked text, and `TEMPLATE_VIDEO_NEGATIVES` repeats it.

So the caption's audience is: **the person reviewing the board.** Its cost is gpt-image-2 text-rendering effort (see `05` on text fidelity), and its benefit is an at-a-glance shot list. Jargon that the reader has to decode inverts that trade.

## The fix

Constrain the register and name the failure. Template keyframe:

```
- `panelCaption`: the SHORT shot label for this panel's caption bar,
  UPPERCASE, a few words: a shot type + the action (e.g. "WIDE — MESSY
  LIVING ROOM", "CLOSE-UP — HAND LIFTS MUG"). Write the shot type out in
  FULL PLAIN ENGLISH — WIDE, MEDIUM, MEDIUM CLOSE-UP, CLOSE-UP,
  OVER-THE-SHOULDER, TRACKING. NEVER abbreviate it: no MCU, no CU, no OTS,
  no MS, no ECU, no XCU. A human reads this bar to review the board.
```

Normal storyboard: added a REJECTED example (`"MCU. Holds up the sunglasses." (abbreviated shot-type)`) plus the same prohibition.

Pinned by tests so it cannot drift back. The 4 golden `legacy-prompts.json` fixtures were regenerated — the diff was audited line-by-line and contained **only** the caption lines, nothing else.

## Note on caption ≠ transcript

Both boards keep a rule the model likes to violate: `panelCaption` and `transcript` are **different texts, never the same sentence**. The caption is direction (what the camera sees); the transcript is speech (what a person says). Collapsing them yields a board that captions itself with its own dialogue and a video prompt whose shot description is a quote. The template prompt now additionally letters the authored captions **verbatim** into the bars (`keyframe/index.ts`: *"letter EXACTLY these strings … do NOT paraphrase, translate, merge, or invent different wording"*), so the caption the reviewer reads is the caption the script authored.

## Open

- **Nothing validates the emitted caption.** The prompt asks; no code checks. A cheap post-parse assertion (reject/repair a `panelCaption` matching `/^(MCU|CU|OTS|MS|ECU|XCU)\b/`) would make this deterministic rather than persuasive. Not done — worth it only if the prompt rule proves insufficient on real runs.
- **Whether captions earn their pixels at all.** They cost gpt-image-2 text-rendering effort on every panel and are cropped before the footage. The alternative — drop the bars, keep `panelCaption` as data shown beside the sheet in the UI — gets the same review value with zero text-rendering risk. Considered and deferred: it changes the review surface, which is the user's call, not a prompt tweak.
