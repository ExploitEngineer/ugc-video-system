# Database Schema

Authoritative reference for the UGC video-system Postgres database (Supabase). Source of truth is `apps/api/src/db/schema.ts` (Drizzle); the SQL lives in `apps/api/src/db/migrations/`. This doc explains what each table is **for** and lists every column with its keys and constraints.

> Conventions: all PKs are `uuid` defaulting to `gen_random_uuid()`. Column names are `snake_case` in the DB (camelCase in the Drizzle/TS layer). Timestamps are `timestamptz` defaulting to `now()`. Every foreign key is `ON DELETE CASCADE` and indexed.

## Model at a glance

```
projects (1) ──< runs (1) ──< assets
                      │  └──────────────┐ (asset_id)
                      ├──< step_events  │
                      ├──< product_reference_sheets ──┤
                      ├──< person_reference_sheets  ──┤
                      ├──< storyboard_sheets        ──┤
                      └──< videos                   ──┘
```

A **project** owns **runs**. Each **run** is one generation job and the authoritative state machine. A run produces **assets** (uploaded + generated files in Supabase Storage) and emits **step_events** (audit trail). The four artifact tables hold the structured output of each pipeline step and each point at the **asset** that stores their rendered file.

## Enums (native Postgres types)

Values are sourced from the shared Zod enums in `packages/shared/src/enums.ts` so the DB and app never drift.

| Enum | Values | Used by |
|---|---|---|
| `run_status` | `queued`, `running`, `awaiting_confirmation`, `regenerating`, `completed`, `failed` | `runs.status` |
| `step` | `product_sheet`, `person_sheet`, `product_inspection`, `storyboard`, `storyboard_inspection`, `video` | `runs.current_step`, `step_events.step` |
| `asset_kind` | `product_upload`, `person_upload`, `product_sheet`, `person_sheet`, `storyboard_sheet`, `final_video` | `assets.kind` |
| `mode` | `automatic`, `confirm` | `runs.mode` |
| `artifact_status` | `draft`, `approved`, `rejected` | sheet tables `.status` |

Two status fields stay `text` + CHECK rather than enum because they are step-/provider-lifecycle values, not domain enums:
- `step_events.status` ∈ `started`, `passed`, `failed`, `regenerated`
- `videos.status` ∈ `processing`, `completed`, `failed`

---

## Core tables

### `projects`
A user's workspace for ad-video generation.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `owner_id` | uuid | yes | — | null until Auth (F8) |
| `title` | text | no | — | |
| `created_at` | timestamptz | no | `now()` | |

### `runs`
One generation job. The row is the authoritative state machine — a page refresh never loses progress.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `project_id` | uuid | no | — | **FK** → `projects.id` (cascade), indexed |
| `prompt` | text | no | — | raw user prompt |
| `ad_style` | text | yes | — | interpreted style propagated to agents |
| `mode` | `mode` | no | — | |
| `status` | `run_status` | no | `queued` | indexed (worker polls by status) |
| `current_step` | `step` | yes | — | |
| `error` | text | yes | — | |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:** `runs_project_id_idx`, `runs_status_idx`.

### `assets`
Every stored file — uploads and generated artifacts — backed by Supabase Storage. DB row holds the object path + URL.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id` (cascade), indexed |
| `kind` | `asset_kind` | no | — | |
| `storage_path` | text | no | — | Supabase Storage object path |
| `url` | text | yes | — | public or signed URL |
| `mime` | text | yes | — | |
| `meta` | jsonb | yes | — | width/height/duration/provider info |
| `created_at` | timestamptz | no | `now()` | |

### `step_events`
Append-only audit trail of pipeline progress — drives the frontend timeline.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id` (cascade), indexed |
| `step` | `step` | no | — | |
| `status` | text | no | — | **CK** `step_events_status_check`: in (`started`,`passed`,`failed`,`regenerated`) |
| `payload` | jsonb | yes | — | Critic diagnostics, prompts used, decisions |
| `created_at` | timestamptz | no | `now()` | |

---

## Artifact tables

Each holds the structured output of one pipeline step. Every row has a `run_id` (which job) and an `asset_id` (the rendered file in `assets`), both FK + indexed + cascade.

### `product_reference_sheets`
4 product views composited into one reference sheet.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id`, indexed |
| `asset_id` | uuid | no | — | **FK** → `assets.id`, indexed |
| `views` | jsonb | yes | — | `{ front, threeQuarter, side, rear }` |
| `prompt_used` | text | yes | — | final GPT Image 2 prompt |
| `status` | `artifact_status` | no | `draft` | |

### `person_reference_sheets`
Person reference sheet — only created when no person image is uploaded.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id`, indexed |
| `asset_id` | uuid | no | — | **FK** → `assets.id`, indexed |
| `views` | jsonb | yes | — | multiple view descriptors |
| `person_details` | jsonb | yes | — | `{ demographics, costumeStyle, colorReference }` |
| `prompt_used` | text | yes | — | |
| `status` | `artifact_status` | no | `draft` | |

### `storyboard_sheets`
Ordered storyboard scenes in the chosen ad style.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id`, indexed |
| `asset_id` | uuid | no | — | **FK** → `assets.id`, indexed |
| `scenes` | jsonb | yes | — | `[{ index, cameraAngle, actionMovement, sceneDescription, adStyle }]` |
| `prompt_used` | text | yes | — | |
| `status` | `artifact_status` | no | `draft` | |

### `videos`
The single ~15s final clip with native Seedance audio. No merge step, one video per run.

| Column | Type | Null | Default | Key / Constraint |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | **PK** |
| `run_id` | uuid | no | — | **FK** → `runs.id`, indexed |
| `asset_id` | uuid | no | — | **FK** → `assets.id`, indexed |
| `duration_sec` | numeric | yes | — | **CK** `videos_duration_sec_check`: `> 0` |
| `has_audio` | boolean | no | `true` | native Seedance audio |
| `provider_meta` | jsonb | yes | — | Ark task id, model slug, params |
| `status` | text | no | `processing` | **CK** `videos_status_check`: in (`processing`,`completed`,`failed`) |

---

## Constraint summary

- **Primary keys:** `id` on all 8 tables.
- **Foreign keys (all `ON DELETE CASCADE`):** `runs.project_id` → `projects`; `assets.run_id`, `step_events.run_id`, and `run_id` on all 4 artifact tables → `runs`; `asset_id` on all 4 artifact tables → `assets`.
- **Check constraints:** `step_events_status_check`, `videos_status_check`, `videos_duration_sec_check`.
- **Indexes:** every FK column, plus `runs.status`.

## Working with the schema

```bash
pnpm --filter api db:generate   # diff schema.ts → new SQL migration
pnpm --filter api db:migrate    # apply migrations to DATABASE_URL
pnpm --filter api db:push       # push schema directly (prototyping, no migration file)
pnpm --filter api db:seed       # insert + read back a sample run
pnpm --filter api db:studio     # Drizzle Studio
```

RLS posture is documented separately in [`rls-policies.md`](./rls-policies.md).
