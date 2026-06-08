# AI Product Ad Video Generator — SPEC

> Living architecture document **and** progress tracker. The **Build Status** and **Progress Log** sections record what is built. Keep them current as work lands.

---

## 1. Overview

Turns a **product image** (required) + an **optional person image** + a **text prompt** into a finished **~15-second advertisement video with audio**. The ad can be **any style** the user asks for — UGC, inspirational, cinematic, minimalist, luxury, comedic, etc. Agents read the user's intent and adapt; nothing assumes UGC.

Pipeline: **images → storyboard → video**, driven by cooperating AI agents that each carry their own skills and prompts. A Creative Direction Agent orchestrates the whole flow and propagates the requested ad style to every downstream agent. A Critic Agent validates artifacts and triggers regeneration. The final step sends the storyboard scene plan (as text) + the clean product/person reference sheets to Seedance 2.0 (via BytePlus), which produces **one** video with audio — there is no per-scene video building, no separate audio step, and no merge step.

---

## 2. Goals & Non-Goals

### Goals

- Accept product image (+ optional person image) + free-text prompt that **may** specify ad type/style/vibe.
- Two run modes: **Automatic** (end-to-end, no gating) and **Confirm-every-step** (user confirms each step).
- **Auto-checking in both modes**: Critic Agent validates each artifact and regenerates (full or partial) on issues.
- Style-agnostic: agents interpret requested style and adapt prompts/skills accordingly.
- Produce a single **~15s** ad video **with audio** as the final deliverable.
- Persist all artifacts + run state so a job survives a page refresh.

### Non-Goals

- ❌ Per-scene / per-keyframe video generation.
- ❌ Separate audio generation or an audio↔video merge step.
- ❌ Multiple output videos per run.
- ❌ Real-time / timeline video editing.
- ❌ Auth in early phases (deferred to **F8**).

---

## 3. Glossary

| Term                            | Meaning                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Scene**                       | A complete moment or section in the video.                                                                                   |
| **Keyframe**                    | A single important visual moment inside a scene.                                                                             |
| **Reference Sheet**             | A composite image of an entity (product or person) showing multiple views, used to keep downstream generations consistent.   |
| **Storyboard / Keyframe Sheet** | A single sheet describing the ordered scenes (camera/angle, action/movement, description) in the chosen ad style.            |
| **Run (Job)**                   | One end-to-end generation attempt for a project. The DB row is the state machine.                                            |
| **Step**                        | A discrete unit of the pipeline (product sheet, person sheet, product inspection, storyboard, storyboard inspection, video). |
| **Skill**                       | A named capability of an agent = a prompt module + a function the agent invokes.                                             |
| **Mode**                        | `automatic` or `confirm` — controls gating, not the auto-checks.                                                             |
| **Ad Style**                    | The interpreted creative direction (UGC / cinematic / minimalist / …) propagated to all agents.                              |

---

## 4. Architecture

### Agents, skills, services

| Agent                                       | Powered by                                                          | Skills                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Creative Direction Agent** (orchestrator) | OpenAI (LLM)                                                        | Holds all guidelines + workflow logic. Decides agent order for both modes, interprets requested ad style, propagates it downstream, drives the run state machine, applies mode gating. |
| **Image Generation Agent**                  | OpenAI — **GPT Image 2** for images, OpenAI LLM for prompt building | `Product Sheet Builder`, `Generate Person Image`, `StoryBoard Generator`                                                                                                               |
| **Critic Agent** (QA/validation)            | OpenAI (LLM, vision)                                                | `Product Sheet Inspection` (full or localized partial regen), `StoryBoard Sheet Inspection`                                                                                            |
| **Video Generation Agent**                  | **BytePlus ModelArk — Seedance 2.0** (`dreamina-seedance-2-0-260128`) | `Video Builder`                                                                                                                                                                       |

#### Skill detail

- **Product Sheet Builder** — decides the ad framework/hook from the product **and** the user's requested style, builds the final image prompt, calls GPT Image 2 → **Product Reference Sheet** (front, three-quarter, side, rear).
- **Generate Person Image** — **only** when no person image was uploaded. Runs **in parallel** with the Product Sheet Builder, driven by a product-derived **person brief** (TEXT) planned upstream from the uploaded product image — it never reads the product sheet image. Defines the kind of person + how they fit the product/ad style, then generates the **Person Reference Sheet**.
- **StoryBoard Generator** — takes the product sheet (+ person sheet if present) → **Storyboard/Keyframe Sheet** of scenes, each with camera/angle, action/movement, scene description, consistent with the ad style.
- **Product Sheet Inspection** — validates the product sheet; regenerates the whole sheet, or **only the localized part**, when the problem is local.
- **StoryBoard Sheet Inspection** — validates the storyboard sheet; regenerates if problems.
- **Video Builder** — sends the storyboard scene plan (text) + clean product/person reference sheets to Seedance 2.0 (via BytePlus) → final ~15s video with audio. Final output; no merge.

### End-to-end flow

```mermaid
flowchart TD
    A["Input: product image (+ optional person image)<br/>+ prompt (may include ad style) + mode"] --> CDA{{Creative Direction Agent<br/>interpret ad style + plan person brief}}
    CDA --> B["Image Agent · Product Sheet Builder<br/>→ GPT Image 2"]
    CDA --> C{Person image<br/>uploaded?}
    C -- No --> D["Image Agent · Generate Person Image<br/>(person brief TEXT) → GPT Image 2"]
    D --> PERS[(Person Reference Sheet)]
    B --> PRS[(Product Reference Sheet)]
    C -- Yes --> E
    PRS --> E["Critic Agent · Product Sheet Inspection"]
    PERS --> E
    E -- issues --> B
    E -- ok --> F["Image Agent · StoryBoard Generator<br/>→ GPT Image 2"]
    F --> SBS[(Storyboard Sheet)]
    SBS --> G["Critic Agent · StoryBoard Sheet Inspection"]
    G -- issues --> F
    G -- ok --> H["Video Agent · Video Builder<br/>→ BytePlus Seedance 2.0"]
    H --> VID[(Final ~15s video w/ audio)]

    CDA -. confirm-every-step gating .-> B
    CDA -. confirm-every-step gating .-> F
    CDA -. confirm-every-step gating .-> H
```

> Mode controls only the **gating** (the dotted lines): in `confirm` the run pauses at `awaiting_confirmation` after each step. Auto-checks (Critic) run in **both** modes.

### Execution model

- **Background worker + polling.** A Hono route enqueues a `run`; a background worker loop advances it step-by-step. The frontend polls a status endpoint. The `runs` row is the authoritative state machine, so a refresh never loses progress.
- **Assumption:** worker is an in-process loop in `apps/api` for F0–F7; revisit a dedicated queue (e.g. pg-boss) if scaling demands it.

### Agent/Skill code layout

Agents are **code, not a framework**. Each **skill** = a prompt module (`prompt.ts`) + a function (`index.ts`) of shape `(ctx: SkillContext, input) => Promise<SkillResult<T>>`. Provider adapters (OpenAI / video) are **injected via `SkillContext`**, never imported inside a skill — keeping skills swappable and testable.

```
apps/api/src/agents/
  types.ts                 SkillContext { runId, adStyle, openai }, SkillResult<T>
  json.ts                  parseJsonObject — pull strict JSON from an LLM reply
  image/                   Image Generation Agent (GPT Image 2) — F4
    index.ts               agent barrel (the 3 skills)
    persist.ts             shared: upload → assets row → artifact row (in a tx)
    product-sheet/         { prompt.ts, index.ts }  Product Sheet Builder
    person-image/          { prompt.ts, index.ts }  Generate Person Image
    storyboard/            { prompt.ts, index.ts }  StoryBoard Generator
    verify.ts              standalone skill runner (no worker until F7)
  critic/                  Critic Agent — F5 (reserved home)
  video/                   Video Generation Agent — F6 (reserved home)
  creative-direction/      Creative Direction Agent (orchestrator) — F7 (reserved home)
```

Each agent's prompts are written **inside that agent's own feature** (F4 Image, F5 Critic, F6 Video, F7 Creative Direction) — prompt and function are one unit, not a separate phase. The Creative Direction Agent (F7) wires the skills into the run state machine; until then skills are invoked directly via `verify.ts`.

---

## 5. Data Model & Artifact Schemas

**ORM:** Drizzle over **Supabase Postgres**. **Validation:** Zod mirrors live in `packages/shared` and are reused by API + frontend. **Files:** Supabase Storage; DB rows hold object path + URL.

### Tables

#### `projects`

| Field     | Type          | Notes                |
| --------- | ------------- | -------------------- |
| id        | uuid PK       |                      |
| ownerId   | uuid nullable | null until Auth (F8) |
| title     | text          |                      |
| createdAt | timestamptz   |                      |

#### `runs` (generation job)

| Field                 | Type                          | Notes                                                                               |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| id                    | uuid PK                       |                                                                                     |
| projectId             | uuid FK → projects            |                                                                                     |
| prompt                | text                          | raw user prompt                                                                     |
| adStyle               | text                          | interpreted style propagated to agents                                              |
| mode                  | enum `automatic` \| `confirm` |                                                                                     |
| status                | enum                          | `queued`, `running`, `awaiting_confirmation`, `regenerating`, `completed`, `failed` |
| currentStep           | enum (see Steps)              |                                                                                     |
| error                 | text nullable                 |                                                                                     |
| createdAt / updatedAt | timestamptz                   |                                                                                     |

**Steps enum:** `product_sheet`, `person_sheet`, `product_inspection`, `storyboard`, `storyboard_inspection`, `video`.

#### `assets`

| Field       | Type           | Notes                                                                                                 |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| id          | uuid PK        |                                                                                                       |
| runId       | uuid FK → runs |                                                                                                       |
| kind        | enum           | `product_upload`, `person_upload`, `product_sheet`, `person_sheet`, `storyboard_sheet`, `final_video` |
| storagePath | text           | Supabase Storage object path                                                                          |
| url         | text           | public or signed URL                                                                                  |
| mime        | text           |                                                                                                       |
| meta        | jsonb          | width/height/duration/provider info                                                                   |
| createdAt   | timestamptz    |                                                                                                       |

#### `step_events` (audit trail)

| Field     | Type           | Notes                                       |
| --------- | -------------- | ------------------------------------------- |
| id        | uuid PK        |                                             |
| runId     | uuid FK → runs |                                             |
| step      | enum (Steps)   |                                             |
| status    | text           | started / passed / failed / regenerated     |
| payload   | jsonb          | Critic diagnostics, prompts used, decisions |
| createdAt | timestamptz    | drives progress timeline                    |

### Canonical artifacts

#### Product Reference Sheet — `product_reference_sheets`

4 product views in one composite sheet.

| Field      | Type                               | Notes                                                                        |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| id         | uuid PK                            |                                                                              |
| runId      | uuid FK                            |                                                                              |
| assetId    | uuid FK → assets (`product_sheet`) |                                                                              |
| views      | jsonb                              | `{ front, threeQuarter, side, rear }` — each: crop/region descriptor + notes |
| promptUsed | text                               | final GPT Image 2 prompt                                                     |
| status     | text                               | `draft` / `approved` / `rejected`                                            |

#### Person Reference Sheet — `person_reference_sheets`

Multiple views + person details, costume/style, color reference. Only created when no person uploaded.

| Field         | Type                              | Notes                                            |
| ------------- | --------------------------------- | ------------------------------------------------ |
| id            | uuid PK                           |                                                  |
| runId         | uuid FK                           |                                                  |
| assetId       | uuid FK → assets (`person_sheet`) |                                                  |
| views         | jsonb                             | multiple view descriptors                        |
| personDetails | jsonb                             | `{ demographics, costumeStyle, colorReference }` |
| promptUsed    | text                              |                                                  |
| status        | text                              | `draft` / `approved` / `rejected`                |

#### Storyboard / Keyframe Sheet — `storyboard_sheets`

Ordered scenes, each with camera/angle, action/movement, description, in the chosen ad style.

| Field      | Type                                  | Notes                                                                     |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------- |
| id         | uuid PK                               |                                                                           |
| runId      | uuid FK                               |                                                                           |
| assetId    | uuid FK → assets (`storyboard_sheet`) |                                                                           |
| scenes     | jsonb[]                               | each: `{ index, cameraAngle, actionMovement, sceneDescription, adStyle }` |
| promptUsed | text                                  |                                                                           |
| status     | text                                  | `draft` / `approved` / `rejected`                                         |

#### Final Video — `videos`

Single ~15s clip with audio from Seedance 2.0 (via BytePlus). No merge.

| Field        | Type                             | Notes                                 |
| ------------ | -------------------------------- | ------------------------------------- |
| id           | uuid PK                          |                                       |
| runId        | uuid FK                          |                                       |
| assetId      | uuid FK → assets (`final_video`) |                                       |
| durationSec  | numeric                          | ~15                                   |
| hasAudio     | boolean                          | true (native Seedance audio)          |
| providerMeta | jsonb                            | provider, model slug, task id, params |
| status       | text                             | `processing` / `completed` / `failed` |

---

## 6. External Integrations

| Service                         | Used for                                                                               | Client                                       | Key (env)                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| **OpenAI**                      | GPT Image 2 (all image artifacts) **and** agent LLM reasoning/prompt-building/critique | `openai` SDK                                 | `OPENAI_API_KEY`                                                                 |
| **BytePlus**                    | Seedance 2.0 video (storyboard plan + reference sheets → ~15s video w/ audio)          | REST (`POST /api/v3/contents/generations/tasks` async) | `BYTEPLUS_API_KEY`                                                      |
| **Supabase**                    | Postgres DB (via Drizzle) + Storage + Auth (F8)                                        | `@supabase/supabase-js` + `postgres`/Drizzle | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |

**Config location:** env loaded + Zod-validated in `apps/api/src/config` (server secrets) and `apps/web` env (public-safe vars only). Provider calls live behind a thin **adapter boundary** (`apps/api/src/providers/{openai,byteplus}`) so the concrete model/provider is swappable without touching agent logic. BytePlus is the sole video provider; it speaks the async `POST /api/v3/contents/generations/tasks` → poll task id REST shape.

**Invocation shape:**

- GPT Image 2 — Image Agent builds a prompt (via LLM skill) → image generation call → store composite sheet to Supabase Storage → row in `assets` + artifact table.
- Seedance 2.0 — Video Builder submits the storyboard scene plan (text) + the clean product/person reference sheets (the annotated storyboard sheet is NOT sent as an image, so its panel numbers/arrows can't leak into the clip) as a video task to BytePlus, polls until complete, downloads the ~15s video to Supabase Storage.

---

## 7. Mode Behavior

|                      | Automatic                               | Confirm-every-step                                                                                                           |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Step gating          | None — worker advances straight through | Worker sets `awaiting_confirmation` after each step's artifact is produced + auto-checked; waits for user `confirm`/`reject` |
| Auto-checks (Critic) | ✅ runs, auto-regenerates on issues     | ✅ runs, auto-regenerates on issues (same)                                                                                   |
| User actions         | Cancel only                             | Confirm step / Reject step (→ regenerate) / Cancel                                                                           |
| Resume after refresh | Worker continues                        | Run sits in `awaiting_confirmation`; UI re-renders the pending step                                                          |

State machine: `queued → running → (regenerating ⇄ running) → [awaiting_confirmation only in confirm mode] → … → completed | failed`. Critic-driven regeneration is independent of mode and bounded by a retry cap (see Open Questions).

---

## 8. Open Questions / Assumptions

**Open questions**

- Exact OpenAI model id/endpoint mapped to "GPT Image 2", and whether a reference "sheet" is **one composite image** (multiple views in a grid) vs several separate images. **Assumption:** one composite sheet image per artifact.
- Exact **Seedance 2.0 model slug/region** on BytePlus, whether it accepts multiple reference images (product + person sheets) alongside the text prompt, and confirmation of **native audio** output at the requested ~15s duration (resolved in code: `dreamina-seedance-2-0-260128`, async `POST /api/v3/contents/generations/tasks`, `generate_audio:true`; live run pending).
- Agent runtime: OpenAI Responses/Chat + tool-calling vs Assistants API; how "skills" map to code. **Assumption:** each skill = a prompt module + a function, orchestrated in code by the Creative Direction Agent.
- Worker host: in-process loop vs separate queue process (pg-boss/BullMQ). **Assumption:** in-process loop in `apps/api` through F7.
- Regeneration **retry caps / cost guards** — max auto-regens per step before failing the run.
- Storage **bucket layout, signed-URL strategy, retention** policy.
- Whether projects are reusable across many runs or 1 run = 1 project in the MVP. **Assumption:** project can hold multiple runs; UI starts with one run per project.

**Assumptions** (recorded above inline) — all marked **Assumption:** are working defaults, revisit as needed.

---
# Build Status

> Per-feature status of the F0–F8 build order. "Done" = code complete and locally verified (typecheck/build/route smoke tests) unless noted. Live OpenAI/BytePlus end-to-end verification is still outstanding across the agent pipeline (F4–F7).

## F0 — Project scaffolding & config — **Done**

Deps added (`zod`, `drizzle-orm`/`drizzle-kit`/`postgres`, `@supabase/supabase-js`, `dotenv` on api; `framer-motion` on web). Per-app env files (`apps/api/.env(.example)` server secrets, `apps/web/.env.local(.example)` `NEXT_PUBLIC_*` only); real files gitignored. `apps/api/src/config` Zod-validates server env (fail-fast); `apps/web` exposes only public vars. Shared Zod enums in `packages/shared`. Provider adapter stubs under `apps/api/src/providers/{openai, byteplus}`. `pnpm dev`/`typecheck`/`lint` green.

## F1 — Database schema design — **Done**

Drizzle schema for all 8 tables (`projects`, `runs`, `assets`, `step_events`, `product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`, `videos`) in `apps/api/src/db/schema.ts`; 5 native `pgEnum`s sourced from shared Zod enums; PKs `gen_random_uuid()`, FKs `ON DELETE cascade`, FK + `runs.status` indexes, CHECKs on `step_events.status`/`videos.status`/`videos.duration_sec`. `drizzle.config.ts` + db scripts; initial migration applied to live Supabase. DB client singleton in `apps/api/src/db`. Seed helper. RLS enabled on every table (locked down / service-role-only; owner policies deferred to F8). Docs in `apps/api/docs/`.

## F2 — Frontend UI shell + TanStack Query — **Done**

Marketing landing (`/`), studio create form (`/studio`), run progress view (`/studio/[runId]`). shadcn/ui (new-york), next-themes, lucide-react, oklch token theme with violet→fuchsia→cyan brand accent. Shared DTO schemas in `packages/shared`. Create = structured form (image dropzones + preview, segmented mode field, prompt textarea). Progress = vertical timeline/stepper with per-step status, artifact cards w/ zoom, confirm-bar gating in confirm mode, terminal video/error states; Framer Motion throughout w/ `prefers-reduced-motion`. **No global store** (zustand removed): form draft = local state; server state = TanStack Query polling `GET /runs/:id`, stopping at terminal status and pausing at `awaiting_confirmation`.

## F3 — Backend API (Hono) + Zod — **Done**

Hono backend in `apps/api`: `app.ts` (CORS, `/health`, mounts `/runs`, error/notFound sinks). Routes in `src/routes/runs.ts`: `POST /runs` (multipart upload + validation + Storage upload + row inserts), `GET /runs/:id`, `GET /runs/:id/artifacts`, `POST /runs/:id/{confirm,reject,cancel}`. Zod validation on every route via shared schemas. Helpers: `lib/errors.ts` (single JSON error shape), `lib/storage.ts` (service-role Supabase client, public `ugc-assets` bucket), `lib/mappers.ts` (sole DB→DTO exit, never emits `storagePath`), `lib/runs.ts`. Public bucket for stable URLs (signed URLs deferred).

## F4 — Image Generation Agent + skills (GPT Image 2) — **Done (code; live verification pending)**

Image Agent + 3 skills under `apps/api/src/agents/image/`. Convention: each skill = `prompt.ts` + `index.ts` `(ctx, input) => SkillResult<T>`, OpenAI adapter injected via `SkillContext`. OpenAI provider (`providers/openai/index.ts`): `chat()` (vision-ready) + `generateImage()` (`images.generate` vs `images.edit` for ref→sheet); model ids in `providers/openai/constants.ts`. Skills: **Product Sheet Builder**, **Generate Person Image** (only when no person uploaded), **StoryBoard Generator**. All sheets = single composite images. Shared `agents/persist.ts` (upload → `assets` row → artifact row in one tx) and `agents/json.ts`. Ad style threaded opaque via `ctx`. Invoked standalone via `agents/image/verify.ts`. **Not yet run against live OpenAI image API.**

## F5 — Critic Agent + skills — **Done (code; live verification pending)**

Critic Agent under `apps/api/src/agents/critic/`. Two skills, each a single-pass inspection + inspect-and-remediate wrapper: **Product Sheet Inspection** and **StoryBoard Sheet Inspection**; inspections attach the sheet as a vision image and parse a strict `InspectionVerdict`. Critic does NOT own `run.status` (F7's job) — returns `CriticVerdict { outcome, attempts, finalArtifact, lastVerdict }`. Plumbing: verdict types, `CRITIC_RETRY_CAP = 1`, `events.ts` `writeStepEvent` (first writer of `step_events`), draft→approved/rejected status, generic remediate engine, localized product-view regen. Retry cap = 1; inspections cover product + storyboard only; localized partial regen = product sheet only (storyboard always full regen). Full regen re-invokes the F4 producer steered by an additive `critique?` field. Invoked standalone via `agents/critic/verify.ts`. **Not yet run against live OpenAI vision.**

## F6 — Video Generation Agent + Video Builder (Seedance 2.0) — **Done (code; live verification pending)**

Video Agent under `apps/api/src/agents/video/`. Provider boundary: shared `VideoProvider` interface + types in `providers/video.ts` (`submitVideo`/`pollVideo`). **BytePlus is the sole adapter** (`providers/byteplus/index.ts`) — async `POST /api/v3/contents/generations/tasks` (Bearer key, body `{model, content:[text, image_url…], duration, resolution:"720p", aspect_ratio:"16:9", generate_audio:true}`) → `{id}`; polling `GET …/tasks/{id}` maps `succeeded→completed`, `failed|cancelled|expired→failed`, else `processing`, reading `content.video_url`. `createVideoProvider()` in `providers/index.ts` returns the BytePlus provider. **Skill: Video Builder** composes ONE cinematic motion/audio prompt from the storyboard scenes (text plan), submits the clean product/person reference sheets (the annotated storyboard sheet is NOT sent as an image — its panel numbers/arrows would leak into the clip) + prompt + optional clean first frame, polls until terminal/timeout, downloads the mp4, persists via shared `persistSheet` (`kind:"final_video"`) → `assets` + `videos` row (`providerMeta:{provider,model,taskId,videoPrompt}`). Config: `BYTEPLUS_API_KEY`/`BYTEPLUS_BASE_URL`/`BYTEPLUS_VIDEO_MODEL` (`dreamina-seedance-2-0-260128`)/`BYTEPLUS_POLL_INTERVAL_MS`/`BYTEPLUS_POLL_TIMEOUT_MS`. `SkillContext` gains `video: VideoProvider`. **Face-asset registration**: person/face reference sheets are registered in BytePlus's asset library (AK/SK-signed OpenAPI) and referenced as `asset://<id>` so Seedance's real-human face filter accepts them; product sheets stay raw `image_url`. See `apps/api/docs/byteplus-face-assets.md`. Invoked standalone via `agents/video/verify.ts`. **Not yet run against live BytePlus.**

## F7 — Creative Direction Agent orchestration + modes — **Done (code; live end-to-end pending)**

CDA orchestrator + in-process background worker under `apps/api/src/agents/creative-direction/`. (1) **Style skill** `interpret-style` distils the raw prompt into a concise style-agnostic `adStyle` brief, run once on leaving `queued`, persisted to `runs.adStyle`, threaded into every downstream skill via `ctx.adStyle`. (2) **State machine** `orchestrator.ts` (`driveRun`) + **worker** `worker.ts` (`startWorker`). Fixed pipeline in `plan.ts`: `product_sheet → [person_sheet if no person] → product_inspection → [gate] → storyboard → storyboard_inspection → [gate] → video → completed`. Convention: `currentStep` = last completed step; `status` drives the worker (`queued`→interpret; `running`→`nextStep`; `regenerating`→re-run stage; `awaiting_confirmation`/`completed`/`failed` terminal). Existing confirm/reject/cancel routes work unchanged. Gating (confirm mode only) pauses after each validated stage; Critic auto-checks run in both modes. Resumable: each step persists state + reloads inputs from DB. Worker = recursive-`setTimeout` poll, single-flight per `runId`, gated by `WORKER_ENABLED`. **Outstanding: full live OpenAI + BytePlus end-to-end run in both modes (automatic + confirm) — not yet verified.**

## F8 — Auth (Supabase) + hardening + cleanup — **Not started (deferred to last)**

Supabase Auth sign-in; set `projects.ownerId` and scope runs/artifacts; owner-based RLS policies; secret review + rate limiting + input hardening; cleanup, error states, asset retention policy.

---

## Progress Log

### 2026-06-08

- **Pipeline quality pass — product fidelity, grounded scripts, video realism.** Four stacked branches fixing three reported defects. **(1) Product drift (`fix/product-brief-text-anchor`).** The storyboard intermittently rendered a *different* product (bracelet for an uploaded bottle) because no textual product identity existed anywhere — a drifting reference sheet had no anchor — and the storyboard prompt's examples used the word "bracelet" 6×, which the LLM could parrot into the generated image prompt. New CDA skill `describe-product/{prompt,index.ts}` (vision over the upload → factual `productBrief`: category/materials/colors/markings), persisted to a new `runs.product_brief` column (migration `0008_even_black_tarantula.sql`), threaded via `SkillContext.productBrief` (set in `buildCtx`). Computed in `runReferencePhase` concurrently with the product sheet + person brief, **best-effort** (a brief failure logs and continues image-only, never fails the run). Storyboard prompt injects it as a "THE PRODUCT IS" identity anchor and all "bracelet" examples become neutral placeholders. **(2) Blind critic (`fix/storyboard-critic-grounding`).** The storyboard critic's rubric demanded the product stay "consistent with the reference sheets" but the sheets were never attached to the vision call, so wrong-product always passed. Storyboard inspection now attaches the product sheet (Image 2) + person sheet (Image 3) + `productBrief`; product inspection attaches the original upload (Image 2) + brief; both flag a different-kind item as `blocking`/`global`. **(3) Repetitive scripts (`fix/scene-script-tailoring`).** Added `SkillContext.personBrief` and a SCRIPT GROUNDING block: every `transcript` must name/evoke THIS product, carry a distinct scene-specific beat (hook→in-use→benefit→close), match its panel and fit the person, with an anti-repetition rule + a banned-hype-filler list. **(4) Fake-looking video (`fix/video-realism`).** Output was hardcoded `720p`; added `BYTEPLUS_VIDEO_RESOLUTION` env (default `1080p`, overridable; provider reads + logs it, 720p kept as empty-value fallback), documented in `.env.example`. Strengthened UGC realism in both video prompt builders + the storyboard UGC keyframe look (true skin texture, phone-camera grain/motion-blur/handheld shake, lived-in settings; explicit bans on waxy/airbrushed skin, uncanny AI faces, HDR sheen). Also refreshed `docs/agents-and-skills-io.md` (identity-anchors note, describeProduct row, grounded critic rows, 1080p). `pnpm typecheck` green across packages after each branch; migration applied to local Postgres. **Not yet run live end-to-end** — the gym-bottle UGC run (×5 to confirm drift gone) + 1080p realism check are the pending manual verification (needs OpenAI + BytePlus keys).

### 2026-06-05

- **User-selectable output aspect ratio (16:9 / 9:16).** Every run was hardwired to 16:9; the user now picks the output shape in the composer and it propagates to **both** the reference/storyboard image sheets **and** the final Seedance video (so the guidance frame is never cropped/letterboxed). New shared enum `aspectRatioSchema = z.enum(["16:9","9:16"])` (`packages/shared/src/enums.ts`), added to `createRunInputSchema` + `runSchema` (`dto.ts`). New `runs.aspect_ratio` pg-enum column, `NOT NULL DEFAULT '16:9'` (migration `0007_chunky_shard.sql`) — safe for existing rows. Flows: `POST /runs` parses + persists it → `buildCtx` puts it on `SkillContext.aspectRatio` → the three image skills pass `size: IMAGE_SIZE_BY_RATIO[ratio]` (16:9→2048×1152, 9:16→1152×2048; both ÷16 for gpt-image-2, ~2.36 MP) to `generateImage` and swap the prompt resolution label (`IMAGE_LABEL_BY_RATIO`); the video skill passes `aspectRatio` into both prompt builders (frame-orientation label) and `submitVideo`, where the BytePlus body sets `ratio: input.aspectRatio ?? DEFAULT_RATIO`. `toRunDto` round-trips it. Web: a new `AspectRatioToggle` segmented pill (cloned from `ModeToggle`, `layoutId:"ratio-pill"`, RectangleHorizontal/Vertical icons) sits beside the mode toggle in `create-run-form.tsx`; `fd.set("aspectRatio", …)`. The three `verify-*.ts` scripts get the new ctx field. `pnpm typecheck` (all pkgs) + `pnpm --filter web lint` green; migration generated + applied to local Postgres (column/enum confirmed). **Not yet run live end-to-end** — a 9:16 run producing portrait sheets + video is the pending manual check (needs OpenAI + BytePlus keys).

### 2026-06-03

- **Product & person reference sheets now generate in parallel.** Branch `feat/parallel-product-person-sheets`. Previously the pipeline was strictly sequential — `person_sheet` consumed the *generated* product sheet image (`refs:[productSheetRef]`) for color/style coherence, forcing it to wait for `product_sheet`. **Decoupled the two:** a new CDA planning skill `creative-direction/person-brief/{prompt,index.ts}` runs once in Phase 0 (vision over the **uploaded** product image + prompt + ad style) → a self-contained **person brief** (TEXT: demographics, wardrobe, palette), persisted to a new `runs.person_brief` column (migration `0006_common_puck.sql`). `generatePersonImage` input swapped `productSheetRef: ImageRef` → `personBrief: string`; its `generateImage` call drops `refs` (pure text-to-image), so the person sheet **never sees the product sheet image**. Orchestrator: Phase 0 plans + persists the brief; a new `runReferencePhase` fires `product_sheet` + (when no person uploaded) `person_sheet` concurrently via `Promise.allSettled` when `currentStep === null`, then checkpoints to `person_sheet`/`product_sheet` and falls through to the **unchanged** gate/advance block — so `plan.ts` sequencing, the `reference` gate, the `Step` enum, and the confirm/reject/feedback routes are all untouched. Confirm-mode behavior is unchanged: both sheets generate in parallel, then one pause at the `reference` gate; a revise still re-runs `person_sheet` alone (now genuinely independent of product). Storyboard still receives both sheets as image refs, so final-composite coherence is preserved. `verify-image.ts` updated to plan the brief then generate. `pnpm typecheck` + `pnpm --filter web lint` green; migration applied to local Postgres. **Not yet run live end-to-end.**

### 2026-06-01

- **Seedance face-asset registration (beat the real-human face filter).** Seedance rejects raw face images sent as `image_url`, so person sheets must be registered in BytePlus's asset library → referenced as `asset://<id>` with `role:"reference_image"`. Added a Volcengine signature-V4 signer (`providers/byteplus/sign.ts`, node `crypto`, AK/SK) and an asset module (`providers/byteplus/assets.ts`: `ensureGroup`/`createAsset`/`listAssets`/`waitAssetActive`/`ensureFaceAsset`, DB-free, idempotent via deterministic asset name + list-before-create, single shared group). `submitVideo` now registers **person refs only** (product stays a plain `image_url`), aligned the task body to the guide (`role`, `ratio`, `watermark:false`). Config adds `BYTEPLUS_ACCESS_KEY`/`BYTEPLUS_SECRET_KEY` (optional) + `BYTEPLUS_REGION`/`BYTEPLUS_ASSET_GROUP_ID` + ⚠️ placeholder host/service/version. **Graceful fallback**: no AK/SK → raw `image_url` + warning, so the app still boots. No fal.ai (reference sheets already public in Supabase); no DB/web changes. Full flow doc: `apps/api/docs/byteplus-face-assets.md`. `typecheck`+`build` green. **Live pending**: user adds AK/SK and confirms the asset-mgmt Action names / host / service / version.

- **Video provider switch (reverted): OpenRouter Kling 3.0 → BytePlus Seedance 2.0 again.** Branch `feat/seedance-2.0`. The user is going back to **Seedance 2.0 via the official BytePlus provider** (proper Seedance setup details to follow). Surgical revert of the **API only** — web UI untouched. Restored `providers/byteplus/index.ts` (async `POST /api/v3/contents/generations/tasks` → poll task id → `content.video_url`, `generate_audio:true`), `createVideoProvider()` → BytePlus, config/env `OPENROUTER_*` → `BYTEPLUS_*` (`dreamina-seedance-2-0-260128`, base `https://ark.ap-southeast.bytepluses.com`), `hasAudio` default back to `true`, Seedance naming across CLAUDE.md/SPEC/README/db-schema doc, and the `seedance-v2` entry in `skills-lock.json`. **Kept** the grid-leak fix (the annotated storyboard sheet is NOT sent as an image — only the storyboard scene plan as text + the clean product/person reference sheets reach the model) and the photorealism prompt hardening; the BytePlus adapter was adapted to the current `firstFrame`/`referenceImages` `VideoProvider` interface (the reference sheets become `content[]` `image_url` parts). Deleted `providers/openrouter`. ⚠️ Open: exact Seedance multi-image content shape, pending the user's setup details. `pnpm --filter api typecheck` + `build` green. **Not yet run against live BytePlus.**

- **Video provider switch: BytePlus/Seedance 2.0 → OpenRouter Kling 3.0 Standard.** Seedance's real-person face filter blocked the product/person ad use case, so the sole video provider is now **Kling 3.0 Standard** (`kwaivgi/kling-v3.0-std`) via **OpenRouter**. Removed `providers/byteplus`; added `providers/openrouter/index.ts` implementing the shared `VideoProvider` against OpenRouter's async video API: `POST /api/v1/videos` (`{model, prompt, duration, resolution, aspect_ratio, frame_images:[{first_frame}], input_references[], generate_audio:true}`) → `{id, polling_url}`, then `GET polling_url` until `completed`/`failed`, reading `unsigned_urls[0]` (download carries the bearer header). `createVideoProvider()` returns the OpenRouter provider — no fallbacks. The storyboard sheet is the first frame; person/product sheets ride along as `input_references` (Kling has no face restriction → photorealistic refs). **Audio on** (`generate_audio:true`; `videos.has_audio` stays default `true`). Config env renamed `BYTEPLUS_*` → `OPENROUTER_API_KEY`/`OPENROUTER_BASE_URL`/`OPENROUTER_VIDEO_MODEL`/`OPENROUTER_POLL_INTERVAL_MS`/`OPENROUTER_POLL_TIMEOUT_MS`. Purged Seedance/BytePlus/Ark naming from CLAUDE.md, this SPEC's live sections, `apps/api/docs/database-schema.md`, the web `run-meta.ts` sublabel, and dropped the `seedance-v2` skill from `skills-lock.json`. Deleted the stale pre-byteplus `apps/api/dist/` build (the ghost that kept serving old provider code via `pnpm start`). `pnpm --filter api typecheck` green. **Not yet run against live OpenRouter** — first F6/F7 live run pending.

### 2026-05-31

- **Video provider switch: Ark/RunComfy → BytePlus (sole provider).** Removed the `providers/ark` and `providers/runcomfy` adapters; added `providers/byteplus` implementing the shared `VideoProvider` interface against the `POST /api/v3/contents/generations/tasks` REST shape (Seedance 2.0, `generate_audio:true`). `createVideoProvider()` returns the BytePlus provider — no fallbacks/alternates. Config env renamed `ARK_API_KEY` → `BYTEPLUS_API_KEY`/`BYTEPLUS_BASE_URL`/`BYTEPLUS_VIDEO_MODEL`/`BYTEPLUS_POLL_INTERVAL_MS`/`BYTEPLUS_POLL_TIMEOUT_MS`. Docs: `apps/api/docs/video-providers.md`.
- **Agent prompt + UI refinements.** Iterated image/critic/video/CDA prompt modules and assorted web UI components (landing, studio create form, run views, shadcn primitives); studio form sub-components (`image-dropzone`, `mode-toggle-field`, `prompt-field`) folded back into `create-run-form`.
- **SPEC cleanup.** Replaced the F0–F8 `- [ ]` checklists with a prose **Build Status** section; corrected provider naming throughout (Ark → BytePlus) in the architecture, integrations, and data-model sections. Live OpenAI/BytePlus end-to-end verification (F4–F7) still outstanding.


### 2026-05-30

- SPEC.md created — architecture, data model, integrations (OpenAI + Ark/Seedance + Supabase), mode behavior, and feature checklists F0–F8 captured. No application code yet.
- **F0 complete.** Deps added (`zod`, `drizzle-orm`/`drizzle-kit`/`postgres`, `@supabase/supabase-js`, `dotenv` on api; `zustand`/`framer-motion` on web). Per-app env files (`apps/api/.env(.example)` server secrets, `apps/web/.env.local(.example)` `NEXT_PUBLIC_*` only); real files gitignored. Video provider switched **fal.ai → Volcengine/BytePlus Ark** (`ARK_API_KEY`) across SPEC + CLAUDE.md. Built: `apps/api/src/config` (Zod env, fail-fast), `apps/web/src/lib/env.ts` (public-only), shared Zod enums (`packages/shared/src/enums.ts`), provider stubs `apps/api/src/providers/{openai,ark}`. typecheck + lint + api boot all green.
- **F1 complete.** Drizzle schema for all 8 tables in `apps/api/src/db/schema.ts` (5 native `pgEnum`s sourced from the shared Zod enums; PKs `gen_random_uuid()`, FKs `ON DELETE cascade`, indexes on every FK + `runs.status`, CHECKs on `step_events.status`, `videos.status`, `videos.duration_sec > 0`). `drizzle.config.ts` + `db:generate/migrate/push/seed/studio` scripts. Initial migration `0000_silky_the_watchers.sql` generated and **applied to live Supabase** (verified: 8 tables, `relrowsecurity=true` on all, 5 enums, 3 checks present). DB client singleton `apps/api/src/db/index.ts` (first consumer of `src/config`). Seed helper inserts + reads back a sample run. **RLS** enabled on every table with **no policies** — locked-down/service-role-only until Auth (F8). Docs: `apps/api/docs/{database-schema,rls-policies}.md`.
- **F2 complete.** Frontend UI shell + TanStack Query, with a marketing **landing page** (`/`), **studio** create form (`/studio`), and **run progress** view (`/studio/[runId]`). Stack added: **shadcn/ui** (new-york, generated `components/ui/*`), **next-themes** dark/light/system toggle, **lucide-react**, `tw-animate-css`; `globals.css` reworked to an oklch token theme with a custom violet→fuchsia→cyan **brand** accent. Shared **DTO schemas** added (`packages/shared/src/dto.ts`: `Run`/`Asset`/`StepEvent`/`RunDetail`/`CreateRunInput`, reusing the F0 enums). **Backend mocked**: an in-memory run state machine (`apps/web/src/lib/mock/store.ts`) advanced on each poll, exposed as **server actions** (create/confirm/reject/cancel in `app/studio/actions.ts`) + a **route handler** poll target (`app/api/runs/[runId]/route.ts`) — same `RunDetail` contract as F3 so only the data layer swaps later. Create = structured form (dropzones w/ preview, segmented mode field with visible selection chips, prompt textarea). Progress = vertical **timeline/stepper** (per-step status badges, artifact cards w/ zoom dialog, confirm-bar gating in confirm mode, terminal video/error states), Framer Motion throughout + `prefers-reduced-motion`. Polling stops at terminal status and pauses at `awaiting_confirmation`. Placeholder artifacts in `public/mock/`. **Tooling fix:** Turbopack couldn't resolve the shared barrel's `./*.js` (TS-style) re-exports, so `packages/shared` internal re-exports are now extensionless and `apps/api/tsconfig.json` moved `NodeNext` → `module: ESNext` + `moduleResolution: Bundler` (the standard config for consuming a raw-TS workspace package); `apps/web/next.config.ts` adds `transpilePackages: ["@ugc/shared"]`. Verified: `pnpm --filter @ugc/shared|api typecheck`, `api` tsc emit, `web` lint + `next build` all green; landing/studio/route-handler render (200 / 404); full state machine exercised (automatic completes + skips `person_sheet` when no person image; confirm gates → reject regenerates → confirm advances; cancel → failed). Auth/real generation still deferred to later features.
- **F3 complete (API surface).** Hono backend built in `apps/api`: `app.ts` (CORS for `localhost:3000`, `/health`, mounts `/runs`, `onError`/`notFound` sinks) + slimmed `index.ts` (serve on `env.PORT`). Routes in `src/routes/runs.ts`: `POST /runs` (multipart via `c.req.parseBody()`; validates files — png/jpeg/webp, ≤10MB — and text via shared `createRunInputSchema`; auto-creates a `projects` row since `runs.projectId` is NOT NULL; uploads to Storage; inserts `assets`), `GET /runs/:id`, `GET /runs/:id/artifacts` (lean shape: sheets/video by asset kind + `videos` row, `numeric` durationSec coerced), `POST /runs/:id/{confirm,reject,cancel}`. Helpers: `lib/errors.ts` (`ApiError` + factories + single JSON error shape `{error,code?,details?}`), `lib/storage.ts` (service-role Supabase client, **public** `ugc-assets` bucket, `uploadAsset`/`getPublicUrl`, path `runs/{runId}/{kind}-{uuid}.{ext}`), `lib/mappers.ts` (sole DB→DTO exit; coalesces nullable→required, **never emits `storagePath`** or artifact-table internals), `lib/runs.ts` (`loadRunDetail`, `getRunOr404` w/ uuid pre-validation, `assertStatus`). Added `src/storage/setup.ts` + `storage:setup` script (idempotent bucket create). **Decisions:** public bucket (stable URLs, no re-signing); confirm/reject are strict (409 until F7 sets `awaiting_confirmation`); no worker/agents yet so created runs stay `queued`; cancel is idempotent. Verified live: typecheck green; server boots; 16 curl cases pass (create 201 + uploaded files publicly fetchable, GET 200, artifacts all-null for fresh run, confirm/reject 409 on queued, bad/missing uuid 404, missing-image 422, empty-prompt/bad-mode 400, unsupported-type 422, cancel→failed + idempotent, CORS preflight 204, automatic mode skips `person_upload`). **Frontend NOT yet wired** — still on the F2 mock; cutover is a follow-up after Postman validation. No agent/skill prompts written (those start at F4).
- **State/deps decision.** Removed `zustand` from `apps/web` — the app is server-state-heavy (the `runs` row is authoritative; `runId` is a route param), so there's no genuine cross-tree client state to justify a global store. Adopted **TanStack Query** (`@tanstack/react-query`) for all server state + polling; wired a client `<Providers>` (`apps/web/src/app/providers.tsx`) into the root layout. Form draft stays in local component state; React Context reserved for future cross-cutting concerns only. **Zod kept as-is** — enums are single-sourced in `packages/shared` (`z.enum`) and Drizzle `pgEnum`s derive values via `.options` (zero duplication); Zod earns its runtime keep at API-route + config validation, which Drizzle enums can't do. Dependency direction (`api` → `shared`, never reverse) means enums/DTOs must live in `shared`, so drizzle-as-source / `drizzle-zod` were rejected.
- **F5 complete (code; live-API verification pending).** Critic Agent built under `apps/api/src/agents/critic/`, mirroring the F4 skill convention (prompt module + function, provider injected via `SkillContext`). **Two skills**, each both a single-pass inspection and an inspect-and-remediate wrapper: **Product Sheet Inspection** (`product-inspection/{prompt,index}.ts`) and **StoryBoard Sheet Inspection** (`storyboard-inspection/{prompt,index}.ts`). Inspections attach the sheet as a **vision** image on `ctx.openai.chat` and `parseJsonObject` a strict `InspectionVerdict { pass, localizedRegen, issues[{severity,region,problem,fixHint}], summary }`. **Critic does NOT own run.status** (F7's job) — it returns a `CriticVerdict { outcome, attempts, finalArtifact, lastVerdict }` whose `outcome` (`approved` | `regenerated_approved` | `failed_retry_cap`) F7 reads. New plumbing: `types.ts` (verdict types), `constants.ts` (`CRITIC_RETRY_CAP = 1`), `events.ts` (`writeStepEvent` — first code to WRITE `step_events`; statuses limited to the CHECK set, diagnostics in `payload`), `status.ts` (`approve/rejectArtifact`: draft→approved|rejected), `remediate.ts` (generic inspect→regen→re-inspect engine), `localized.ts` (`regenerateProductViewsLocalized`). **Decisions (locked w/ user):** retry cap = **1** (regen only on issue, then at most once; still-failing → `failed_retry_cap`); inspections cover **product + storyboard only** (person sheets out of scope, `person-image/*` untouched); **localized partial regen = product sheet only** (re-edits the existing sheet via the `images.edit` path + a targeted "redraw only cell X" prompt, lands a new `draft` row; storyboard always full-regen). **Full regen** re-invokes the F4 producer skill steered by an additive optional `critique?` field threaded into `product-sheet`/`storyboard` inputs + prompts (backward-compatible; person-image untouched). **No worker** (F7) — invoked standalone via `agents/critic/verify.ts` (`pnpm --filter api critic:verify <runId> ["style"]`), which inspects the latest product + storyboard sheets of a run already populated by `agents:verify`, then dumps the run's `step_events`. **No schema/migration changes** (step_events CHECK, the two inspection steps, and `artifactStatusEnum` already existed). `pnpm --filter api typecheck` green. **Not yet run against live OpenAI vision** — verification of verdict quality + localized-edit fidelity pending.
- **F6 complete (code; live-API verification pending).** Video Generation Agent built under `apps/api/src/agents/video/`, mirroring the F4/F5 skill convention (prompt module + function, provider injected via `SkillContext`). **Provider boundary generalized**: shared `VideoProvider` interface + types now live in `providers/video.ts` (`submitVideo`/`pollVideo`, `SubmitVideoInput`/`VideoTask`/`VideoTaskResult`); `providers/ark/index.ts` is the **real** implementation (was a stub) and `ArkProvider` is kept as a back-compat alias. **Ark adapter** (Volcengine/BytePlus ModelArk, Seedance 2.0): `POST {ARK_BASE_URL}/api/v3/contents/generations/tasks` (Bearer `ARK_API_KEY`, body = `{model, content:[text, image_url], duration, resolution:"720p", ratio:"16:9", generate_audio:true}`) → `{id}`; polls `GET …/tasks/{id}` mapping `succeeded→completed`, `failed|cancelled|expired→failed`, else `processing`, reading `content.video_url`. **`generate_audio:true`** forces native synchronized audio (Seedance 2.0 dual-branch DiT). **RunComfy fallback adapter** (`providers/runcomfy/index.ts`) implements the same interface via the `runcomfy` CLI (selected by `VIDEO_PROVIDER=runcomfy`, needs `RUNCOMFY_TOKEN`); `createVideoProvider()` factory in `providers/index.ts` switches on env (default `ark`). **Skill: Video Builder** (`video/{prompt,index}.ts`) — LLM composes ONE cinematic motion/audio prompt from the storyboard `scenes` (`ctx.openai.chat`→`parseJsonObject` `{videoPrompt}`; identity stays in the image ref, text drives camera/motion/audio), submits the storyboard sheet URL + prompt, polls until terminal/timeout, downloads the mp4, and persists via the shared `persistSheet` (`kind:"final_video"`, `mime:"video/mp4"`) → `assets` + a `videos` row (`status:"completed"`, `hasAudio`, `durationSec`, `providerMeta:{provider,model,taskId,videoPrompt}`). Writes `step_events` `video: started→passed|failed`. **Persist relocated**: `persistSheet` moved from `image/persist.ts` to neutral `agents/persist.ts` (image re-exports it) so the video agent doesn't depend on the image agent. **Config** (`src/config`, `.env.example`): added `VIDEO_PROVIDER` (default `ark`), `ARK_BASE_URL` (default `https://ark.cn-beijing.volces.com`), `ARK_VIDEO_MODEL` (default `doubao-seedance-2-0-260128`), `ARK_POLL_INTERVAL_MS`/`ARK_POLL_TIMEOUT_MS`, optional `RUNCOMFY_TOKEN` — slug/endpoint env-configurable (SPEC open question). **`SkillContext` gains `video: VideoProvider`** (required); the F4/F5 verify scripts updated to inject it. **No worker** (F7) — invoked standalone via `agents/video/verify.ts` (`pnpm --filter api video:verify <runId> ["style"]`), which reads the latest storyboard sheet + scenes of a run already populated by `agents:verify`/`critic:verify`, generates + persists the video, and dumps the `videos` row + `step_events`. **Frontend already surfaces it** (no web changes): `run-progress.tsx` maps the `video` step → `final_video` asset and `artifact-card.tsx` renders `video/*` mime as `<video controls>`. **No schema/migration changes** (`videos`, `final_video` kind, `video` step pre-existed). `pnpm --filter api typecheck` green; provider factory smoke-loads. **Not yet run against live Ark** — exact slug/region for the user's account + audio/duration fidelity pending (`video:verify`).
- **F7 complete (code; live end-to-end pending).** Creative Direction Agent (orchestrator) + in-process background worker built under `apps/api/src/agents/creative-direction/`, mirroring the F4/F5/F6 skill convention (provider injected via `SkillContext`). **Two parts:** (1) **CDA style skill** `interpret-style/{prompt,index.ts}` — one `ctx.openai.chat` call distils the raw prompt into a concise, style-AGNOSTIC `adStyle` brief (`parseJsonObject<{adStyle}>`, fallback `"clean, neutral commercial"`), run once when a run leaves `queued` and persisted to `runs.adStyle`, then threaded into every downstream skill via `ctx.adStyle`. (2) **State machine** `orchestrator.ts` (`driveRun(runId)`) + **worker** `worker.ts` (`startWorker()`). **Pipeline** (fixed, deterministic in `plan.ts`): `product_sheet → [person_sheet if no person uploaded] → product_inspection → [gate] → storyboard → storyboard_inspection → [gate] → video → completed`. **State convention (the crux):** `runs.currentStep` = the LAST step that completed; `status` drives the worker — `queued`→interpret style; `running`→execute `nextStep(currentStep, personUploaded)`; `regenerating`→re-run `genStepForGate(currentStep)` (full-stage regen); `awaiting_confirmation`/`completed`/`failed`→terminal for the driver. This convention makes the **existing confirm/reject/cancel routes correct with NO changes**: confirm flips `awaiting_confirmation→running` (driver advances via `nextStep`), reject flips `→regenerating` (driver re-runs the rejected stage). **Gating** (confirm mode only, per SPEC mermaid): pause after each _validated_ stage — after `product_inspection` and after `storyboard_inspection`; automatic mode never gates; **Critic auto-checks run in BOTH modes**. **Critic outcome handling:** `approved`/`regenerated_approved`→advance/gate; `failed_retry_cap`→run `failed`. **Resumability:** every step persists `currentStep`/`status` before the next, and each step reloads inputs from the DB (`inputs.ts` consolidates the latest-sheet/upload joins copy-pasted across the three `verify.ts`), so a crash/restart reclaims `running`/`regenerating` runs and resumes from `currentStep`. **Cancel** sets `failed` mid-flight; the driver re-reads status each loop iteration and after each step (`isTerminated`) so it aborts at the next step boundary without clobbering the cancel. **Step events:** orchestrator writes `started`/`passed` for generation steps (`product_sheet`/`person_sheet`/`storyboard`); critic + video skills write their own. **Worker:** recursive-`setTimeout` poll (`WORKER_POLL_INTERVAL_MS`, default 1500ms) selecting `status IN (queued,running,regenerating)` via `runs_status_idx`, single-flight per `runId` (in-flight `Set`), parallel across runs; gated by `WORKER_ENABLED` (default true) — started after `serve()` in `index.ts`. **Plumbing:** `writeStepEvent` moved from `agents/critic/events.ts` to neutral `agents/events.ts` (critic re-exports for back-compat, no critic edits); config adds `WORKER_ENABLED`/`WORKER_POLL_INTERVAL_MS` (+ `.env.example`). **No schema/migration changes** (all enums, `runs.adStyle`, `runs_status_idx` pre-existed). Standalone driver `agents/creative-direction/verify.ts` (`pnpm --filter api cda:verify <runId>`) advances one run to its next stop without the loop. `pnpm --filter api typecheck` + `build` green; module graph smoke-loads, step sequencing/gating/`genForGate` verified, worker honors `WORKER_ENABLED=false`. **Not yet run live** — first full F7 run is also the first live OpenAI/Ark end-to-end exercise (F4/F5/F6 were code-only); budget for provider-slug/latency surprises.
- **F4 complete (code; live-API verification pending).** Image Generation Agent + 3 skills built under `apps/api/src/agents/`. **Agent/skill convention** (now documented in §4 "Agent/Skill code layout"): each skill = `prompt.ts` (prompt module) + `index.ts` (function `(ctx: SkillContext, input) => SkillResult<T>`); the OpenAI adapter is **injected via `SkillContext`**, never imported in a skill. **OpenAI provider** (`providers/openai/index.ts`) stub filled in — interface unchanged: `chat()` via Chat Completions (vision-ready: `ChatMessage.images` → `image_url` parts, reused by F5), `generateImage()` branches `images.generate` (no refs) vs `images.edit` (refs → `toFile`, reference path for product→sheet); model ids isolated in `providers/openai/constants.ts` (`OPENAI_CHAT_MODEL=gpt-4.1`, `OPENAI_IMAGE_MODEL=gpt-image-1` as the GPT-Image-2 stand-in, `DEFAULT_IMAGE_SIZE=1536x1024`). Skills: **Product Sheet Builder** (edit path w/ product upload ref → `product_reference_sheets`), **Generate Person Image** (caller-gated to no-person-uploaded; refs the product sheet → `person_reference_sheets`), **StoryBoard Generator** (refs product + optional person sheet → `storyboard_sheets`, scenes tagged with `adStyle`). All sheets are **single composite images** (SPEC working assumption). Shared `image/persist.ts` (upload → `assets` row → artifact row in one `db.transaction`) and `agents/json.ts` (`parseJsonObject` strips ```json fences). `adStyle`threaded opaque via`ctx`(interpretation is F7's job). **No worker wiring** (F7) — skills invoked by`agents/image/verify.ts` (`pnpm --filter api agents:verify <runId> ["style"]`, hits live OpenAI). `pnpm --filter api typecheck`green; added`openai@^6.39.1`. **Not yet run against the live OpenAI image API** — flagged open: exact GPT-Image-2 slug, `images.edit`multi-reference support (storyboard passes 2 refs), composite-sheet layout/label quality (fallback: per-view gen +`sharp` stitch).
