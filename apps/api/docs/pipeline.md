# Pipeline: images → storyboard → video

How a run turns a product image (+ optional person image) + a text prompt into a
single ~15s ad video with native audio. This doc traces the **end-to-end flow**,
the **run state machine**, and — most importantly — the **exact payloads sent to
the image and video model APIs**, so you can see precisely what reaches GPT
Image 2 and Seedance 2.0.

> Key contract (the recent refactor): the storyboard sheet is now **labelled** —
> four numbered keyframe panels (`01`–`04`), each with a brief caption burned in.
> That labelled sheet is fed straight to Seedance as the **ordered shot guide**,
> while the **detailed** scene descriptions + transcripts ride in the video
> prompt as text. The labels are **direction only**: the prompt instructs
> Seedance to follow the panels in order but keep the grid / badges / caption
> text **out of the rendered frame**. See "Labels-in / clean-out" below.

---

## 1. Run state machine

Authoritative state lives in the `runs` row (`status` + `current_step`); the
in-process worker (`creative-direction/worker.ts`) claims a run by DB lock and
the orchestrator (`creative-direction/orchestrator.ts`) advances it one step at a
time, persisting before each transition so a crash/restart resumes cleanly.

**Steps** (`packages/shared/src/enums.ts` → `stepSchema`):

```
product_sheet → person_sheet? → product_inspection? → storyboard
              → storyboard_inspection? → video
```

- `person_sheet` runs only when a person is involved.
- `product_inspection` / `storyboard_inspection` run only when the critic is
  enabled (`runs.critic_enabled`).
- Step order + gating: `creative-direction/plan.ts` (`nextStep`, `gateForNext`).

**Statuses** (`runStatusSchema`): `queued → running → awaiting_confirmation →
regenerating → completed | failed`.

- **Modes** (`runs.mode`): `automatic` (no gating) and `confirm` (pauses at
  `awaiting_confirmation` after each step). The critic auto-checks in **both**.

**Artifacts & storage.** Every generated file is a row in `assets` (kind ∈
`product_upload`, `person_upload`, `product_sheet`, `person_sheet`,
`storyboard_sheet`, `final_video`) plus a typed artifact row
(`storyboard_sheets`, `videos`, …). Files live in the public Supabase Storage
bucket `ugc-assets` at `runs/{runId}/{kind}-{uuid}.{ext}`; the `assets` row holds
both `storage_path` and `url`. See [database-schema.md](database-schema.md).

---

## 2. Stage: storyboard image (GPT Image 2)

**Code:** `agents/image/storyboard/index.ts` (skill) · `…/storyboard/prompt.ts`
(prompt) · `providers/openai/index.ts` → `generateImage` (API call).

**Two-step skill.** First an LLM (`gpt-4.1`) plans the script + the
text-to-image prompt; then GPT Image 2 renders the sheet.

### 2a. Plan (LLM, `buildStoryboardPrompt`)

The LLM reviews the attached reference sheets + the user prompt and returns
STRICT JSON:

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
  type + brief action, ~6-12 words) — it's the text burned into the panel.
- `sceneDescription` + `transcript` are the **detailed** text consumed later by
  the video step. `scenes` is persisted verbatim to `storyboard_sheets.scenes`
  (JSONB); `imagePrompt` is persisted to `storyboard_sheets.prompt_used`.

### 2b. Render — exact OpenAI image API input

`generateImage({ prompt: plan.imagePrompt, refs: [productSheet, personSheet?] })`
calls **`images.edit`** (because reference images are present):

| Field    | Value                                                              |
|----------|-------------------------------------------------------------------|
| `model`  | `gpt-image-2` (`OPENAI_IMAGE_MODEL`)                               |
| endpoint | `images.edit` (refs present) — else `images.generate`             |
| `image`  | product sheet (+ person sheet if present), as files               |
| `prompt` | `plan.imagePrompt` (see below)                                     |
| `size`   | `3840x2160` (`DEFAULT_IMAGE_SIZE`, 4K UHD, 16:9)                  |

The `imagePrompt` the LLM authors must specify (enforced by the system prompt):

- ONE image, **2×2 grid of four equal panels** with thin uniform separators,
  4K UHD (3840×2160, 16:9), top-left=1 … bottom-right=4.
- Each panel a photorealistic **keyframe**, product (and person) kept faithful
  to the reference sheets.
- **PANEL LABELS (required):** a scene-number **badge** (`01`–`04`) in a top
  corner of each panel + a **caption bar** along the bottom reading that
  scene's `panelCaption` verbatim, in clean uppercase storyboard lettering
  (like the reference example). No other text, **no arrows**.

**Output:** one labelled storyboard sheet → `assets` (kind `storyboard_sheet`) +
`storyboard_sheets` row (with `scenes`).

### 2c. Critic check (`storyboard_inspection`, optional)

`agents/critic/storyboard-inspection/prompt.ts` views the sheet and fails it
unless: exactly four ordered panels; product/person consistent; coherent ~15s
arc; **and each panel carries a legible, correctly-numbered badge + caption in
order** (missing/illegible/wrong-order labels = `major`/`blocking`). Stray extra
text or arrows are flagged. A rejected sheet triggers a full storyboard regen
with the critique threaded back into `buildStoryboardPrompt`.

---

## 3. Stage: video (Seedance 2.0 / BytePlus ModelArk)

**Code:** `agents/video/index.ts` (skill) · `…/video/prompt.ts` (prompt) ·
`providers/byteplus/index.ts` → `submitVideo` / `pollVideo` (API call).

The orchestrator loads the latest storyboard sheet (`creative-direction/
inputs.ts` → `latestStoryboardSheet`) and calls `videoBuilder` with the sheet
URL, `scenes`, `hasPerson`, and `userPrompt`.

### 3a. Compose the engineered video prompt (LLM)

`buildVideoPrompt` (LLM, `gpt-4.1`) turns the scenes + transcripts into ONE
single-line Seedance directive with **three labelled segments**:

- **Global setup** — lock subject/product/(presenter), environment, style,
  lighting; anchor identity to `@Image 1`.
- **Timeline** — ordered time slices, **one slice per storyboard panel in number
  order** (panel `01` → first slice … `04` → last), each with time range,
  on-screen action (matching that panel's keyframe + caption), **exactly one**
  camera move, and the synchronized audio (UGC = lip-synced spoken transcript;
  inspirational = voiceover).
- **Quality & constraints** — 4K photorealistic live-action, anti-distortion
  fallback, **and the leak guard**: no panel numbers, labels, arrows, grid
  lines, borders, captions, subtitles or watermark text anywhere in the frame.

The per-scene `sceneDescription` (detailed) and `transcript` (verbatim) are
passed into this prompt's user block. If the LLM fails twice,
`buildDeterministicVideoPrompt` builds the same three-segment string directly
from `scenes` (no LLM), so the step never dies on a parse hiccup.

The final text sent to Seedance is a fixed `@Image 1` prefix (describing the
labelled sheet + leak guard) **+** the engineered `videoPrompt`
(`agents/video/index.ts`).

### 3b. Submit — exact BytePlus/Seedance API input

`submitVideo` POSTs to `/api/v3/contents/generations/tasks`:

```jsonc
{
  "model": "<BYTEPLUS_VIDEO_MODEL>",
  "content": [
    { "type": "text", "text": "<@Image 1 prefix + 3-segment videoPrompt>" },
    // then the storyboard sheet as ONE image part:
    //  • no person → role "reference_image", image_url = storyboard URL
    //  • with person → registered as a BytePlus face asset, image_url = "asset://<id>"
    //                   (falls back to raw URL if AK/SK unset — face filter may reject)
    { "type": "image_url", "role": "reference_image", "image_url": { "url": "…" } }
  ],
  "duration": 15,          // input.durationSec ?? 15
  "resolution": "720p",    // DEFAULT_RESOLUTION
  "ratio": "16:9",         // DEFAULT_RATIO (Seedance 2.0 key)
  "generate_audio": true,  // native synchronized audio
  "watermark": false
}
```

- The **labelled storyboard sheet is the sole guidance image** — the product /
  person reference sheets are **not** sent. Identity + framing + shot order all
  reach the model through the numbered panels + the scene text.
- `referenceImages` (no person) vs `personReferences` (with person) decides
  whether the sheet rides as a plain `image_url` or a registered face asset; see
  [byteplus-face-assets.md](byteplus-face-assets.md).
- Async: poll `/contents/generations/tasks/{id}` until `succeeded` → `video_url`.

### 3c. Persist

Download the mp4 → `assets` (kind `final_video`) + `videos` row
(`durationSec`, `hasAudio`, `providerMeta` = `{ provider, model, taskId,
videoPrompt }`). One output video per run — **no per-scene generation, no
separate audio step, no merge step** (Seedance 2.0 emits the final clip with
native audio).

---

## 4. Labels-in / clean-out contract

The single subtlety of this pipeline:

- **In:** the storyboard sheet **does** carry number badges + caption bars, and
  is fed to Seedance as the ordered shot guide (panel `N` → time slice `N`).
- **Out:** the **final video must not show** the grid, separators, badges,
  caption bars, caption text, or arrows — they are direction only.

This is enforced in three places, which must stay in agreement:

| Concern              | Where                                                        |
|----------------------|-------------------------------------------------------------|
| Labels **required** in the sheet | `agents/image/storyboard/prompt.ts` (STEP 3)    |
| Critic **requires** the labels   | `agents/critic/storyboard-inspection/prompt.ts` |
| Labels **excluded** from the clip| `agents/video/prompt.ts` segment 3 + the `@Image 1` prefix in `agents/video/index.ts` |

If you change the label style, update all three together.
