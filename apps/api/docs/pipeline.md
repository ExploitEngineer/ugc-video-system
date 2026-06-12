# Pipeline: images → storyboard → video

How a run turns a **product image** (+ optional **person image**) + a text
prompt into an ad video with native audio — either a single **~15s** clip or a
merged **~60s** clip, chosen per run by a `duration` toggle. This doc traces the
**end-to-end flow**, the **run state machine**, the **four flows** (upload mode ×
run mode), the **confirm-mode feedback/regeneration loop**, the **60s pipeline**
(§8), and the **exact payloads** sent to the image and video model APIs — so you
can see precisely what reaches GPT Image 2 and Seedance 2.0.

> For a single self-contained overview of the **whole system** (every AI call,
> params, providers, data model, resilience) — e.g. to paste into a chat — see
> [system-context.md](system-context.md). This doc is the deeper flow narrative.

> Two contracts worth keeping in your head while reading:
>
> 1. **Parallel reference sheets.** The product sheet and the person sheet are
>    generated **concurrently** — they have no ordering dependency. The person
>    sheet never consumes the product sheet _image_; at most it consumes a short
>    product-derived _text_ brief. (See §2.)
> 2. **Labels-in / clean-out.** The storyboard sheet is **labelled** — four
>    numbered keyframe panels (`01`–`04`), each with a brief caption burned in —
>    and that labelled sheet is fed straight to Seedance as the **ordered shot
>    guide**. The labels are **direction only**: the final video must keep the
>    grid / badges / caption text **out of the rendered frame**. (See §7.)

> For a per-agent / per-skill **I/O table** (what image + prompt each skill takes
> and what it returns), see [agents-and-skills-io.md](agents-and-skills-io.md).

---

## 1. Run state machine

Authoritative state lives in the `runs` row (`status` + `current_step`); the
in-process worker (`creative-direction/worker.ts`) claims a run by DB lock and
the orchestrator (`creative-direction/orchestrator.ts` → `driveRun`) advances it
to the next stopping point, persisting before each transition so a crash/restart
resumes cleanly. **`current_step` = the LAST step that completed** (the
convention the single feedback gate relies on).

**Per-run `duration`** (`runs.duration`, `15s` default | `60s`) selects the chain.
The 15s chain is the original and is untouched; the 60s steps are **purely
additive and duration-guarded** — a 15s run never enters them, and vice-versa.

**Steps** (`packages/shared/src/enums.ts` → `stepSchema` — the last four are 60s):

```
15s:  product_sheet ┐
                    ├─(parallel)→ [product_inspection?] → storyboard → [storyboard_inspection?] → video
      person_sheet  ┘

60s:  product_sheet ┐
                    ├─(parallel)→ narrative_outline → segment_storyboard → segment_video → merge
      person_sheet  ┘
                      (segment_storyboard renders ONE 16-panel master sheet and crops it
                       into four row strips; segment_video fans out ×4 over those strips)
```

The 60s steps are detailed in **§8**; everything in §2–§7 below describes the
**shared front half** (reference phase, storyboard render, video submit) plus the
15s tail — the 60s pipeline reuses the same skills with added segment parameters.

- `product_sheet` + `person_sheet` run **concurrently** (`runReferencePhase`,
  `Promise.allSettled`). The checkpoint advances to `person_sheet` once both
  finish — it stands in for "the reference phase completed".
- `person_sheet` **ALWAYS runs**: from the uploaded person photo (identity-
  locked image-to-image) when one was uploaded, else **invented** from the
  product-derived brief. Either way the storyboard consumes the _generated_
  reference sheet, never the raw upload — so every run has a person reference.
- `product_inspection` / `storyboard_inspection` run only when the critic is
  enabled (`runs.critic_enabled`). They don't change where confirm-mode pauses.
- Step order + gating: `creative-direction/plan.ts` (`nextStep`, `gateForNext`,
  `gateForCurrentStep`, `genStepForRevise`).

**Statuses** (`runStatusSchema`):
`queued → running → awaiting_confirmation ⇄ regenerating → completed | failed`.

- **Modes** (`runs.mode`): `automatic` (no gating, runs straight through) and
  `confirm` (pauses at `awaiting_confirmation` after each **gate**). The critic
  auto-checks in **both** modes.
- **Gates** (`plan.ts`, decoupled from the critic — keyed on _what the next step
  would be_, which already collapses inspection steps; **duration-aware**):
  - **reference gate** — before the first post-reference step: `storyboard` (15s)
    or `narrative_outline` (60s); both fire right after the two reference sheets.
  - **storyboard gate** — before the video work: `video` (15s) or `segment_video`
    (60s, i.e. after all four storyboards are rendered).

**Driver transitions** (`driveRun`):

| From status                                    | Driver does                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `queued`                                       | Phase 0: interpret ad style → `running`, `current_step=null` (see §2). |
| `running`, step=null                           | Run the **parallel reference phase**; advance/gate/complete.           |
| `running`, step=X                              | Run `nextStep(X)`; pause at a gate (confirm mode) or advance.          |
| `regenerating`                                 | Re-run the gated step with the user's feedback threaded in (see §4).   |
| `awaiting_confirmation`, `completed`, `failed` | terminal for the driver.                                               |

**Artifacts & storage.** Every generated file is a row in `assets` (kind ∈
`product_upload`, `person_upload`, `product_sheet`, `person_sheet`,
`storyboard_sheet`, `final_video`, `segment_video`) plus a typed artifact row
(`product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`,
`videos`). For 60s, the four storyboard sheets share the `storyboard_sheet` kind
and the four clips use `segment_video`; both carry a `segment_index` (0..3) on
their typed row, and the merged 60s clip is the `final_video` (`segment_index =
null`). Files live in the public Supabase Storage bucket `ugc-assets` at
`runs/{runId}/{kind}-{uuid}.{ext}`; the `assets` row holds both `storage_path`
and `url`. See [database-schema.md](database-schema.md).

---

## 2. Phase 0 + the parallel reference phase

### 2a. Phase 0 — ad style (leaving `queued`)

On the first tick of a `queued` run, `driveRun` calls `interpretAdStyle`
(`creative-direction/interpret-style`) → `adStyle` + `adType` (`ugc` |
`inspirational`), persists them, and flips the run to `running` with
`current_step=null`. **The person brief is NOT planned here** — it's deferred
into the person branch of the reference phase (below) so the product sheet
doesn't wait on a vision call it doesn't need.

### 2b. Reference phase — product sheet ‖ person sheet (parallel)

`runReferencePhase` (`orchestrator.ts`) launches two branches with
`Promise.allSettled`:

**Product branch — `product_sheet`** (`agents/image/product-sheet`):

1. LLM (`gpt-4.1`) plans a text-to-image prompt for a 2×2 grid of four product
   views (`buildProductSheetPrompt`; no image attached — pure reasoning).
2. `generateImage({ prompt, refs: [productUpload] })` → **`images.edit`**
   (refs present), rendering the composite product reference sheet with the raw
   uploaded product image as the reference.

**Person branch — `person_sheet`** (`agents/image/person-image`):
First, only when **a product was uploaded and no person was** (the "invent a
presenter" case), `planPersonBrief` (`creative-direction/person-brief`) runs
**vision over the uploaded PRODUCT image** and returns one concise TEXT brief
(demographics / wardrobe / palette that complement the product). It's persisted
to `runs.person_brief`, then the sheet generates. The person sheet has **three
paths** (`person-image/index.ts`):

| Path            | When                           | Base image                     | OpenAI call                                  |
| --------------- | ------------------------------ | ------------------------------ | -------------------------------------------- |
| **Invent**      | product, no person upload      | none → text only               | `images.generate` from `personBrief`         |
| **From photo**  | person uploaded (first gen)    | uploaded photo (`baseRef`)     | `images.edit` — identity-locked              |
| **Edit-revise** | revise of a prior person sheet | prior person sheet (`baseRef`) | `images.edit` — keep subject, change aspects |

> **The product image never reaches the person agent.** Its inputs are
> `personBrief` (text), `userPrompt`, an optional `directive`, and an optional
> `baseRef` that is only ever the _uploaded person photo_ or a _prior person
> sheet_ (`orchestrator.ts` `person_sheet` case). This is exactly what lets the
> two sheets run in parallel.

**OpenAI image API** (`providers/openai/index.ts` → `generateImage`):

| Field    | Value                                                          |
| -------- | -------------------------------------------------------------- |
| `model`  | `gpt-image-2` (`OPENAI_IMAGE_MODEL`)                           |
| endpoint | `images.edit` when `refs` present, else `images.generate`      |
| `image`  | the ref file(s) — product upload, person photo, or prior sheet |
| `prompt` | the LLM-authored image prompt / short edit instruction         |
| `size`   | `2048x1152` (`DEFAULT_IMAGE_SIZE`, **2K** 16:9)                |

> **Why 2K, not 4K:** intermediate sheets only _guide_ the video. 4K made the
> base64 response ~12 MB and intermittently truncated (Unterminated-JSON
> failures), so sheets render at 2K — smaller, faster, reliable. `generateImage`
> also retries up to **5×** to cover any remaining truncated-body parse errors.

> **Network resilience.** Reference-image bytes are fetched from Supabase and
> inlined as base64 before each OpenAI call. Every such raw fetch goes through
> `lib/http.ts` `fetchWithRetry` (retries network errors + 429/5xx with
> backoff+jitter), and the OpenAI client uses `maxRetries: 4`. This matters most
> in the 60s fan-outs (§8), where the same sheets are fetched by several segments
> at once — a single transient "fetch failed" must not kill the run.

If either branch rejects, the phase reports the first failing step
(`product_sheet` or `person_sheet`) and the run fails. Because the checkpoint
stays `null` until both succeed, a mid-phase crash re-runs the whole reference
phase on resume (idempotent — the brief is simply recomputed).

---

## 3. The four flows

The user-facing matrix is **upload mode** (product-only vs product+person) ×
**run mode** (automatic vs confirm). The step engine is identical; only the
person-sheet path and the gating differ.

| #   | Flow                             | Reference phase                                                                                                        | Gating                                                                            |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | **Automatic · product only**     | Phase 0 plans a person brief (vision over the product image); `product_sheet` ‖ `person_sheet` (**invent** from brief) | none — runs straight to `storyboard` → `video`                                    |
| 2   | **Automatic · product + person** | no brief (skipped); `product_sheet` ‖ `person_sheet` (**from photo**, identity-locked)                                 | none — straight to `storyboard` → `video`                                         |
| 3   | **Confirm · product only**       | same as #1                                                                                                             | **reference gate** (review sheets) → `storyboard` → **storyboard gate** → `video` |
| 4   | **Confirm · product + person**   | same as #2                                                                                                             | same gates as #3; a reference-gate revise keeps the uploaded face (edit path)     |

Across all four: `storyboard` then `video` are identical (§5, §6); with
`critic_enabled` a `product_inspection` / `storyboard_inspection` runs before the
respective gate. In confirm mode, a reference-gate revise **only ever
regenerates the person sheet** — the product sheet is hidden from the user.

---

## 4. Confirm-mode feedback & regeneration

The gate has a **single action**: `POST /runs/:id/feedback` (`routes/runs.ts`),
legal only from `awaiting_confirmation`. One free-text field decides everything:

```
blank message      → approve → status=running       → driver advances (nextStep)
non-blank message  → interpretFeedback (LLM classify)
                       approve → status=running       → advance
                       revise  → status=regenerating  → driver re-runs the gated step
```

- **Blank = continue** skips the LLM entirely (`message.trim() === ""` ⇒
  `approve`).
- `interpretFeedback` (`creative-direction/interpret-feedback`) is one small LLM
  call; it **defaults to `revise`** on a parse failure so feedback is never lost.

When the run flips to `regenerating`, the driver (`orchestrator.ts`):

1. Resolves the gate from `current_step` (`gateForCurrentStep`) and the step to
   re-run (`genStepForRevise`, duration-aware): **reference gate → `person_sheet`**
   (product hidden), **storyboard gate → `storyboard`** (15s) or
   **`segment_storyboard`** (60s).
2. Runs `planRevision` (`creative-direction/plan-revision`) — a **vision** call
   that inspects the rejected artifact against the product sheet and breaks the
   free-text feedback into a structured `RevisionDirective`: `changes`, `keep`,
   `rationale`, `scope` (`edit` = same subject / `regenerate` = new subject),
   and — at the reference gate — a `revisedBrief` that is persisted back to
   `runs.person_brief` so the change lives in the dominant text and stacks across
   repeated revises. (If the vision call fails it still threads the raw feedback
   through so a revise never silently no-ops.)
3. Re-runs the gen step with the directive (e.g. person `edit` revise →
   `images.edit` off the prior sheet, preserving an uploaded face).
4. **Re-pauses at the same gate** (`awaiting_confirmation`) so the user reviews
   the regenerated artifact and can approve or revise again — a loop until
   approve.

**60s storyboard revise** (storyboard gate). The 60s storyboard is now ONE
16-panel master image, so a revise regenerates the **whole master** and re-crops
all four row strips (there is no per-segment targeting — the old
`parseTargetSegments` path was removed). `planRevision` grounds the directive on
the master sheet (`latestMasterStoryboard`); `segment_storyboard` rebuilds it,
**newest-per-`segment_index` wins** for the fresh crops, and the run re-pauses at
the storyboard gate.

`POST /runs/:id/cancel` flips any non-terminal run to `failed` (idempotent).

---

## 5. Stage: storyboard image (GPT Image 2)

**Code:** `agents/image/storyboard/index.ts` (skill) · `…/storyboard/prompt.ts`
(prompt) · `providers/openai/index.ts` → `generateImage`. Inputs:
`productSheetRef` + `personSheetRef` (`resolvePersonRef` — newest person sheet,
else upload) + `userPrompt` + optional revise `directive`.

### 5a. Plan (LLM, `buildStoryboardPrompt`)

An LLM (`gpt-4.1`) reviews the attached reference sheets + the user prompt and
returns STRICT JSON:

```jsonc
{
  "imagePrompt": "…full text-to-image prompt for the labelled sheet…",
  "scenes": [
    {
      "index": 1,
      "cameraAngle": "wide establishing shot",
      "actionMovement": "slow dolly in",
      "sceneDescription": "…rich, detailed description (used by the video step)…",
      "panelCaption": "WIDE SHOT. A damaged robot turns on, surveying the forest.",
      "transcript": "…spoken line (UGC) or voiceover (inspirational)…",
      "adStyle": "<run ad style>",
    },
    // exactly 4 scenes, index 1..4 in play order
  ],
}
```

- `panelCaption` is a **condensed form of the same `sceneDescription`** (shot
  type + brief action, ~6-12 words) — the text burned into the panel.
- `sceneDescription` + `transcript` are the **detailed** text consumed later by
  the video step. `scenes` is persisted to `storyboard_sheets.scenes` (JSONB);
  `imagePrompt` to `storyboard_sheets.prompt_used`.

### 5b. Render — OpenAI image API input

`generateImage({ prompt: plan.imagePrompt, refs: [productSheet, personSheet] })`
calls **`images.edit`** at `2048x1152` (2K, 16:9). The prompt the LLM authors
must specify (enforced by the system prompt):

- ONE image, **2×2 grid of four equal panels** with thin uniform separators, 2K
  (2048×1152, 16:9), top-left=1 … bottom-right=4.
- Each panel a photorealistic **keyframe**, product (and person) kept faithful to
  the reference sheets.
- **PANEL LABELS (required):** a scene-number **badge** (`01`–`04`) in a top
  corner of each panel + a **caption bar** along the bottom reading that scene's
  `panelCaption` verbatim, in clean uppercase storyboard lettering. No other
  text, **no arrows**.

**Output:** one labelled storyboard sheet → `assets` (kind `storyboard_sheet`) +
`storyboard_sheets` row (with `scenes`).

### 5c. Critic check (`storyboard_inspection`, optional)

`agents/critic/storyboard-inspection/prompt.ts` views the sheet and fails it
unless: exactly four ordered panels; product/person consistent; coherent ~15s
arc; **and each panel carries a legible, correctly-numbered badge + caption in
order** (missing/illegible/wrong-order = `major`/`blocking`). Stray extra text or
arrows are flagged. A rejected sheet triggers a full storyboard regen with the
critique threaded back into `buildStoryboardPrompt`.

---

## 6. Stage: video (Seedance 2.0 / BytePlus ModelArk)

**Code:** `agents/video/index.ts` (skill) · `…/video/prompt.ts` (prompt) ·
`providers/byteplus/index.ts` → `submitVideo` / `pollVideo`.

The orchestrator loads the latest storyboard sheet (`latestStoryboardSheet`),
resolves the person reference (`resolvePersonRef` — always present, since the
person sheet always runs), and calls `videoBuilder` with the sheet URL,
`scenes`, `hasPerson`, `personFaceRef`, and `userPrompt`.

### 6a. Compose the video prompt (LLM)

`buildVideoPrompt` (LLM, `gpt-4.1`) turns the scenes + transcripts into ONE
**simple, single-line Seedance shot list** — deliberately short (Seedance degrades
on long prompts; realism is carried by the still, not the prose):

```
Generate a scene using shots in the uploaded film storyboard
[0:00-0:04]: <panel 1 action + one camera move>; [0:04-0:08]: <panel 2>;
[0:08-0:11]: <panel 3>; [0:11-0:15]: <panel 4>.
```

- **One bracketed time slice per panel**, in order (`[0:00-0:04] … [0:11-0:15]`
  via `buildSliceBrackets`) — each a plain sentence: subject + action + **one**
  camera move, saying what the product visibly does.
- **`@Image` legend** anchoring identity (product / storyboard strip / face) — the
  routing/numbering in `agents/video/index.ts` is unchanged.
- **One audio line** — UGC: the on-screen person lip-syncs each transcript;
  inspirational: a voiceover narrates them.
- **Leak guard** — no grid, panel borders, badges, captions, subtitles or
  watermark text in the frame.

The per-scene `sceneDescription` + `transcript` ride in the user block. If the LLM
fails twice, `buildDeterministicVideoPrompt` builds the same shot-list string from
`scenes` (no LLM), so the step never dies on a parse hiccup. The final text sent to
Seedance is the `@Image` role-legend prefix (+ leak guard) **+** the `videoPrompt`
(`agents/video/index.ts`).

### 6b. Submit — BytePlus/Seedance API input

`submitVideo` POSTs to `/api/v3/contents/generations/tasks`:

```jsonc
{
  "model": "<BYTEPLUS_VIDEO_MODEL>",
  "content": [
    { "type": "text", "text": "<@Image 1 prefix + 3-segment videoPrompt>" },
    // then the guidance image(s) (see image-routing note below)
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": { "url": "…" },
    },
  ],
  "duration": 15, // input.durationSec ?? 15 (always 15 per clip, incl. each 60s segment)
  "resolution": "1080p", // env.BYTEPLUS_VIDEO_RESOLUTION (default 1080p; 720p/480p to cut cost)
  "ratio": "16:9", // input.aspectRatio (Seedance 2.0 key: 16:9 | 9:16)
  "generate_audio": true, // native synchronized audio
  "watermark": false,
  // + optional "seed" when BYTEPLUS_VIDEO_SEED is set (eval only)
}
```

**Image routing** (`videoBuilder`):

- **With a person** (the normal case — a person reference always exists):
  `personReferences = [personFaceRef, storyboardUrl]`. The **person's identity
  image is sent FIRST** as the primary face reference so Seedance locks the
  on-screen person to it; the storyboard follows for layout + shot order. Both
  are routed through the **BytePlus face-asset path** (`image_url =
"asset://<id>"`) so Seedance's real-human face filter accepts them — falling
  back to raw URLs if AK/SK are unset. `personFaceRef` is `resolvePersonRef` =
  the generated person sheet (which itself encodes the uploaded face when a photo
  was provided). See [byteplus-face-assets.md](byteplus-face-assets.md).
- **Without a person** (degenerate fallback — no person sheet at all):
  `referenceImages = [storyboardUrl]`, sent as a plain `reference_image`.

> The **labelled storyboard sheet is the shot guide** — the product / person
> _reference sheets_ are not sent. Identity + framing + shot order reach the
> model through the numbered panels + the scene text (+ the face reference).

Async: poll `/contents/generations/tasks/{id}` until `succeeded` → `video_url`.
The poll loop is bounded by `BYTEPLUS_POLL_TIMEOUT_MS` (a hard deadline).

### 6c. Persist

Download the mp4 (3× retry on transient network blips) → `assets` + `videos` row
(`durationSec`, `hasAudio`, `providerMeta` = `{ provider, model, taskId,
videoPrompt }`). For **15s** this is the final output — `kind: final_video`, **no
per-scene generation, no separate audio step, no merge** (Seedance emits the
final clip with native audio). For **60s** each segment persists as
`kind: segment_video` with its `segment_index`, and the four are concatenated by
the merge step (§8) into the `final_video`.

---

## 7. Labels-in / clean-out contract

The single subtlety of this pipeline:

- **In:** the storyboard sheet **does** carry number badges + caption bars, and
  is fed to Seedance as the ordered shot guide (panel `N` → time slice `N`).
- **Out:** the **final video must not show** the grid, separators, badges,
  caption bars, caption text, or arrows — they are direction only.

Enforced in three places, which must stay in agreement:

| Concern                           | Where                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Labels **required** in the sheet  | `agents/image/storyboard/prompt.ts` (STEP 3)                                          |
| Critic **requires** the labels    | `agents/critic/storyboard-inspection/prompt.ts`                                       |
| Labels **excluded** from the clip | `agents/video/prompt.ts` segment 3 + the `@Image 1` prefix in `agents/video/index.ts` |

If you change the label style, update all three together.

---

## 8. The 60s pipeline

When `runs.duration = "60s"`, the run produces **ONE 16-panel master storyboard
sheet → four cropped 4-panel row strips → four ~15s clips → one merged ~60s
clip**. It reuses the §5 storyboard and §6 video skills with added parameters;
only the orchestration differs (`orchestrator.ts` `executeStep`). The 15s path is
never touched.

> **Why one master sheet, not four.** Four separately-generated storyboard sheets
> (the prior design) drifted in look / product / person across segments even with
> cross-summaries threaded between them. Generating ALL sixteen panels in a SINGLE
> `gpt-image-2` image makes consistency inherent, then the sheet is cropped into
> four row strips — one per segment — that the video step animates.

### 8a. `narrative_outline` — the arc planner

`narrativeOutline` (`creative-direction/narrative-outline/`, `gpt-4.1` JSON) reads
`adStyle`/`adType`/`productBrief`/`productUse`/`personBrief`/`userPrompt` and
returns a 4-act arc — `{ segments: [{ index, beat, summary }], visualStyle }`
(hook → product-in-use → benefit → close) — persisted to `runs.narrative_outline`
+ `runs.visual_style`. Each `summary` is 2–3 sentences; the four feed the single
master gen as one ad. No images; runs right after the reference phase.

### 8b. `segment_storyboard` — one 16-panel master + four row crops

A SINGLE call to `generateMaster` (`agents/image/storyboard`, the `full60s` prompt
mode) renders ONE **4×4, sixteen-panel** master sheet from the four narrative
summaries: segment `i` → panels `4i+1 … 4i+4` (row `i`), all sixteen panels held
**visually distinct** by an anti-repetition rule (the fix for duplicate-looking
panels). It returns the raw bytes + all 16 scenes WITHOUT persisting.

The orchestrator then:

1. Persists the master as `kind: storyboard_master` (`segment_index = null`,
   `scenes` = all 16).
2. Crops it into four equal **row strips** with `lib/image/crop.ts`
   `cropPanelRows` (`sharp`; a small vertical inset avoids bleeding the neighbour
   row). For 16:9 each strip is 2048×288 (a 1×4 row of panels); for 9:16, 1152×512.
3. Persists each strip as `kind: storyboard_sheet` with its `segment_index` (0..3)
   and that row's four scenes — **exactly the shape `segment_video` already reads**
   via `segmentStoryboards()`, so the video half is unchanged.

**Idempotent:** done = master + all four crops exist. A mid-step resume reloads the
persisted master's bytes (it re-downloads, never re-pays the gen) and fills only the
missing crops. A **confirm-gate revise rebuilds the whole master and re-crops all
four** (newest-per-`segment_index` supersedes the old rows; no deletes).

### 8c. `segment_video` — fan out ×4 (parallel, capped)

For each strip not already turned into a clip, call `videoBuilder` (§6) with that
**row strip** as the shot guide + its four scenes + the person face ref + the
shared product sheet, plus `segmentIndex` and `otherSummaries`. The video prompt
treats the strip as "four panels left→right, panel N → time slice N". Each clip is
`durationSec: 15`, persisted as `kind: segment_video` with its `segment_index`.
Each segment registers its face asset under a **per-segment** `referenceTag`
(`${runId}-seg${i}`) so the four near-identical strips never collide on the
BytePlus face-asset name. Bounded by `SEGMENT_VIDEO_CONCURRENCY` (default 4);
the heartbeat keeps the lock fresh; idempotent skip per `segment_index`.

### 8d. `merge` — concat → final 60s

`mergeSegments` (`agents/merge/`) loads the four `segment_video` clips in
`segment_index` order and calls `lib/video/merge.ts` `mergeSegmentUrls`:
`ffmpeg-static` via `spawn` with the `concat` filter (re-encode to normalize,
**per-segment audio preserved**, `libx264`/`aac`, `+faststart`). A process-wide
semaphore (concurrency 1) + `-threads 2` cap CPU. The output is persisted as the
run's `final_video` (`segment_index = null`) — the same surface the 15s clip uses,
so the UI/API treat it identically.

### 8e. Continuity & resilience recap

```
narrative_outline → [summary0..3] + visualStyle
        │
segment_storyboard  ONE 16-panel master gen → crop into 4 row strips (segment_index 0..3)
        │  (confirm gate: a revise rebuilds the WHOLE master + re-crops all four, §4)
segment_video ×4 (∥, capped)  each strip + its 4 scenes + the other 3 summaries → 15s clip
        │
merge → 60s final_video
```

Continuity comes from the single master sheet + the same person/product reference
sheets (not frame-chaining), so the clips generate in parallel. All raw fetches
(reference images, segment downloads) go through `lib/http.ts` `fetchWithRetry`
(network + 429/5xx, backoff+jitter); see §2b.

### 8f. UI

The studio renders, for a 60s run: the **story outline** (`narrativeOutline`), the
**single 16-panel master storyboard** (`storyboard_master` asset; the four crop
strips are an internal step input and are not shown), the four 15s segment clips,
and the final merged 60s video, plus a per-segment script (`segmentScenes`) and a
duration-aware step timeline. The `GET /runs/:id/artifacts` response adds
`storyboardMaster`, `segmentStoryboards[]` and `segmentVideos[]` (newest-per-index);
`GET /runs/:id` adds `duration`, `segmentScenes`, and `narrativeOutline`.

### 8g. Continuity hardening (60s only)

Three additions tighten how cohesive the four clips feel. All are **60s-only and
duration-guarded**; the 15s path is byte-for-byte unchanged.

**1 — Product identity locked at the video stage.** For 15s, the only image sent
to Seedance is the labelled storyboard sheet (face-first when a person exists).
For **60s segments**, `videoBuilder` (`agents/video/index.ts`) additionally sends
the shared **product reference sheet** so the product stays identical across all
four clips (the per-segment storyboard alone drifts). The references are submitted
in a fixed order that defines an explicit **`@Image` legend**, built from the SAME
array that is submitted so the numbering can never drift from the content order:

| `@Image` | image | path | role |
|---|---|---|---|
| `@Image 1` | product reference sheet | plain `reference_image` | lock product identity / finish / markings |
| `@Image 2` | storyboard sheet | `asset://` (asset path) | shot composition + timeline (panels 01→04) |
| `@Image 3` | on-screen face | `asset://` face asset | the presenter's exact identity |

(`@Image 3` is dropped when the ad has no person; without a product sheet the
storyboard is `@Image 1` and the face `@Image 2`.) The product sheet is the ONLY
raw-URL ref — it contains no human, so Seedance's privacy filter accepts it. The
**storyboard MUST stay on the asset path**: its panels show the person, and a raw
`image_url` containing a real person is rejected with
`InputImageSensitiveContentDetected.PrivacyInformation` (this is why the 15s path
has always routed the storyboard through the face-asset registration). The
storyboard leak-guard (no grid/badges/captions in the output) is retained, and
`buildVideoPrompt` points the presenter-identity anchor at `@Image 3` for segments
(at `@Image 1` for 15s).

**2 — One locked visual-style bible.** `narrativeOutline` now also authors a
single `visualStyle` string — color grade, film stock/lens, lighting language,
palette, and the time-of-day arc across the four segments — persisted to
`runs.visual_style`. It is read into `SkillContext.visualStyle` and injected
**verbatim** (the identical string) into all four `buildStoryboardPrompt`s **and**
all four `buildVideoPrompt`s — 8 prompts, one look. Surfaced on `GET /runs/:id` as
`visualStyle`.

**3 — Unified levels + grade in merge (+ optional music bed).** `mergeSegmentUrls`
(`lib/video/merge.ts`) still preserves each segment's native audio, but the concat
filtergraph now also: (a) **loudnorm**s each segment to one loudness target so
levels match across the cuts (no volume jump at each seam); (b) applies one shared
**grade** (`eq`) to the whole concatenated video so the four clips sit in one look.
If `MUSIC_BED_URL` (new env) is set, that one track is looped across the full 60s,
**sidechain-ducked** beneath the native audio (so on-camera UGC dialogue is never
drowned), mixed in, and trimmed to length with `-shortest`. Unset ⇒ exactly the
prior output plus the loudnorm + grade pass. The concurrency-1 semaphore and
`-threads 2` cap are unchanged.

> **TODO (not implemented):** for inspirational ads, the per-clip narrator-voice
> drift is only fully solved by a TTS voiceover unification — generate one
> continuous VO from the concatenated 4-act script, disable Seedance's per-clip
> voice, and overdub the single VO + music bed in merge. The music bed above does
> not address narrator drift on its own.
