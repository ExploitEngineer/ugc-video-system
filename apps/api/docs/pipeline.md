# Pipeline: images → storyboard → video

How a run turns a **product image** (+ optional **person image**) + a text
prompt into a single ~15s ad video with native audio. This doc traces the
**end-to-end flow**, the **run state machine**, the **four flows** (upload mode ×
run mode), the **confirm-mode feedback/regeneration loop**, and the **exact
payloads** sent to the image and video model APIs — so you can see precisely
what reaches GPT Image 2 and Seedance 2.0.

> Two contracts worth keeping in your head while reading:
>
> 1. **Parallel reference sheets.** The product sheet and the person sheet are
>    generated **concurrently** — they have no ordering dependency. The person
>    sheet never consumes the product sheet *image*; at most it consumes a short
>    product-derived *text* brief. (See §2.)
> 2. **Labels-in / clean-out.** The storyboard sheet is **labelled** — four
>    numbered keyframe panels (`01`–`04`), each with a brief caption burned in —
>    and that labelled sheet is fed straight to Seedance as the **ordered shot
>    guide**. The labels are **direction only**: the final video must keep the
>    grid / badges / caption text **out of the rendered frame**. (See §7.)

---

## 1. Run state machine

Authoritative state lives in the `runs` row (`status` + `current_step`); the
in-process worker (`creative-direction/worker.ts`) claims a run by DB lock and
the orchestrator (`creative-direction/orchestrator.ts` → `driveRun`) advances it
to the next stopping point, persisting before each transition so a crash/restart
resumes cleanly. **`current_step` = the LAST step that completed** (the
convention the single feedback gate relies on).

**Steps** (`packages/shared/src/enums.ts` → `stepSchema`):

```
product_sheet ┐
              ├─(parallel)→ [product_inspection?] → storyboard → [storyboard_inspection?] → video
person_sheet  ┘
```

- `product_sheet` + `person_sheet` run **concurrently** (`runReferencePhase`,
  `Promise.allSettled`). The checkpoint advances to `person_sheet` once both
  finish — it stands in for "the reference phase completed".
- `person_sheet` **ALWAYS runs**: from the uploaded person photo (identity-
  locked image-to-image) when one was uploaded, else **invented** from the
  product-derived brief. Either way the storyboard consumes the *generated*
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
- **Gates** (`plan.ts`, decoupled from the critic — keyed on *what the next step
  would be*, which already collapses inspection steps):
  - **reference gate** — right before `storyboard` (both reference sheets ready),
  - **storyboard gate** — right before `video`.

**Driver transitions** (`driveRun`):

| From status            | Driver does                                                              |
|------------------------|--------------------------------------------------------------------------|
| `queued`               | Phase 0: interpret ad style → `running`, `current_step=null` (see §2).   |
| `running`, step=null   | Run the **parallel reference phase**; advance/gate/complete.             |
| `running`, step=X      | Run `nextStep(X)`; pause at a gate (confirm mode) or advance.            |
| `regenerating`         | Re-run the gated step with the user's feedback threaded in (see §4).     |
| `awaiting_confirmation`, `completed`, `failed` | terminal for the driver.                         |

**Artifacts & storage.** Every generated file is a row in `assets` (kind ∈
`product_upload`, `person_upload`, `product_sheet`, `person_sheet`,
`storyboard_sheet`, `final_video`) plus a typed artifact row
(`product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`,
`videos`). Files live in the public Supabase Storage bucket `ugc-assets` at
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

| Path | When | Base image | OpenAI call |
|------|------|-----------|-------------|
| **Invent** | product, no person upload | none → text only | `images.generate` from `personBrief` |
| **From photo** | person uploaded (first gen) | uploaded photo (`baseRef`) | `images.edit` — identity-locked |
| **Edit-revise** | revise of a prior person sheet | prior person sheet (`baseRef`) | `images.edit` — keep subject, change aspects |

> **The product image never reaches the person agent.** Its inputs are
> `personBrief` (text), `userPrompt`, an optional `directive`, and an optional
> `baseRef` that is only ever the *uploaded person photo* or a *prior person
> sheet* (`orchestrator.ts` `person_sheet` case). This is exactly what lets the
> two sheets run in parallel.

**OpenAI image API** (`providers/openai/index.ts` → `generateImage`):

| Field    | Value                                                              |
|----------|-------------------------------------------------------------------|
| `model`  | `gpt-image-2` (`OPENAI_IMAGE_MODEL`)                               |
| endpoint | `images.edit` when `refs` present, else `images.generate`         |
| `image`  | the ref file(s) — product upload, person photo, or prior sheet    |
| `prompt` | the LLM-authored image prompt / short edit instruction            |
| `size`   | `2048x1152` (`DEFAULT_IMAGE_SIZE`, **2K** 16:9)                    |

> **Why 2K, not 4K:** intermediate sheets only *guide* the video. 4K made the
> base64 response ~12 MB and intermittently truncated (Unterminated-JSON
> failures), so sheets render at 2K — smaller, faster, reliable. `generateImage`
> also retries up to 3× to cover any remaining truncated-body parse errors.

If either branch rejects, the phase reports the first failing step
(`product_sheet` or `person_sheet`) and the run fails. Because the checkpoint
stays `null` until both succeed, a mid-phase crash re-runs the whole reference
phase on resume (idempotent — the brief is simply recomputed).

---

## 3. The four flows

The user-facing matrix is **upload mode** (product-only vs product+person) ×
**run mode** (automatic vs confirm). The step engine is identical; only the
person-sheet path and the gating differ.

| # | Flow | Reference phase | Gating |
|---|------|-----------------|--------|
| 1 | **Automatic · product only** | Phase 0 plans a person brief (vision over the product image); `product_sheet` ‖ `person_sheet` (**invent** from brief) | none — runs straight to `storyboard` → `video` |
| 2 | **Automatic · product + person** | no brief (skipped); `product_sheet` ‖ `person_sheet` (**from photo**, identity-locked) | none — straight to `storyboard` → `video` |
| 3 | **Confirm · product only** | same as #1 | **reference gate** (review sheets) → `storyboard` → **storyboard gate** → `video` |
| 4 | **Confirm · product + person** | same as #2 | same gates as #3; a reference-gate revise keeps the uploaded face (edit path) |

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
   re-run (`genStepForRevise`): **reference gate → `person_sheet`** (product
   hidden), **storyboard gate → `storyboard`**.
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
      "adStyle": "<run ad style>"
    }
    // exactly 4 scenes, index 1..4 in play order
  ]
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

### 6a. Compose the engineered video prompt (LLM)

`buildVideoPrompt` (LLM, `gpt-4.1`) turns the scenes + transcripts into ONE
single-line Seedance directive with **three labelled segments**:

- **Global setup** — lock subject/product/(presenter), environment, style,
  lighting; anchor identity to `@Image 1`.
- **Timeline** — ordered time slices, **one per storyboard panel in number
  order** (panel `01` → first slice … `04` → last), each with a time range, the
  on-screen action (matching that panel's keyframe + caption), **exactly one**
  camera move, and synchronized audio (UGC = lip-synced transcript; inspirational
  = voiceover).
- **Quality & constraints** — 4K photorealistic live-action, anti-distortion
  fallback, **and the leak guard**: no panel numbers, labels, arrows, grid lines,
  borders, captions, subtitles or watermark text anywhere in the frame.

The per-scene `sceneDescription` (detailed) and `transcript` (verbatim) ride in
the prompt's user block. If the LLM fails twice,
`buildDeterministicVideoPrompt` builds the same three-segment string directly
from `scenes` (no LLM), so the step never dies on a parse hiccup. The final text
sent to Seedance is a fixed `@Image 1` prefix (describing the labelled sheet +
leak guard) **+** the engineered `videoPrompt` (`agents/video/index.ts`).

### 6b. Submit — BytePlus/Seedance API input

`submitVideo` POSTs to `/api/v3/contents/generations/tasks`:

```jsonc
{
  "model": "<BYTEPLUS_VIDEO_MODEL>",
  "content": [
    { "type": "text", "text": "<@Image 1 prefix + 3-segment videoPrompt>" },
    // then the guidance image(s) (see image-routing note below)
    { "type": "image_url", "role": "reference_image", "image_url": { "url": "…" } }
  ],
  "duration": 15,          // input.durationSec ?? 15 (DEFAULT_DURATION_SEC)
  "resolution": "720p",    // DEFAULT_RESOLUTION
  "ratio": "16:9",         // DEFAULT_RATIO (Seedance 2.0 key)
  "generate_audio": true,  // native synchronized audio
  "watermark": false
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
> *reference sheets* are not sent. Identity + framing + shot order reach the
> model through the numbered panels + the scene text (+ the face reference).

Async: poll `/contents/generations/tasks/{id}` until `succeeded` → `video_url`.
The poll loop is bounded by `BYTEPLUS_POLL_TIMEOUT_MS` (a hard deadline).

### 6c. Persist

Download the mp4 (3× retry on transient network blips) → `assets` (kind
`final_video`) + `videos` row (`durationSec`, `hasAudio`, `providerMeta` =
`{ provider, model, taskId, videoPrompt }`). One output video per run — **no
per-scene generation, no separate audio step, no merge step** (Seedance 2.0 emits
the final clip with native audio).

---

## 7. Labels-in / clean-out contract

The single subtlety of this pipeline:

- **In:** the storyboard sheet **does** carry number badges + caption bars, and
  is fed to Seedance as the ordered shot guide (panel `N` → time slice `N`).
- **Out:** the **final video must not show** the grid, separators, badges,
  caption bars, caption text, or arrows — they are direction only.

Enforced in three places, which must stay in agreement:

| Concern              | Where                                                        |
|----------------------|-------------------------------------------------------------|
| Labels **required** in the sheet | `agents/image/storyboard/prompt.ts` (STEP 3)    |
| Critic **requires** the labels   | `agents/critic/storyboard-inspection/prompt.ts` |
| Labels **excluded** from the clip| `agents/video/prompt.ts` segment 3 + the `@Image 1` prefix in `agents/video/index.ts` |

If you change the label style, update all three together.
