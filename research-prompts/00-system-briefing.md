# System briefing — our AI ad-video generator

> **Attach or paste this file FIRST in every research thread.** It explains how our
> system works today so you can reason about extending it. A reader with no access to
> our codebase can follow it. At the end is **the goal of the research** — what we are
> trying to change.

---

## 1. What the product is

An AI ad-video generator. Input: a **product image** (required today) + an optional
**person image** + a free-text **prompt**. Output: a single finished ad video **with
native audio**. Two lengths, chosen per run by a `duration` toggle:

- **15s** (default): one 4-panel storyboard sheet → one ~15s video clip.
- **30 / 45 / 60s**: one master storyboard sheet of N×4 panels → N ~15s clips →
  **merged** (ffmpeg) into one cohesive longer ad. (60s = 4 segments.)

After a run completes, the final video can be opened in a browser editor (img.ly
CE.SDK) and re-saved — outside the generation pipeline.

## 2. Architecture in one paragraph

Cooperating **"skills"** (each = a prompt module + a function) drive an
**images → storyboard → video** pipeline. There is no agent framework; the orchestrator
is plain TypeScript. All model calls live behind a **provider-adapter boundary** so
models are swappable. A **`runs` database row is the single source of truth** for state;
an in-process **worker** advances it one step at a time, persisting before each
transition (a crash resumes cleanly). Monorepo: `apps/api` (Hono backend),
`apps/web` (Next.js studio UI), `packages/shared` (Zod enums + DTOs shared by both).

## 3. The models

- **Image generation** — `gpt-image-2` (OpenAI). Produces every composite grid sheet.
- **All reasoning / vision** — `gpt-4.1` (OpenAI). Interprets the prompt, reads
  uploaded images, authors the text-to-image and text-to-video prompts.
- **Video** — **Seedance 2.0** via BytePlus ModelArk. Turns a labelled storyboard
  sheet + a short prompt into a ~15s clip with synchronized audio.
- **Merge** — ffmpeg (no AI), for 30/45/60s only.

## 4. The agents and their skills

### Creative Direction Agent (orchestrator, `gpt-4.1`)
Interprets the request and drives the run state machine. Its skills:

- **`interpretAdStyle`** — reads the user prompt, outputs `{ adStyle, adType }`.
  `adStyle` is a free-text creative brief (~20 words). **`adType` is the key field
  for this research**: today it is an enum with only **two values** —
  `"ugc"` (a person gives a spoken review/testimonial of the product) or
  `"inspirational"` (open-ended cinematic scene with voiceover). This is the **only**
  place ad type is decided, and it is decided automatically from the prompt — the user
  never states it.
- **`describeProduct`** — vision call on the product image → `{ productBrief, productUse }`
  (a factual identity anchor + a use-sequence). Anchors the product so it doesn't drift.
- **`planPersonBrief`** / **`derivePersonBrief`** — produce a `personBrief` (who the
  on-screen person is) either invented from the product or read from an uploaded person.
- **`narrativeOutline`** (30/45/60s only) — plans the N-segment arc + a locked visual style.
- **`planRevision`** / **`interpretFeedback`** — confirm-mode feedback handling.

### Image Agent (`gpt-image-2`)
- **`productSheetBuilder`** — a 4-view product reference sheet.
- **`generatePersonImage`** — an 8-panel person reference sheet (4 body angles + 4 face
  close-ups).
- **`storyboardGenerator`** (15s) — a labelled 2×2 keyframe sheet + 4 `scenes[]`
  (each: camera angle, action, scene description, panel caption, transcript line).
- **`generateMaster`** (30/45/60s) — a single N×4-panel master keyframe sheet + N×4 scenes.

### Video Agent (Seedance 2.0)
- **`videoBuilder`** — a `gpt-4.1` call composes a short Seedance prompt from the scenes,
  then submits to BytePlus and polls for the MP4. The **labelled storyboard sheet is the
  only shot guide sent**; the reference sheets are not.

### Critic Agent — **PARKED.** Disabled by default, removed from the UI. Ignore it.

## 5. How the user prompt is broken down today

A single run decomposes the prompt into persisted fields on the `runs` row:

```
user prompt ─▶ interpretAdStyle  ─▶ adStyle (free text) + adType ("ugc" | "inspirational")
            ─▶ describeProduct   ─▶ productBrief + productUse   (from the product image)
            ─▶ planPersonBrief   ─▶ personBrief
            ─▶ narrativeOutline  ─▶ N segment summaries + visualStyle   (30/45/60s only)
```

`adStyle` and `adType` are then threaded into **every** downstream skill via a shared
`SkillContext`, and they shape the prompts at each stage.

## 6. How prompting works today (the part we want to change)

Every skill has a `prompt.ts` module (13 of them). The prompts are large, hand-written
English instruction blocks. **Ad type is applied as hard-coded binary branches** —
literally `if (adType === "ugc") { …ugc instructions… } else { …inspirational instructions… }`
— scattered across the prompt files. Examples:

- `image/storyboard/prompt.ts` (~713 lines) has a UGC-vs-inspirational `typeBlock`
  (how the product is presented, on-camera vs. cinematic) and a `keyframeLook` block
  (authentic phone-captured look vs. polished cinematic look).
- `video/prompt.ts` has `const VOICE: Record<AdType, string> = { ugc: …, inspirational: … }`
  and a UGC-vs-voiceover audio line.
- `narrative-outline/prompt.ts` branches `isUgc` for the script treatment.

So **adding a new ad type today means editing every one of those binary branches** —
which does not scale. `adType` is also a **native Postgres enum** column, so adding a
value needs a DB migration. (Note: a sibling field, `runErrorCode`, was deliberately
stored as plain text precisely to avoid that migration treadmill — a useful precedent.)

## 7. Assets today

- **Product image is required** at run creation. The `product_sheet` step always runs.
- **Person image is optional** (a person is invented from the product if none is uploaded).
- There is an existing pattern for **skipping steps conditionally**: when the Critic is
  off, the orchestrator collapses the inspection steps so they're never sequenced. The
  same mechanism could skip product/person steps.

## 8. Run state machine (for reference)

Statuses: `queued → running → awaiting_confirmation ⇄ regenerating → completed | failed`.
Steps (15s): `product_sheet, person_sheet, storyboard, video`.
Steps (30/45/60s): `product_sheet, person_sheet, narrative_outline, segment_storyboard,
segment_video, merge`. Two confirm-mode gates pause for user approval: one after the
reference sheets, one after the storyboard.

---

## THE GOAL OF THIS RESEARCH

We want the system to generate **any type of ad**, not just `ugc` / `inspirational`.
Concretely, we need to design:

1. **A real ad-type taxonomy** — the practical universe of ad formats (product showcase,
   testimonial, brand story, explainer, promo/offer, founder POV, comparison, etc.),
   each with a clear definition.
2. **Per-type asset policy** — some ad types need **no product image and/or no person at
   all** (e.g. text/graphic-led brand or awareness ads). Each type must declare whether
   product and person are **required / optional / forbidden**.
3. **A "hook" concept** — ads open with a hook (problem-solution, pattern-interrupt,
   testimonial, stat/shock, curiosity-gap, …). Each ad type favors certain hooks; the
   system should pick the hook(s) per ad.
4. **Auto-detection** — the user will NOT state the ad type or hook. After breaking down
   the prompt, the system must classify ad type + hook(s) and select the right prompt
   strategy. This extends `interpretAdStyle`.
5. **A prompt-system restructure** — replace the binary `if (adType)` branches with a
   **registry/strategy** keyed by ad type (and hook), so each type contributes its own
   prompt fragments and adding a type is additive, not a rewrite.
6. **A per-ad-type "skill" doc** — so each ad type is consistently specified.

The research prompts in this folder each tackle one of these. Read this briefing, then
answer the specific research prompt that follows.
