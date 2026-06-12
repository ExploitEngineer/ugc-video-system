# API reference

Base URL: `http://localhost:3001` (override with `PORT`). The web app talks to the API two ways:
Server Actions (`apps/web/src/app/studio/actions.ts`) call it directly server-side; the browser's
polling reads go through Next Route Handlers under `apps/web/src/app/api/*` that proxy to these
endpoints.

All responses pass through `apps/api/src/lib/mappers.ts`, so the client only ever sees the
`@ugc/shared` DTO shapes below (internal columns like `storagePath` are stripped). Request bodies
are Zod-validated with the shared schemas. CORS allowed origins come from `CORS_ORIGIN`.

## Endpoints

### `GET /health`
Liveness probe. → `200 { "ok": true }`

### `POST /runs`
Create + enqueue a run. **`multipart/form-data`** (not JSON):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `productImage` | File | ✅ | PNG/JPEG/WebP, ≤ 10 MB |
| `personImage` | File | — | Same constraints; if omitted, the pipeline generates a person sheet |
| `prompt` | text | ✅ | 1–2000 chars |
| `mode` | text | ✅ | `automatic` \| `confirm` |
| `criticEnabled` | text | — | `"false"` disables the critic; any other value (or absent) = enabled |

→ `201 RunDetail` (status `queued`). Auto-creates a `project` to own the run, uploads images to
Storage, records `assets`. On upload failure the run is marked `failed`.
Errors: `422 UNPROCESSABLE` (bad/oversized image), `400 BAD_REQUEST` (invalid fields).

### `GET /runs`
List all runs, newest first (sidebar history). → `200 Run[]`

### `GET /runs/:id`
The poll target — full run state + assets + audit trail. → `200 RunDetail`. `404` if unknown.

### `GET /runs/:id/artifacts`
Lean generated-outputs shape. → `200`:
```jsonc
{
  "runId": "…",
  "productSheet":     Asset | null,
  "personSheet":      Asset | null,
  "storyboardSheet":  Asset | null,   // 15s only (null for multi-segment)
  "storyboardMaster": Asset | null,   // multi-segment N×4 master sheet
  "finalVideo":       Asset | null,   // merged clip for multi-segment
  "video": { "durationSec": number | null, "hasAudio": boolean } | null,
  "segmentStoryboards": { "segmentIndex": number, "asset": Asset|null }[],              // multi-segment
  "segmentVideos":      { "segmentIndex": number, "asset": Asset|null, "durationSec": number|null }[]  // multi-segment
}
```
`404` if the run doesn't exist. (Generation outputs only — the editor's `edited_video`/`editor_scene`
are not here; they surface in `RunDetail.assets[]` via `GET /runs/:id`.)

### `POST /runs/:id/confirm`
Confirm-mode gate: approve the current step. Requires `status = awaiting_confirmation` (else
`409 CONFLICT`). Sets `running`, records a `passed` step_event. → `200 RunDetail`.

### `POST /runs/:id/reject`
Confirm-mode gate: regenerate the current step. Requires `awaiting_confirmation`. Sets
`regenerating`, records a `regenerated` step_event. → `200 RunDetail`.

### `POST /runs/:id/feedback`
Step-by-step free-text gate. Body `{ "message": string }` (1–2000 chars). Requires
`awaiting_confirmation` and that the current step is a gate (else `400`). The Creative Direction
Agent classifies the message: **approve** → `running` (clears `feedback`); **revise** →
`regenerating` (stores `feedback` for the next regen). → `200 RunDetail`.

### `POST /runs/:id/cancel`
Terminate a run. Idempotent — already-terminal runs return unchanged. Sets `failed` with
`error: "Run cancelled."`. → `200 RunDetail`.

### `POST /runs/:id/edited-video`
Save a client-side CE.SDK edit of the final video. Requires `status = completed` (else `422`;
the worker never touches completed runs, so this write is race-free). Multipart body: `video`
(required `video/mp4`, ≤200MB) + `scene` (optional serialized editor scene JSON). Stores the export
as a new `edited_video` asset and the scene as `editor_scene` — the original `final_video` is kept.
→ `201 RunDetail` (now carrying the new assets). `404` if unknown.

### `DELETE /runs/:id`
Permanently remove the run + all files (best-effort storage wipe) + DB rows (FK cascade removes
assets, step_events, artifact rows). → `200 { "ok": true, "id": "…" }`. `404` if unknown.

## Error shape

Single sink (`apps/api/src/lib/errors.ts`):
```jsonc
{ "error": "message", "code": "CODE", "details": [ /* optional Zod issues */ ] }
```
Codes: `BAD_REQUEST` 400 · `NOT_FOUND` 404 · `CONFLICT` 409 · `UNPROCESSABLE` 422 · `INTERNAL` 500.
Unknown routes return `404 { "error": "Not found" }`.

## Shared types (`@ugc/shared`)

Single source of truth — Zod schemas + inferred types in `packages/shared/src`, imported by both
apps. DB enums (`db/schema.ts`) are derived from these.

**Enums** — `RunStatus`: `queued | running | awaiting_confirmation | regenerating | completed | failed` ·
`Step`: `product_sheet | person_sheet | product_inspection | storyboard | storyboard_inspection | video | narrative_outline | segment_storyboard | segment_video | merge` ·
`AssetKind`: `product_upload | person_upload | product_sheet | person_sheet | storyboard_sheet | storyboard_master | final_video | segment_video | edited_video | editor_scene` ·
`Mode`: `automatic | confirm` · `Duration`: `15s | 30s | 45s | 60s` · `AspectRatio`: `16:9 | 9:16` · `AdType`: `ugc | inspirational` ·
`ArtifactStatus`: `draft | approved | rejected` · `StepEventStatus`: `started | passed | failed | regenerated`.

**DTOs**

```ts
Asset      { id, runId, kind: AssetKind, url, mime, meta?: object|null, createdAt }
StepEvent  { id, runId, step: Step, status: StepEventStatus, payload?: object|null, createdAt }
Scene      { index, cameraAngle, actionMovement, sceneDescription, transcript, adStyle }
Run        { id, projectId, prompt, adStyle, adType, mode, aspectRatio, duration, criticEnabled,
             status, currentStep: Step, error: string|null, feedback: string|null, createdAt, updatedAt }
RunDetail  = Run & { assets: Asset[]; stepEvents: StepEvent[]; scenes: Scene[]|null;
             segmentScenes: Scene[][]|null; narrativeOutline: {segments:{index,beat,summary}[]}|null;
             visualStyle: string|null }   // post-edit `edited_video`/`editor_scene` surface in `assets[]`

CreateRunInput { prompt (1–2000), mode, aspectRatio, duration, criticEnabled, hasPersonImage }   // validated server-side
FeedbackInput  { message (1–2000) }
```

See also: [apps/api/docs/database-schema.md](../apps/api/docs/database-schema.md) (tables/columns)
and [apps/api/docs/rls-policies.md](../apps/api/docs/rls-policies.md).
