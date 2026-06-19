# System context — UGC ad-video pipeline

A single, self-contained reference to the **whole workflow**: every agent/skill,
every AI call (model · endpoint · inputs · params · output), both the **15-second**
and **60-second** pipelines, the run state machine, providers, data model,
resilience, and the HTTP surface. Written so a reader with **no repo access** can
follow exactly what happens and what reaches each model.

> Companion docs (more depth on one subsystem): [pipeline.md](pipeline.md)
> (end-to-end flow narrative), [agents-and-skills-io.md](agents-and-skills-io.md)
> (per-skill I/O table), [database-schema.md](database-schema.md),
> [byteplus-face-assets.md](byteplus-face-assets.md), [rls-policies.md](rls-policies.md),
> [video-editor.md](video-editor.md) (post-completion editor).

---

## 1. What this is

AI ad-video generator: **product image** (+ optional **person image**) + a text
prompt → a single ad video with **native audio**. Two output lengths, chosen per
run by a `duration` toggle:

- **`15s`** (default) — one storyboard sheet (4 panels) → one ~15s Seedance clip.
- **`60s`** — four storyboard sheets (16 panels) → four ~15s clips → **merged**
  into one ~60s clip that feels like ONE cohesive ad.

**Post-completion editing:** once a run is `completed`, its `final_video` can be opened in a
client-side editor (img.ly CE.SDK) at `/studio/[runId]/edit` and saved back as a new `edited_video`
(+ `editor_scene`) asset — outside the generation pipeline. See [video-editor.md](video-editor.md).

Design principles:

- **Agents as code, not a framework.** Cooperating "skills" (a prompt module +
  a function) drive an **images → storyboard → video** pipeline. No agent
  framework; the orchestrator is plain TypeScript.
- **Provider-adapter boundary.** All OpenAI / BytePlus calls live behind
  `apps/api/src/providers/{openai,byteplus}` so models are swappable without
  touching agent logic.
- **DB-authoritative state machine.** A `runs` row is the single source of truth;
  an in-process worker advances it step-by-step, persisting before each
  transition, so a crash/restart resumes cleanly.
- **Two run modes.** `automatic` (no gating) and `confirm` (pauses for user
  approval at gates).

---

## 2. Tech & layout

```
apps/api      Hono + @hono/node-server, run via tsx (dev watch AND prod — no bundle/dist).
apps/web      Next.js 16 + React 19 + Tailwind 4 (studio UI; polls the API).
packages/shared  @ugc/shared — raw-TypeScript Zod enums + DTOs, imported from source
                 by both apps (no build step).
```

- Everything ESM. Node ≥ 22, pnpm workspaces.
- **Persistence:** Drizzle ORM over Supabase Postgres; files in Supabase Storage
  (public bucket `ugc-assets`, path `runs/{runId}/{kind}-{uuid}.{ext}`); every DB
  row holds both `storage_path` and `url`.
- **Validation:** Zod schemas in `@ugc/shared` validate every API route; the same
  enums back the Drizzle `pgEnum`s, so DB and app can't drift.

---

## 3. The two pipelines

Steps are values of `stepSchema` (`packages/shared/src/enums.ts`). A run never
mixes them — `duration` selects the chain. **The 15s chain is the original and is
untouched; the 60s steps are purely additive and duration-guarded.**

```
15s:  product_sheet ─┐
                     ├ (parallel) → [product_inspection?] → storyboard → [storyboard_inspection?] → video
      person_sheet ──┘

60s:  product_sheet ─┐
                     ├ (parallel) → narrative_outline → segment_storyboard → segment_video → merge
      person_sheet ──┘
                       (segment_storyboard = ONE 16-panel master sheet cropped into 4 row
                        strips; segment_video fans out ×4 over those strips, in parallel)
```

Common to both: `interpretAdStyle` runs first (leaving `queued`); the **reference
phase** generates the product + person sheets **concurrently**. The Critic
(`product_inspection` / `storyboard_inspection`) is **parked** — disabled by
default (`runs.critic_enabled = false`) and not in the studio UI; the code is
retained but dormant. Assume it's off unless told otherwise.

---

## 4. Run state machine

Authoritative state = the `runs` row: `status` × `current_step`. **`current_step`
= the LAST step that completed** (the convention the feedback gate relies on).

- **Worker** (`creative-direction/worker.ts`): recursive-`setTimeout` poll
  (`WORKER_POLL_INTERVAL_MS`, default 1500ms) selecting `status IN (queued,
  running, regenerating)`; claims a run by an atomic DB lock (`locked_at`,
  `locked_by`), refreshes a **heartbeat** every 30s while a step runs (survives
  multi-minute generation), single-flight per run, parallel across runs. Stale
  lock reclaimed after 3 min.
- **Orchestrator** (`creative-direction/orchestrator.ts` → `driveRun`): advances
  one run to its next stop. Fencing: if another worker reclaimed the lock, the
  losing driver aborts before writing.

**Statuses** (`runStatusSchema`):
`queued → running → awaiting_confirmation ⇄ regenerating → completed | failed`.

**`driveRun` transitions:**

| From status | Driver does |
|---|---|
| `queued` | Interpret ad style → `running`, `current_step=null`. |
| `running`, step=null | Run the parallel **reference phase**; checkpoint to `person_sheet`; gate/advance. |
| `running`, step=X | Run `nextStep(X, …, duration)`; pause at a gate (confirm) or advance; complete at `video` (15s) / `merge` (60s). |
| `regenerating` | Re-run the gated step with feedback threaded in (§12). |
| `awaiting_confirmation` / `completed` / `failed` | terminal for the driver. |

**Step ordering & gates** live in `creative-direction/plan.ts`
(`nextStep`, `gateForNext`, `gateForCurrentStep`, `genStepForRevise`), all
**duration-aware**. Gates (confirm mode only; keyed on *what the next step would
be*):

| Gate | 15s — pause before | 60s — pause before |
|---|---|---|
| **reference** | `storyboard` | `narrative_outline` (i.e. after both ref sheets) |
| **storyboard** | `video` | `segment_video` (i.e. after all 4 storyboards) |

**Resume / idempotency.** Every step reloads its inputs from the DB (never threads
state through memory). For 60s, the fan-out steps are **re-entrant**:
`segment_storyboard`/`segment_video` query which `segment_index` rows already
exist and regenerate only the missing ones — a crash mid-fan-out resumes and
fills the gaps.

---

## 5. Every AI call — master table

Models: **image generation** = `gpt-image-2`; **all reasoning/vision** = **Claude
Sonnet 4.6 via OpenRouter** (default; `gpt-4.1` fallback when `OPENROUTER_API_KEY`
is unset, or per-call `backend:"openai"`) — the per-skill `gpt-4.1` labels in the
table below denote this reasoning slot; **video** = Seedance 2.0 via BytePlus
ModelArk. Merge uses ffmpeg (no AI). Every
skill also receives a shared `SkillContext` (`agents/types.ts`):
`{ runId, adStyle, adType, productBrief, productUse?, personBrief, aspectRatio,
openai, video }`.

### Creative Direction Agent — `agents/creative-direction/` (`gpt-4.1`)

| Skill | Model · call | Images in | Text/params in | Output → persisted |
|---|---|---|---|---|
| `interpretAdStyle` (`interpret-style/`) | gpt-4.1 · `chat` json | — | `userPrompt` | `{ adStyle, adType: ugc\|inspirational }` → `runs.ad_style/ad_type` |
| `describeProduct` (`describe-product/`) | gpt-4.1 · `chat` **vision** | `productUpload` | `userPrompt`, `adStyle` | `{ productBrief, productUse }` → `runs.product_brief/product_use` (best-effort) |
| `planPersonBrief` (`person-brief/`) | gpt-4.1 · `chat` **vision** | `productUpload` | `userPrompt`, `adStyle` | `{ personBrief }` → `runs.person_brief` (invent-person case only) |
| `derivePersonBrief` (`derive-person-brief/`) | gpt-4.1 · `chat` **vision** | `personUpload` | `userPrompt` | `{ personBrief }` → `runs.person_brief` (uploaded-person case; best-effort, concurrent) |
| **`narrativeOutline`** (`narrative-outline/`) — **60s only, NEW** | gpt-4.1 · `chat` json | — | `adStyle, adType, productBrief, productUse?, personBrief, userPrompt` | `{ segments: [{index, beat, summary}] }` (exactly 4) → `runs.narrative_outline` |
| `planRevision` (`plan-revision/`) | gpt-4.1 · `chat` **vision** | `currentArtifact`, `productRef?` | `message, stage, adStyle, personBrief?` | `RevisionDirective { changes[], keep[], rationale, scope, revisedBrief?, targetSegments? }` |
| `interpretFeedback` (`interpret-feedback/`) | gpt-4.1 · `chat` json | — | `message, stage` | `{ intent: approve\|revise }` (defaults `revise` on parse fail) |

### Image Agent — `agents/image/` (`gpt-image-2`)

Each output is one composite grid PNG (`2048x1152` for 16:9, `1152x2048` for
9:16). The product and storyboard sheets are a 2×2 four-panel grid; the **person
sheet is an 8-panel two-row grid** (top row four full-body angles — front / left
profile / right profile / back; bottom row four matching face close-ups). Every
image skill first does a **`gpt-4.1` planning `chat`** to author the
text-to-image prompt, then **one `gpt-image-2` call**.

| Skill | Image-gen call | Images in (refs) | Text/params in | Output |
|---|---|---|---|---|
| `productSheetBuilder` (`product-sheet/`) | `images.edit` | `productUpload` | `userPrompt`, `critique?`, `aspectRatio` | `ProductReferenceSheet` (4 views) + `views` meta |
| `generatePersonImage` (`person-image/`) | `images.generate` (invent) or `images.edit` (from-upload / edit-revise) | `baseRef?` = uploaded photo OR prior person sheet (never the product) | `personBrief`, `userPrompt`, `directive?`, `aspectRatio` | `PersonReferenceSheet` + `personDetails` meta |
| `storyboardGenerator` (`storyboard/`) — **15s** | `images.edit` | `productSheetRef`, `personSheetRef?` | `userPrompt`, `critique?`, `directive?`, `aspectRatio` | labelled 2×2 keyframe PNG (badges 01–04 + caption bars) + 4 `scenes[]` (`{index, cameraAngle, actionMovement, sceneDescription, panelCaption, transcript, adStyle}`) → `storyboard_sheets` |
| `generateMaster` (`storyboard/`, `full60s`) — **60s** | `images.edit` | `productSheetRef`, `personSheetRef?` | `userPrompt`, `directive?`, `segments[]` (the 4 narrative beats), `aspectRatio` | a SINGLE 16-panel 4×4 keyframe PNG (badges 01–16, all panels distinct) + 16 `scenes[]`, returned WITHOUT persisting (the orchestrator persists it as `storyboard_master` and crops it into 4 `storyboard_sheet` row strips) |

`generatePersonImage` modes — keyed on `baseRef` + `directive`:

| Mode | When | Base image | Call |
|---|---|---|---|
| invent | product, no person upload | none (text only) | `images.generate` from `personBrief` |
| from-upload | person uploaded (first gen) | uploaded photo | `images.edit` (identity-locked) |
| edit-revise | revise of a prior person sheet | prior person sheet | `images.edit` (keep subject, change aspects) |

### Video Agent — `agents/video/` (Seedance 2.0)

| Skill | Calls | Images in | Text/params in | Output |
|---|---|---|---|---|
| `videoBuilder` (`index.ts`) | gpt-4.1 `chat` (compose prompt) → BytePlus `submitVideo` → `pollVideo` | `storyboardSheetRef`, `personFaceRef?` | `scenes[]` (incl. transcripts), `userPrompt`, `characterAnchor?`, `durationSec?`(=15), `aspectRatio` **+ 60s:** `segmentIndex`, `otherSummaries[]` | MP4 → `assets` (`final_video` 15s / `segment_video` 60s) + `videos` row (`durationSec`, `hasAudio`, `providerMeta`, 60s: `segment_index`) |

### Merge — `agents/merge/` (60s only, **no AI**)

`mergeSegments` → `lib/video/merge.ts` `mergeSegmentUrls` → ffmpeg concat →
persists the merged `final_video` (`segment_index = null`).

---

## 6. Continuity model (60s)

**The problem:** the four segments must look like ONE ad — same person, product,
look. Four separately-generated storyboard sheets drifted even with cross-summaries
threaded between them.

**The resolution:** generate ALL SIXTEEN panels in a **single `gpt-image-2` image**
(a 4×4 master sheet), so consistency is inherent, then crop it into four 4-panel
row strips — one per segment. A single upfront **`narrative_outline`** plans the
four segment summaries + a locked `visualStyle` (the 60s arc: hook → product-in-use
→ benefit → close) that feed the one master gen.

```
narrative_outline ── plans [summary0..3] + visualStyle → runs.narrative_outline / visual_style
        │
segment_storyboard ── ONE 16-panel master gen (segment i → panels 4i+1..4i+4, all distinct)
        │              → crop into 4 row strips (storyboard_sheet, segment_index 0..3)
   [confirm gate]      review the master → a revise rebuilds the WHOLE master (§12)
        │
segment_video      ── segment i gets: its row strip + 4 scenes + the OTHER 3 summaries → 15s clip (∥ ×4)
        │
merge              ── ffmpeg concat 4 clips (in order) → 60s final_video
```

Visual continuity is carried by the single master sheet + the same person/product
reference sheets — **not** by frame-chaining (clips are independent, so they
generate in parallel). Cuts between segments are clean scene-changes, not
morph-seamless.

---

## 7. Provider payloads (exact)

### OpenAI — `providers/openai/index.ts`

Client: `new OpenAI({ timeout: 240_000, maxRetries: 4 })` (SDK auto-retries
429/5xx + connection errors).

- **`generateImage({ prompt, refs?, size })`** → `images.edit` when `refs`
  present, else `images.generate`.
  - `model: gpt-image-2`; `size`: `2048x1152` (16:9) or `1152x2048` (9:16),
    divisible-by-16, **2K** (not 4K — 4K base64 bodies truncated, so sheets only
    *guide* the video at 2K).
  - Reference images are **fetched and inlined as base64 data URIs** (OpenAI's
    server times out fetching large Supabase URLs).
  - Internal **5× retry** with backoff (covers truncated-body parse errors).
- **`chat(messages, { maxTokens?, jsonMode?, backend? })`** → **Claude Sonnet 4.6
  via OpenRouter** by default (`gpt-4.1` when `OPENROUTER_API_KEY` is unset or
  `backend:"openai"`), `max_completion_tokens` (default 4096). `response_format:
  json_object` is applied ONLY on the gpt-4.1 path — on Claude it's skipped and we
  rely on the strict-JSON prompt + the forgiving `parseJsonObject`. Vision: image
  refs inlined as base64 before the call.

### BytePlus / Seedance 2.0 — `providers/byteplus/index.ts`

`submitVideo` → `POST /api/v3/contents/generations/tasks`:

```jsonc
{
  "model": "<BYTEPLUS_VIDEO_MODEL>",        // default dreamina-seedance-2-0-260128
  "content": [
    { "type": "text", "text": "<@Image 1 prefix + 3-segment videoPrompt>" },
    // then image parts in order: optional first_frame, plain refs, then face assets
    { "type": "image_url", "role": "reference_image", "image_url": { "url": "asset://<id>" } }
  ],
  "duration": 15,            // input.durationSec ?? 15
  "resolution": "1080p",     // env.BYTEPLUS_VIDEO_RESOLUTION (default 1080p; 720p/480p to cut cost)
  "ratio": "16:9",           // input.aspectRatio (16:9 | 9:16)
  "generate_audio": true,    // native synchronized audio
  "watermark": false
  // + optional "seed" when BYTEPLUS_VIDEO_SEED is set (eval only)
}
```

**Image routing** (`videoBuilder`): with a person, `personReferences =
[personFaceRef, storyboardUrl]` — the **face image is sent FIRST** (primary
identity), both via the **face-asset path** (`image_url = "asset://<id>"`, V4-
signed registration in `providers/byteplus/assets.ts`) so Seedance's real-human
filter accepts them; falls back to raw URLs if `BYTEPLUS_ACCESS_KEY`/`SECRET_KEY`
are unset. Without a person, `referenceImages = [storyboardUrl]` as a plain ref.
The labelled storyboard sheet is the **only** shot guide — the product/person
reference *sheets* are not sent.

Async: poll `/contents/generations/tasks/{id}` until `succeeded` → `video_url`,
bounded by `BYTEPLUS_POLL_TIMEOUT_MS`.

---

## 8. Merge step (60s) — `lib/video/merge.ts`

`ffmpeg-static` binary via `child_process.spawn` (a child process — does **not**
block the Node event loop). Download the 4 segment mp4s to `os.tmpdir()`, then:

```
ffmpeg -i s0 -i s1 -i s2 -i s3 -filter_complex \
 "[0:v][0:a][1:v][1:a][2:v][2:a][3:v][3:a]concat=n=4:v=1:a=1[v][a]" \
 -map "[v]" -map "[a]" -c:v libx264 -pix_fmt yuv420p -c:a aac -threads 2 -movflags +faststart out.mp4
```

Re-encode (not stream-copy) **normalizes** the four clips so the concat is robust;
the `concat` filter **preserves each segment's native audio** in order. A
**process-wide semaphore (concurrency 1)** + `-threads 2` cap CPU so concurrent
60s merges across runs can't saturate the host. Output persisted as `final_video`
(`segment_index = null`).

> `ffmpeg-static` has a postinstall that downloads the binary → it is listed in
> **both** `allowBuilds` and `onlyBuiltDependencies` in `pnpm-workspace.yaml`
> (else `pnpm install` fails in CI).

---

## 9. Resilience & scaling

Built for parallel fan-out, **no reliance on timeouts/fallbacks**:

- **`lib/http.ts` `fetchWithRetry`** — wraps every raw `fetch` (reference-image
  downloads in the OpenAI provider, segment-clip downloads in merge). Retries
  network errors + `408/425/429/500/502/503/504` with capped-exponential backoff
  + jitter (default 4 attempts). This closes the gap that caused a transient
  "fetch failed" on a shared ref image to kill a whole 60s fan-out.
- **OpenAI** — SDK `maxRetries: 4` (chat + image) **plus** `generateImage`'s own
  5× retry loop for truncated-body parse errors.
- **Fan-out concurrency caps** (env, tunable without redeploy):
  - `SEGMENT_STORYBOARD_CONCURRENCY` (default **3**) — caps concurrent image gens
    so 4 segments don't burst the shared-ref fetches all at once.
  - `SEGMENT_VIDEO_CONCURRENCY` (default **4**) — caps concurrent Seedance tasks
    against BytePlus account limits.
  - Both via a bounded runner (`runBounded` in `orchestrator.ts`); storyboards
    also use `Promise.allSettled` semantics so one failure surfaces after the
    rest settle (and idempotent resume re-runs only the missing segment).
- **Worker heartbeat** — refreshes the run lock every 30s, independent of the
  awaited step, so a multi-minute parallel fan-out never loses ownership.

---

## 10. Data model & storage

Drizzle schema (`apps/api/src/db/schema.ts`); see [database-schema.md](database-schema.md).

- **`runs`** — the state machine. Notable columns: `prompt`, `ad_style`,
  `ad_type`, `mode`, `aspect_ratio`, **`duration` (`15s`|`60s`, default `15s`)**,
  `product_brief`, `person_brief`, `product_use` (jsonb), **`narrative_outline`
  (jsonb, 60s)**, `critic_enabled`, `status`, `current_step`, `feedback`,
  `locked_at`/`locked_by`.
- **`assets`** — every stored file. `kind ∈ { product_upload, person_upload,
  product_sheet, person_sheet, storyboard_sheet, storyboard_master, final_video,
  segment_video }` (`storyboard_master` = the 60s single 16-panel sheet).
- **`storyboard_sheets`** — `scenes` (jsonb), **`segment_index`**: `null` = a 15s
  sheet OR the 60s `storyboard_master` (16 scenes; told apart by asset kind);
  `0..3` = a 60s crop strip (4 scenes each).
- **`videos`** — `duration_sec`, `has_audio`, `provider_meta`, **`segment_index`**
  (null = the 15s clip OR the merged 60s clip; 0..3 = a segment clip).
- **`step_events`** — audit trail (`started`/`passed`/`failed`/`regenerated`),
  drives the UI timeline.
- **Storage** — public bucket `ugc-assets`, path `runs/{runId}/{kind}-{uuid}.{ext}`.

---

## 11. Config / env knobs (`apps/api/src/config`)

| Key | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | gpt-image-2 + the gpt-4.1 reasoning/vision fallback |
| `OPENROUTER_API_KEY` | — (optional) | Claude Sonnet 4.6 = default reasoning/vision (unset ⇒ gpt-4.1) |
| `OPENAI_CHAT_MODEL` / `OPENROUTER_CLAUDE_MODEL` | `gpt-4.1` / `anthropic/claude-sonnet-4.6` | model-id overrides |
| `BYTEPLUS_API_KEY` | — | Seedance inference |
| `BYTEPLUS_VIDEO_MODEL` | `dreamina-seedance-2-0-260128` | model slug |
| `BYTEPLUS_VIDEO_RESOLUTION` | `1080p` | `1080p`/`720p`/`480p` |
| `BYTEPLUS_POLL_INTERVAL_MS` / `_TIMEOUT_MS` | `5000` / `600000` | poll cadence / hard deadline |
| `BYTEPLUS_VIDEO_SEED` | — | fixed seed (eval only) |
| `BYTEPLUS_ACCESS_KEY` / `SECRET_KEY` (+ `REGION`, `ASSET_GROUP_ID`) | — | face-asset registration |
| `SEGMENT_STORYBOARD_CONCURRENCY` | `3` | 60s storyboard fan-out cap |
| `SEGMENT_VIDEO_CONCURRENCY` | `4` | 60s video fan-out cap |
| `WORKER_ENABLED` / `WORKER_POLL_INTERVAL_MS` | `true` / `1500` | in-process worker |
| `DATABASE_URL` | — | Postgres (LOCAL in dev, never prod) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | — | Storage + DB |
| `CORS_ORIGIN`, `PORT`, `LOG_LEVEL`, `NODE_ENV` | — | runtime |

---

## 12. Confirm-mode & targeted regen

Single gate action: `POST /runs/:id/feedback` (legal only from
`awaiting_confirmation`). One free-text field:

```
blank      → approve → running       → driver advances (nextStep)
non-blank  → interpretFeedback classify:
               approve → running      → advance
               revise  → regenerating → driver re-runs the gated step
```

On `regenerating`, the driver resolves the gate (`gateForCurrentStep`) and the
step to re-run (`genStepForRevise`, duration-aware), then `planRevision` (vision)
turns the feedback into a `RevisionDirective`, and the gen step re-runs, re-pausing
at the **same gate** (loop until approve).

**60s storyboard revise** (storyboard gate): the 60s storyboard is ONE 16-panel
master image, so a revise regenerates the **whole master** and re-crops all four
row strips — there is no per-segment targeting. `planRevision` grounds the
directive on the master sheet (`latestMasterStoryboard`); `segment_storyboard`
rebuilds it; **newest-per-`segment_index` wins** for the fresh crops.

---

## 13. HTTP surface (`apps/api/src/routes/runs.ts`)

| Route | Purpose |
|---|---|
| `POST /runs` | Create a run. Multipart: `productImage` (req), `personImage?`, `prompt`, `mode`, `aspectRatio`, **`duration`** (`15s`/`60s`), validated by `createRunInputSchema`. Inserts a `queued` `runs` row + uploads. |
| `GET /runs` | List runs (newest first). |
| `GET /runs/:id` | Poll → `RunDetail` (run + assets + step events + `scenes`; **60s adds `duration`, `segmentScenes` (16 scenes grouped by segment), `narrativeOutline`**). |
| `GET /runs/:id/artifacts` | Sheets + final video; **60s adds `segmentStoryboards[]` and `segmentVideos[]` (newest-per-index), `finalVideo` = merged clip**. |
| `POST /runs/:id/edited-video` | Save a post-completion CE.SDK edit. Multipart: `video` (req `video/mp4`, ≤200MB), `scene?` (scene JSON). `completed`-only. Stores `edited_video` (+ `editor_scene`), keeps `final_video`. → `RunDetail`. See [video-editor.md](video-editor.md). |
| `POST /runs/:id/feedback` | The confirm-mode gate action (§12). |
| `POST /runs/:id/cancel` | Flip any non-terminal run to `failed` (idempotent). |
| `DELETE /runs/:id` | Delete the run + its storage objects + cascaded rows. |

The studio UI (`apps/web`) polls `GET /runs/:id` every 1.5s; for 60s it renders
the **story outline** (`narrativeOutline`), the four storyboard sheets, the four
15s segment clips, and the final merged 60s video, plus a per-segment script and
a duration-aware step timeline.

---

## 14. Hard non-goals

- 15s path: one output video per run; no per-scene generation; no separate audio
  step; no merge (Seedance emits the final clip with native audio).
- 60s path: exactly four segments merged once; continuity via summaries, not
  frame-chaining.
- Auth / RLS policies are **not** implemented (RLS enabled, no policies; the
  service-role API is currently unauthenticated — pre-production gap).
- The Critic agent is **parked** (off by default, removed from the UI).
