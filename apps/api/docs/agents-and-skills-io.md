# Agent & Skill I/O reference

An at-a-glance lookup, **per agent and per skill**, of _what image(s) go in, what
prompt/text goes in, and what comes out._ It is the I/O contract only — for the
end-to-end **flow** (state machine, gates, four flows) see
[pipeline.md](pipeline.md); for the exact **API payloads** sent to the models see
`apps/api/src/providers/`.

A "skill" = a prompt module (`prompt.ts`) + a function `(ctx, input) => result`,
living under `apps/api/src/agents/<agent>/<skill>/`.

## Legend

- `img` — an `ImageRef` (`{ source, mime? }`, a public/signed URL or base64 data URI).
- `text` — plain string prompt/brief.
- `meta` — JSON metadata carried on the artifact row (not an image).
- `?` — optional input.
- **Models:** image generation = `gpt-image-2`; all reasoning/vision = `gpt-4.1`;
  video = Seedance 2.0 via BytePlus ModelArk; the 60s **merge** step is ffmpeg
  (no AI).

Every skill **also** receives a shared `SkillContext` (`agents/types.ts`):
`{ runId, adStyle, adType (ugc|inspirational), productBrief, productUse?,
personBrief, aspectRatio, openai, video }`. It is listed once here and not
repeated per row.

> **15s vs 60s.** The same skills serve both run lengths. A **60s** run
> (`runs.duration = "60s"`) adds the `narrativeOutline` skill and runs the
> storyboard + video skills **once per segment (×4)** with extra `segmentIndex` /
> `segmentSummary` / `otherSummaries` inputs, then an ffmpeg **merge**. Those 60s
> fields are marked **(60s)** below; a 15s run never passes them. See
> [pipeline.md §8](pipeline.md) for the orchestration.

## Identity anchors — image vs text

The product/person identity travels two ways, and the difference is the whole
point of recent fidelity work:

- **Image anchors** — the `productUpload`, the generated **product/person
  reference sheets**, and the labelled **storyboard sheet**. Strong, but a
  generative step can _drift_ (e.g. render a bracelet for an uploaded bottle).
- **Text anchors** — `runs.product_brief` (factual product identity:
  category / materials / colors / markings) and `runs.person_brief`
  (demographics / wardrobe / palette). Planned once by vision in the reference
  phase and threaded to every downstream skill via `SkillContext`. When an image
  drifts, the **text anchor is the tie-breaker**.

Downstream skills (storyboard, both Critic inspections) now receive **both**, so
a wrong-kind product is caught instead of silently shipping.

---

## Creative Direction Agent — `agents/creative-direction/`

Orchestrator + the LLM "thinking" skills (no images produced; vision used to read
inputs). `gpt-4.1`.

| Skill                                       | Image in                                  | Prompt / text in                                                      | Other | Output                                                                                       |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `interpretAdStyle` (`interpret-style/`)     | —                                         | `userPrompt`                                                          | —     | `{ adStyle: text, adType: ugc \| inspirational }`                                            |
| `describeProduct` (`describe-product/`)     | `productUpload` (vision)                  | `userPrompt`, `adStyle`                                               | —     | `{ productBrief }` — text, 30–50 words (product category / materials / colors / markings); persisted to `runs.product_brief` |
| `planPersonBrief` (`person-brief/`)         | `productUpload` (vision)                  | `userPrompt`, `adStyle`                                               | —     | `{ personBrief }` — text, 40–70 words (demographics / wardrobe / palette); persisted to `runs.person_brief` |
| `derivePersonBrief` (`derive-person-brief/`) | `personUpload` (vision)                  | `userPrompt`                                                          | —     | `{ personBrief }` — gender/age/hair anchor when a person was **uploaded**; persisted to `runs.person_brief` (best-effort, concurrent) |
| `narrativeOutline` (`narrative-outline/`) **(60s)** | —                                | `adStyle`, `adType`, `productBrief`, `productUse?`, `personBrief`, `userPrompt` | — | `{ segments: [{ index, beat, summary }] }` — exactly 4; the 60s arc, persisted to `runs.narrative_outline` |
| `planRevision` (`plan-revision/`)           | `currentArtifact` (vision), `productRef?` | `message`, `stage` (reference\|storyboard), `adStyle`, `personBrief?` | —     | `RevisionDirective { changes[], keep[], rationale, scope: edit\|regenerate, revisedBrief?, targetSegments? }` — `targetSegments` **(60s)** = which storyboard segments to regen (from `parseTargetSegments`) |
| `interpretFeedback` (`interpret-feedback/`) | —                                         | `message`, `stage`                                                    | —     | `{ intent: approve \| revise }` (defaults to `revise` on parse failure)                      |

`planRevision`'s `revisedBrief` is emitted only at the **reference** gate and is
persisted back to `runs.person_brief`. `driveRun` (`orchestrator.ts`) is the
non-skill entry point that sequences everything.

`describeProduct` and `planPersonBrief` both run **in the reference phase**,
concurrently with the product sheet (vision over the same upload), and persist
their text briefs before the storyboard step reads them back. `describeProduct`
is **best-effort** — a failure logs and leaves `product_brief` empty (the pipeline
falls back to image-only grounding) rather than failing the run.

---

## Image Agent — `agents/image/` (`gpt-image-2`)

Produces the composite reference/storyboard sheets. Each output is a single grid
PNG (`2048x1152` for 16:9, `1152x2048` for 9:16) — the product and storyboard
sheets are a 2×2 four-panel grid; the person sheet is an 8-panel two-row grid.

| Skill                                    | Image in                                                           | Prompt / text in                          | Output                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `productSheetBuilder` (`product-sheet/`) | `productUpload`                                                    | `userPrompt`, `critique?`                 | `ProductReferenceSheet` — 2×2 product views (front / three-quarter / side / rear) PNG + `views` meta + `promptUsed` |
| `generatePersonImage` (`person-image/`)  | `baseRef?` (uploaded photo OR prior person sheet; absent ⇒ invent) | `personBrief`, `userPrompt`, `directive?` | `PersonReferenceSheet` — 8-panel person sheet PNG (top: 4 full-body angles; bottom: 4 face close-ups) + `personDetails` meta |
| `storyboardGenerator` (`storyboard/`) — **15s** | `productSheetRef`, `personSheetRef?`                        | `userPrompt`, `critique?`, `directive?`   | `StoryboardSheet` — labelled 2×2 keyframe PNG (badges 01–04 + caption bars) + 4 `scenes[]` meta; persists `storyboard_sheet` |
| `generateMaster` (`storyboard/`, `full60s`) — **60s** | `productSheetRef`, `personSheetRef?`               | `userPrompt`, `directive?`, `segments[]` (4 narrative beats) | `{ bytes, mime, scenes[16], imagePrompt }` — a SINGLE 16-panel 4×4 PNG (badges 01–16, all distinct), **NOT persisted** (the orchestrator persists it as `storyboard_master` and crops it into 4 `storyboard_sheet` row strips via `lib/image/crop.ts`) |

**Person agent has three modes**, keyed on `baseRef` + `directive` — and the
product image **never reaches it** (only a product-derived text brief):

| Mode            | When                           | Base image         | API call                                     |
| --------------- | ------------------------------ | ------------------ | -------------------------------------------- |
| **invent**      | product, no person upload      | none (text only)   | `images.generate` from `personBrief`         |
| **from-upload** | person uploaded (first gen)    | uploaded photo     | `images.edit` (identity-locked)              |
| **edit-revise** | revise of a prior person sheet | prior person sheet | `images.edit` (keep subject, change aspects) |

`storyboardGenerator`'s `scenes[]` each hold `{ index, cameraAngle,
actionMovement, sceneDescription, panelCaption, transcript, adStyle }` — the
`sceneDescription` + `transcript` are consumed downstream by the Video Agent.
The `transcript` lines are **grounded** in `productBrief` + `personBrief` (via
ctx) and held to an anti-repetition rule, so the four spoken lines are specific
to this product/person/scene instead of interchangeable filler.

---

## Critic Agent — `agents/critic/` (`gpt-4.1` vision)

Inspects a generated sheet; the `*Remediate*` variant additionally re-runs the
relevant Image-Agent skill to fix issues (bounded by a **retry cap — max 1
regen**).

| Skill                                          | Image in                                              | Prompt / text in                         | Output                                                            |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `inspectProductSheet` (`product-inspection/`)  | `sheetRef` (Image 1), `productUpload` (Image 2)                          | `views` meta, `userPrompt`, `productBrief` (ctx)               | `InspectionVerdict { pass, localizedRegen, issues[], summary }`   |
| `inspectAndRemediateProductSheet`              | `initial` sheet, `productUpload`                                         | `views`, `userPrompt`, `productBrief`                          | `CriticVerdict { outcome, attempts, finalArtifact, lastVerdict }` |
| `inspectStoryboard` (`storyboard-inspection/`) | `sheetRef` (Image 1), `productSheetRef` (Image 2), `personSheetRef?` (Image 3) | `scenes` meta, `userPrompt`, `hasPerson`, `productBrief` (ctx) | `InspectionVerdict` (`localizedRegen` always `false`)             |
| `inspectAndRemediateStoryboard`                | `initial` sheet, `productSheetRef`, `personSheetRef?`                    | `scenes`, `userPrompt`, `productBrief`                         | `CriticVerdict`                                                   |

Both inspections now attach the **ground-truth reference image(s)** in a fixed
order (legend in the prompt) plus the `productBrief` text, so the rubric can
compare identity directly. A storyboard or product sheet showing a **different
kind of item** than the upload/reference is flagged `blocking` / `global` — the
gap that previously let a drifted product (bracelet-for-bottle) pass.

Each `issues[]` entry = `{ severity: minor|major|blocking, region, problem, fixHint }`.

- **Product** remediation: if `localizedRegen` ⇒ targeted `images.edit` of only the
  flagged cells; else full rebuild via `productSheetBuilder` with the issues
  threaded in as `critique`.
- **Storyboard** remediation: always a full rebuild via `storyboardGenerator` (no
  localized path).
- `outcome ∈ { approved, regenerated_approved, failed_retry_cap }`.

---

## Video Agent — `agents/video/` (Seedance 2.0 / BytePlus)

| Skill                       | Image in                               | Prompt / text in                             | Other                                                        | Output                                                                                                   |
| --------------------------- | -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `videoBuilder` (`index.ts`) | `storyboardSheetRef` (15s: the 2×2 sheet; **60s:** one cropped 1×4 **row strip**), `personFaceRef?`, `productSheetRef?` | `scenes[]` (incl. transcripts), `userPrompt`, `characterAnchor?`, **(60s)** `otherSummaries[]` | `hasPerson`, `durationSec?` (=15), `critique?`, **(60s)** `segmentIndex` | `Video` — MP4 + `durationSec`, `hasAudio`, `providerMeta { provider, model, taskId, videoPrompt }`. 15s → `final_video`; **(60s)** → `segment_video` with `segment_index` |

`videoBuilder`'s prompt is a SIMPLE timestamped Seedance shot list
(`buildVideoPrompt` → `Generate a scene using shots in the uploaded film
storyboard [0:00-0:04]: …`), one slice per panel, with the `@Image` legend, ONE
audio line (UGC lip-sync / inspirational VO) and the leak-guard;
`buildDeterministicVideoPrompt` is the no-LLM fallback. 60s segments register the
face asset under a per-segment `referenceTag` so the four near-identical strips
don't collide.

- The **labelled storyboard sheet is the sole shot guide** — the product/person
  _reference sheets_ are **not** sent to Seedance. Identity + framing + shot order
  reach the model via the numbered panels + the `scenes` text + the face ref.
- `personFaceRef` is registered through the BytePlus **face-asset** path
  (`image_url = "asset://<id>"`) and sent **first** as the primary face reference
  (falls back to raw URL if AK/SK unset). See
  [byteplus-face-assets.md](byteplus-face-assets.md).
- Prompt composition: `buildVideoPrompt` (LLM) → engineered single-line Seedance
  directive (global setup / timeline / quality-constraints); falls back to
  `buildDeterministicVideoPrompt` (no LLM) if the LLM fails twice.
- **Realism:** output renders at `1080p` by default (`BYTEPLUS_VIDEO_RESOLUTION`);
  for UGC both prompt builders push real-phone-footage cues (true skin texture,
  mild sensor grain, handheld micro-shake, lived-in settings) and explicitly ban
  waxy/airbrushed skin, uncanny AI faces and HDR sheen.

---

## Merge Agent — `agents/merge/` (60s only, **no AI**)

| Skill | Image/video in | Params in | Output |
| --- | --- | --- | --- |
| `mergeSegments` (`index.ts`) | the four `segment_video` clips (loaded by `segment_index`) | — | merged ~60s MP4 → `assets` (kind `final_video`) + `videos` row (`segment_index = null`, `durationSec` = 4×15) |

The heavy lifting is `lib/video/merge.ts` `mergeSegmentUrls`: `ffmpeg-static` via
`spawn` with the `concat` filter (re-encode to normalize, **per-segment audio
preserved**, `libx264`/`aac`, `+faststart`), guarded by a process-wide semaphore
(concurrency 1) + `-threads 2`. The merged clip is the run's `final_video` — the
same surface the 15s clip uses, so the UI/API treat both identically.

---

## Provider call appendix

How the "image in / prompt in" of the tables map onto the actual provider calls
(`apps/api/src/providers/`):

- **`openai.generateImage({ prompt, refs?, size })`** → `images.edit` when `refs`
  present, else `images.generate`. Returns PNG bytes + mime. `size` =
  `2048x1152` (16:9) or `1152x2048` (9:16), divisible-by-16 per gpt-image-2;
  2K (not 4K) to avoid truncated base64 responses. Retries up to 5×.
- **`openai.chat(messages)`** → `gpt-4.1`. `ChatMessage = { role, content,
images? }`; image URLs are fetched and inlined as base64 data URIs before the
  call. Used by every Creative Direction + Critic skill. Returns text.
- **`video.submitVideo({ prompt, referenceImages?, personReferences?, referenceTag?, durationSec, aspectRatio, firstFrame? })`**
  → POST `/api/v3/contents/generations/tasks` (`generate_audio: true`,
  `resolution: env.BYTEPLUS_VIDEO_RESOLUTION` (default `"1080p"`; `720p`/`480p`
  to cut cost), `watermark: false`) → returns `{ taskId }`. Poll
  `video.pollVideo(task)` until `completed` → `{ videoUrl, hasAudio, downloadHeaders }`.
- **`ensureFaceAsset(url, name)`** (BytePlus, `assets.ts`) → registers/reuses a
  face asset (V4-signed) and returns the `assetId` used as `asset://<id>`.
- **`fetchWithRetry(url, init?, opts?)`** (`lib/http.ts`) → wraps every raw
  `fetch` (reference-image downloads in the OpenAI provider, segment-clip
  downloads in merge) with retry on network errors + 429/5xx (backoff+jitter).
  Plus: the OpenAI client uses `maxRetries: 4`. This is what keeps the 60s
  fan-outs (where many segments fetch the same sheets at once) from dying on a
  transient "fetch failed". Fan-out concurrency is capped by
  `SEGMENT_STORYBOARD_CONCURRENCY` (3) and `SEGMENT_VIDEO_CONCURRENCY` (4).
