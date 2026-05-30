# AI Product Ad Video Generator — SPEC

> Living architecture document **and** progress tracker. Update the `- [ ]` checklists and the **Progress Log** as we build. Tick items off as they land.

---

## 1. Overview

Turns a **product image** (required) + an **optional person image** + a **text prompt** into a finished **~15-second advertisement video with audio**. The ad can be **any style** the user asks for — UGC, inspirational, cinematic, minimalist, luxury, comedic, etc. Agents read the user's intent and adapt; nothing assumes UGC.

Pipeline: **images → storyboard → video**, driven by cooperating AI agents that each carry their own skills and prompts. A Creative Direction Agent orchestrates the whole flow and propagates the requested ad style to every downstream agent. A Critic Agent validates artifacts and triggers regeneration. The final step sends the **full storyboard sheet** to Seedance 2.0, which produces **one** video with audio — there is no per-scene video building, no separate audio step, and no merge step.

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
| **Video Generation Agent**                  | **fal.ai — Seedance 2.0**                                           | `Video Builder`                                                                                                                                                                        |

#### Skill detail

- **Product Sheet Builder** — decides the ad framework/hook from the product **and** the user's requested style, builds the final image prompt, calls GPT Image 2 → **Product Reference Sheet** (front, three-quarter, side, rear).
- **Generate Person Image** — **only** when no person image was uploaded. Defines the kind of person + how they fit the product/ad style, then generates the **Person Reference Sheet**.
- **StoryBoard Generator** — takes the product sheet (+ person sheet if present) → **Storyboard/Keyframe Sheet** of scenes, each with camera/angle, action/movement, scene description, consistent with the ad style.
- **Product Sheet Inspection** — validates the product sheet; regenerates the whole sheet, or **only the localized part**, when the problem is local.
- **StoryBoard Sheet Inspection** — validates the storyboard sheet; regenerates if problems.
- **Video Builder** — sends the **full storyboard sheet** to Seedance 2.0 → final ~15s video with audio. Final output; no merge.

### End-to-end flow

```mermaid
flowchart TD
    A["Input: product image (+ optional person image)<br/>+ prompt (may include ad style) + mode"] --> CDA{{Creative Direction Agent<br/>orchestrates + propagates ad style}}
    CDA --> B["Image Agent · Product Sheet Builder<br/>→ GPT Image 2"]
    B --> PRS[(Product Reference Sheet)]
    PRS --> C{Person image<br/>uploaded?}
    C -- No --> D["Image Agent · Generate Person Image<br/>→ GPT Image 2"]
    D --> PERS[(Person Reference Sheet)]
    C -- Yes --> E
    PERS --> E["Critic Agent · Product Sheet Inspection"]
    E -- issues --> B
    E -- ok --> F["Image Agent · StoryBoard Generator<br/>→ GPT Image 2"]
    F --> SBS[(Storyboard Sheet)]
    SBS --> G["Critic Agent · StoryBoard Sheet Inspection"]
    G -- issues --> F
    G -- ok --> H["Video Agent · Video Builder<br/>→ fal.ai Seedance 2.0"]
    H --> VID[(Final ~15s video w/ audio)]

    CDA -. confirm-every-step gating .-> B
    CDA -. confirm-every-step gating .-> F
    CDA -. confirm-every-step gating .-> H
```

> Mode controls only the **gating** (the dotted lines): in `confirm` the run pauses at `awaiting_confirmation` after each step. Auto-checks (Critic) run in **both** modes.

### Execution model

- **Background worker + polling.** A Hono route enqueues a `run`; a background worker loop advances it step-by-step. The frontend polls a status endpoint. The `runs` row is the authoritative state machine, so a refresh never loses progress.
- **Assumption:** worker is an in-process loop in `apps/api` for F0–F7; revisit a dedicated queue (e.g. pg-boss) if scaling demands it.

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

Single ~15s clip with audio from Seedance 2.0. No merge.

| Field        | Type                             | Notes                                 |
| ------------ | -------------------------------- | ------------------------------------- |
| id           | uuid PK                          |                                       |
| runId        | uuid FK                          |                                       |
| assetId      | uuid FK → assets (`final_video`) |                                       |
| durationSec  | numeric                          | ~15                                   |
| hasAudio     | boolean                          | true (native Seedance audio)          |
| providerMeta | jsonb                            | fal.ai job id, model slug, params     |
| status       | text                             | `processing` / `completed` / `failed` |

---

## 6. External Integrations

| Service      | Used for                                                                               | Client                                       | Key (env)                                                                        |
| ------------ | -------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| **OpenAI**   | GPT Image 2 (all image artifacts) **and** agent LLM reasoning/prompt-building/critique | `openai` SDK                                 | `OPENAI_API_KEY`                                                                 |
| **fal.ai**   | Seedance 2.0 video (full storyboard sheet → ~15s video w/ audio)                       | `@fal-ai/client`                             | `FAL_KEY`                                                                        |
| **Supabase** | Postgres DB (via Drizzle) + Storage + Auth (F8)                                        | `@supabase/supabase-js` + `postgres`/Drizzle | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |

**Config location:** env loaded + Zod-validated in `apps/api/src/config` (server secrets) and `apps/web` env (public-safe vars only). Provider calls live behind a thin **adapter boundary** (`apps/api/src/providers/{openai,fal}`) so the concrete model/provider is swappable without touching agent logic.

**Invocation shape:**

- GPT Image 2 — Image Agent builds a prompt (via LLM skill) → image generation call → store composite sheet to Supabase Storage → row in `assets` + artifact table.
- Seedance 2.0 — Video Builder submits the full storyboard sheet (image + text) as a fal.ai job, polls fal until complete, downloads the ~15s video to Supabase Storage.

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
- Exact fal.ai **Seedance 2.0 model slug**, whether it accepts the storyboard as a single image + text prompt, and confirmation of **native audio** output.
- Agent runtime: OpenAI Responses/Chat + tool-calling vs Assistants API; how "skills" map to code. **Assumption:** each skill = a prompt module + a function, orchestrated in code by the Creative Direction Agent.
- Worker host: in-process loop vs separate queue process (pg-boss/BullMQ). **Assumption:** in-process loop in `apps/api` through F7.
- Regeneration **retry caps / cost guards** — max auto-regens per step before failing the run.
- Storage **bucket layout, signed-URL strategy, retention** policy.
- Whether projects are reusable across many runs or 1 run = 1 project in the MVP. **Assumption:** project can hold multiple runs; UI starts with one run per project.

**Assumptions** (recorded above inline) — all marked **Assumption:** are working defaults, revisit as needed.

---

# Features (build order — progress tracker)

> Tick `- [ ]` → `- [x]` as items complete. Keep this section authoritative.

## F0 — Project scaffolding & config

**Goal:** add all missing deps and a validated config/secret layer on top of the existing monorepo.

- [x] Add deps: `zod` (shared + api), `drizzle-orm` + `drizzle-kit` + `postgres` (api), `@supabase/supabase-js` (api), `zustand` + `framer-motion` (web)
- [x] Per-app env files: `apps/api/.env(.example)` holds server secrets (`OPENAI_API_KEY`, `FAL_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`); `apps/web/.env.local(.example)` holds public-only `NEXT_PUBLIC_*` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Real files gitignored, `.example` pushed.
- [ ] `apps/api/src/config` — load + Zod-validate server env (fail fast on missing secrets)
- [ ] `apps/web` public env handling (only `NEXT_PUBLIC_*` exposed)
- [ ] Shared enums/types (run status, step, asset kind, mode) in `packages/shared` as Zod schemas + inferred types
- [ ] Provider adapter stubs: `apps/api/src/providers/{openai,fal}` interfaces
- [ ] Confirm `pnpm dev`, `typecheck`, `lint` still green

## F1 — Database schema design

**Goal:** Drizzle schema over Supabase Postgres + migrations for all tables/artifacts.

- [ ] Drizzle schema: `projects`, `runs`, `assets`, `step_events`
- [ ] Drizzle schema: `product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`, `videos`
- [ ] Enums: run status, step, asset kind, mode, artifact status
- [ ] `drizzle.config.ts` pointed at `DATABASE_URL`
- [ ] Generate + apply initial migration to Supabase
- [ ] DB client singleton in `apps/api/src/db`
- [ ] Seed/test helper for a sample run

## F2 — Frontend UI shell + Zustand

**Goal:** input + progress UI; no real generation yet (mock the API).

- [ ] Upload product image (required) + optional person image, with preview
- [ ] Prompt textarea (style hint allowed)
- [ ] Mode toggle: Automatic / Confirm-every-step
- [ ] Create button → calls create-run API
- [ ] Results/progress view: per-step status, artifact previews, confirm/reject buttons (confirm mode)
- [ ] Zustand stores: input draft + active run/polling state
- [ ] Framer Motion transitions between steps/states
- [ ] Apply `frontend-design`, `tailwindcss`, `framer-motion` skills for the UI

## F3 — Backend API (Hono) + Zod

**Goal:** routes to create runs, poll status, fetch artifacts, and gate steps.

- [ ] `POST /runs` — create run (multipart: images + prompt + mode), upload images to Supabase Storage, insert rows, enqueue
- [ ] `GET /runs/:id` — status + currentStep + step_events
- [ ] `GET /runs/:id/artifacts` — sheets + video URLs
- [ ] `POST /runs/:id/confirm` and `POST /runs/:id/reject` — confirm-mode gating
- [ ] Zod validation on every route (shared schemas)
- [ ] Supabase Storage upload/download helpers + signed URLs
- [ ] Error handling + consistent JSON error shape

## F4 — Image Generation Agent + skills (GPT Image 2)

**Goal:** produce product sheet, optional person sheet, storyboard sheet.

- [ ] OpenAI provider adapter (LLM + GPT Image 2 image gen)
- [ ] Skill: **Product Sheet Builder** — style/hook reasoning → prompt → GPT Image 2 → Product Reference Sheet (4 views)
- [ ] Skill: **Generate Person Image** — only when no person uploaded → Person Reference Sheet (+ personDetails)
- [ ] Skill: **StoryBoard Generator** — product (+person) sheet → Storyboard Sheet (scenes)
- [ ] Persist artifacts to Storage + artifact tables + `assets`
- [ ] Each skill = prompt module + function; ad style threaded through

## F5 — Critic Agent + skills

**Goal:** validate artifacts and regenerate (full or partial) on issues, in both modes.

- [ ] Skill: **Product Sheet Inspection** — vision validation; full regen
- [ ] Product Sheet Inspection — **localized partial regen** when the problem is local
- [ ] Skill: **StoryBoard Sheet Inspection** — validate scenes; regenerate on problems
- [ ] Write `step_events` diagnostics for each inspection
- [ ] Retry cap / cost guard before failing a run

## F6 — Video Generation Agent + Video Builder (Seedance 2.0)

**Goal:** storyboard sheet → single ~15s video with audio. No merge.

- [ ] fal.ai provider adapter (submit + poll Seedance 2.0)
- [ ] Skill: **Video Builder** — send full storyboard sheet → ~15s video w/ audio
- [ ] Download result to Supabase Storage; insert `videos` + `assets`
- [ ] Surface final video in results view

## F7 — Creative Direction Agent orchestration + modes

**Goal:** the orchestrator + background worker that runs the whole state machine for both modes.

- [ ] Creative Direction Agent: workflow logic, agent sequencing, ad-style interpretation + propagation
- [ ] Background worker loop polling `runs` and advancing steps
- [ ] Automatic mode: end-to-end, no gating
- [ ] Confirm mode: pause at `awaiting_confirmation`, resume on confirm/reject
- [ ] Full state-machine transitions incl. regeneration + failure
- [ ] End-to-end run verified with both modes

## F8 — Auth (Supabase) + hardening + cleanup

**Goal:** attach ownership, secure access, final polish. **Deferred to last.**

- [ ] Supabase Auth (sign-in)
- [ ] Set `projects.ownerId`; scope runs/artifacts to the user
- [ ] Row-Level Security policies
- [ ] Secret review + rate limiting + input hardening
- [ ] Cleanup, error states, retention policy for assets

---

## Progress Log

### 2026-05-30

- SPEC.md created — architecture, data model, integrations (OpenAI + fal.ai + Supabase), mode behavior, and feature checklists F0–F8 captured. No application code yet.
