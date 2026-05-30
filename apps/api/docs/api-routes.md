# API Routes

Authoritative reference for the UGC video-system HTTP API (Hono). Source of truth is `apps/api/src/routes/runs.ts`, mounted by `apps/api/src/app.ts`. This doc explains what each route is **for**, its request shape, and its response shape.

> **Base URL:** `http://localhost:3001` in dev (port from `env.PORT`, default `3001`).
>
> **Conventions:**
> - All responses are JSON. Timestamps are ISO 8601 strings. IDs are UUIDs.
> - Response bodies for runs use the shared DTO shapes in `packages/shared/src/dto.ts` (`RunDetail`, `Asset`, `StepEvent`). The frontend consumes these unchanged.
> - **Internal fields never leave the API.** `assets.storage_path` and the artifact-table internals (`prompt_used`, `views`, `scenes`, `provider_meta`) are stripped by the mappers in `apps/api/src/lib/mappers.ts`.
> - Validation is done with the shared Zod schemas. Errors use one shape (see [Error model](#error-model)).
> - CORS allows origin `http://localhost:3000`, methods `GET`/`POST`/`OPTIONS`, header `Content-Type`.

## State of the build (F3)

F3 ships the **API surface only**. There is **no background worker and no agents yet** (those are F4–F7). Consequences:

- A created run sits at `status: "queued"` and does not advance on its own.
- `GET /runs/:id/artifacts` returns all-`null` until the image/video agents land (F4–F6).
- `confirm` / `reject` are wired per spec but only legal from `awaiting_confirmation`. Nothing sets that status until the F7 worker, so today they return **409**. This is expected, not a bug.
- `cancel` works from any non-terminal status.

---

## Route summary

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/health` | Liveness check | `200` |
| `POST` | `/runs` | Create a run from uploaded images + prompt + mode | `201` |
| `GET` | `/runs/:id` | Poll a run's full state (status, assets, audit trail) | `200` |
| `GET` | `/runs/:id/artifacts` | Fetch generated sheets + final video for a run | `200` |
| `POST` | `/runs/:id/confirm` | Confirm-mode gating: approve the current step | `200` |
| `POST` | `/runs/:id/reject` | Confirm-mode gating: reject → regenerate current step | `200` |
| `POST` | `/runs/:id/cancel` | Terminate a run | `200` |

---

## `GET /health`

**For:** quick liveness probe (uptime checks, "is the API up?").

- **Request:** none.
- **Response `200`:** `{ "ok": true }`

---

## `POST /runs`

**For:** the entry point of the whole pipeline. Accepts the product image (required), an optional person image, the text prompt, and the run mode. Uploads the images to Supabase Storage, creates the owning `project` + the `run` row, records the uploads as `assets`, and returns the new run. The run is enqueued at `status: "queued"` for the worker (F7) to pick up.

- **Content-Type:** `multipart/form-data`
- **Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `prompt` | text | yes | 1–2000 chars (trimmed). May include the desired ad style. |
| `mode` | text | yes | `automatic` or `confirm`. |
| `productImage` | file | yes | `image/png`, `image/jpeg`, or `image/webp`, ≤ 10 MB. |
| `personImage` | file | no | Same constraints. Omit to let F4 generate one. |

- **What it does:**
  1. Validates the files (presence, MIME allow-list, size) and the text fields (shared `createRunInputSchema`; `hasPersonImage` is derived from whether a person file was sent).
  2. Inserts a `projects` row (`title` = first 80 chars of the prompt) — required because `runs.project_id` is `NOT NULL`.
  3. Inserts the `runs` row (`status: "queued"`).
  4. Uploads each image to the public `ugc-assets` bucket under `runs/{runId}/{kind}-{uuid}.{ext}` and inserts an `assets` row (`kind` = `product_upload` / `person_upload`) with the public URL.

- **Response `201`:** a `RunDetail`:

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "prompt": "Luxury cinematic ad for a premium watch",
  "adStyle": "",
  "mode": "automatic",
  "status": "queued",
  "currentStep": "product_sheet",
  "error": null,
  "createdAt": "2026-05-30T14:15:16.508Z",
  "updatedAt": "2026-05-30T14:15:16.508Z",
  "assets": [
    {
      "id": "uuid",
      "runId": "uuid",
      "kind": "product_upload",
      "url": "https://<project>.supabase.co/storage/v1/object/public/ugc-assets/runs/<runId>/product_upload-<uuid>.png",
      "mime": "image/png",
      "meta": null,
      "createdAt": "2026-05-30T14:15:18.133Z"
    }
  ],
  "stepEvents": []
}
```

> `adStyle` is `""` and `currentStep` is `product_sheet` here because no agent has set real values yet — these are mapper defaults, not stored values.

- **Errors:**

| Status | When |
|---|---|
| `422` | No product image, or an image has an unsupported type / exceeds 10 MB. |
| `400` | `prompt` empty/too long, or `mode` not one of `automatic`/`confirm`. |

---

## `GET /runs/:id`

**For:** the frontend poll target. Returns the run's authoritative state — status, current step, every asset, and the full `step_events` audit trail — so a page refresh never loses progress.

- **Request:** path param `id` (run UUID).
- **Response `200`:** a `RunDetail` (same shape as `POST /runs`, with all accumulated `assets` and `stepEvents`).
- **Errors:** `404` `{ "error": "Run not found" }` if the id is unknown **or malformed** (a bad UUID is treated as not-found).

---

## `GET /runs/:id/artifacts`

**For:** fetching the **generated outputs** of a run (the reference/storyboard sheets and the final video), separate from the raw uploads. Lean, purpose-built shape — not a frozen DTO.

- **Request:** path param `id` (run UUID).
- **Response `200`:**

```json
{
  "runId": "uuid",
  "productSheet": null,
  "personSheet": null,
  "storyboardSheet": null,
  "finalVideo": null,
  "video": null
}
```

- Each `*Sheet` / `finalVideo` field is an `Asset` (of the matching `kind`) once generated, else `null`.
- `video` is `{ "durationSec": number | null, "hasAudio": boolean }` from the `videos` table once present, else `null`. (`duration_sec` is stored as `numeric`; it is coerced to a JS number here.)
- All-`null` is the correct response for a fresh/queued run — generation lands in F4–F6.
- **Errors:** `404` if the run doesn't exist.

---

## `POST /runs/:id/confirm`

**For:** confirm-mode gating. When a run is paused at `awaiting_confirmation` after a step's artifact is produced, the user approves it to let the pipeline advance.

- **Request:** path param `id`. No body.
- **What it does:** requires `status: "awaiting_confirmation"`; records a `passed` `step_event` and sets `status: "running"`.
- **Response `200`:** the updated `RunDetail`.
- **Errors:** `409` `{ "error": "Run is not awaiting confirmation.", "code": "CONFLICT" }` from any other status. **Until F7 every run returns 409 here** (nothing sets `awaiting_confirmation` yet).

---

## `POST /runs/:id/reject`

**For:** confirm-mode gating. The user rejects the current step's artifact, sending it back for regeneration.

- **Request:** path param `id`. No body.
- **What it does:** requires `status: "awaiting_confirmation"`; records a `regenerated` `step_event` and sets `status: "regenerating"`.
- **Response `200`:** the updated `RunDetail`.
- **Errors:** `409` (same as `confirm`) from any other status. Same F7 caveat.

---

## `POST /runs/:id/cancel`

**For:** terminating a run (user hits cancel). Works from any non-terminal status and is idempotent.

- **Request:** path param `id`. No body.
- **What it does:** if the run is not already `completed`/`failed`, sets `status: "failed"` and `error: "Run cancelled."`. Already-terminal runs are returned unchanged.
- **Response `200`:** the updated `RunDetail` (`status: "failed"`, `error: "Run cancelled."`). Calling again returns the same body.
- **Errors:** `404` if the run doesn't exist.

---

## Error model

Every error is JSON from a single handler (`onError` in `apps/api/src/lib/errors.ts`):

```json
{ "error": "human-readable message", "code": "CONFLICT", "details": [ ] }
```

- `error` — always present. The frontend keys on this string.
- `code` — present on `ApiError`s: `BAD_REQUEST` (400), `NOT_FOUND` (404), `CONFLICT` (409), `UNPROCESSABLE` (422), `INTERNAL` (500).
- `details` — optional; carries Zod issues on validation failures.
- Unknown routes return `404` `{ "error": "Not found" }`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid text input (prompt/mode), with Zod `details`. |
| 404 | `NOT_FOUND` | Run id unknown or malformed UUID. |
| 409 | `CONFLICT` | Illegal state transition (e.g. confirm/reject when not awaiting). |
| 422 | `UNPROCESSABLE` | File missing / wrong type / too large. |
| 500 | `INTERNAL` | Unexpected server error (also covers storage upload failures). |

---

## Storage

Images and generated files live in the **public** Supabase Storage bucket `ugc-assets` (created via `pnpm --filter api storage:setup`). Object path convention: `runs/{runId}/{kind}-{uuid}.{ext}`. `assets.url` holds the stable public URL; `assets.storage_path` is the internal handle and is never returned by the API. Helpers in `apps/api/src/lib/storage.ts`.
