# Video Editor (post-generation)

How a **completed** run's `final_video` becomes user-editable: the studio opens img.ly's **CE.SDK**
video editor (`@cesdk/cesdk-js`) in the browser, the user trims / adds text, audio, effects, filters
/ etc., and the exported MP4 (plus the editor scene, so the edit can be reopened) is saved back onto
the run. This doc traces the **flow**, **where data is stored**, **where the editor's templates and
stock content come from**, the **code map**, and the **config + gotchas**.

> Companions: [pipeline.md](pipeline.md) (generation, up to `final_video`),
> [database-schema.md](database-schema.md) (`assets` table + `asset_kind`),
> [system-context.md](system-context.md) (HTTP surface), and the root
> [docs/api-reference.md](../../../docs/api-reference.md) (`POST /runs/:id/edited-video`).

## What it is

A **post-completion, client-side** editor — not part of the generation pipeline and not an agent.
The generation worker only ever claims `queued`/`running`/`regenerating` runs and **never touches a
`completed` run**, so editing a finished run is race-free; the API write happens on a terminal run.
The editor itself (full timeline UI + WASM rendering/export) runs entirely in the browser; our
backend only **stores the result**.

It lives on a dedicated full-screen route **`/studio/[runId]/edit`** reached from the "Edit video"
button on a completed run. The original `final_video` is **never replaced** — an edit produces a new
`edited_video` asset alongside it.

## End-to-end flow

```
completed run (has final_video)
  │  user clicks "Edit video" on the run page
  ▼
/studio/[runId]/edit                         (full-screen route)
  EditVideoView → fetches the run, picks the source:
      latest editor_scene exists?  → cesdk.loadFromURL(sceneUrl)      (resume prior edit)
      else                         → cesdk.createFromVideo(finalUrl)  (start from the generated clip)
  │  CesdkEditor (lazy, ssr:false) → CreativeEditorSDK.create() → initVideoEditor()
  │     • addPlugin(VideoEditorConfig)  → full UI: dock, timeline, inspector, features, settings
  │     • dark theme · asset libraries (img.ly CDN) · "Export Video" button
  │     • registerActions() overrides `exportDesign` → upload (not download)
  ▼  user edits, clicks "Export Video"
exportDesign override:
   cesdk.utils.export()          → edited MP4 (Blob)
   cesdk.engine.scene.saveToString() → scene JSON (string)
  │
  ▼  uploadEditedVideo(runId, mp4, scene)   [lib/api.ts]
POST /api/runs/[runId]/edited-video          (same-origin Next proxy, streams body, duplex:"half")
  ▼
POST /runs/:id/edited-video                  (Hono; rejects unless status === "completed")
   validateVideo (video/mp4, ≤200MB) + optional scene
   persistAsset("edited_video", mp4)   → Supabase Storage + assets row
   persistAsset("editor_scene", scene) → Supabase Storage + assets row   (if scene present)
  ▼  → 201 RunDetail (now carrying the new assets)
run page re-fetches → the "ready" card prefers the newest edited_video.
```

Reopening `/edit` later loads the **latest `editor_scene`** (by `createdAt`) via `loadFromURL`, so
the user's previous edit is restored rather than starting over from the raw `final_video`.

## Where data is stored

Everything saved goes through the existing asset pipeline — see [database-schema.md](database-schema.md).

| What | Asset kind | MIME | Storage path |
|---|---|---|---|
| Exported edited clip | `edited_video` | `video/mp4` | `runs/{runId}/edited_video-{uuid}.mp4` |
| Serialized editor scene | `editor_scene` | `application/json` | `runs/{runId}/editor_scene-{uuid}.json` |

- Bucket: **public** `ugc-assets` (Supabase Storage), written server-side with the service-role key
  via `persistAsset()` → `uploadAsset()`. A stable public URL is stored once on the `assets` row.
- The original `final_video` is **kept**. Each save appends a new `edited_video` (+ `editor_scene`)
  row, so edits accumulate as history; **latest wins** by `createdAt` for both display (run page) and
  reopen (editor). De-duping older edits is a possible future cleanup, not done today.
- `DELETE /runs/:id` removes them with everything else: `deleteRunObjects` wipes the flat
  `runs/{runId}/` storage prefix, and the `assets` FK cascade drops the rows.
- The edited assets surface to the frontend in **`RunDetail.assets[]`** (`GET /runs/:id`). They are
  **not** part of the `GET /runs/:id/artifacts` shape (that endpoint is generation-output only).

## Where templates & stock content come from

This is the key thing to understand: **our backend stores only the exported MP4 + scene. Everything
the user can browse inside the editor's dock — templates, stock images/videos/audio, stickers,
fonts, shapes, effects, filters — is served by the img.ly CDN, not by us.**

- Dock libraries are registered in `lib/cesdk/index.ts` as CE.SDK asset-source plugins:
  `DemoAssetSources` (stock video/audio/image + video templates), `PremiumTemplatesAssetSource`,
  and `Sticker/Text/TextComponent/Typeface/VectorShape/Effects/Filters/Blur/CaptionPresets/
  CropPresets/ColorPalette/ImageColors/PagePresets` sources. Their content loads from the img.ly CDN.
- **Engine assets** (UI icons, fonts, the WASM bundle) also load from the img.ly CDN in dev: we set
  **no `baseURL`**, so CE.SDK uses the CDN path that matches the installed `@cesdk/cesdk-js` version.
  For production, self-host: download the matching `imgly-assets.zip` into `apps/web/public/assets`
  and pass `baseURL: "/assets"` on `create()`. (Asset content is version-locked to the SDK, which is
  why the dependency is pinned exact.)
- **User uploads** in the editor (`UploadAssetSources`) are **session-local browser blob URLs** — we
  do not persist them. They only end up on our backend if the user places them in the timeline and
  they get baked into the exported MP4.

## Code map

| File | Role |
|---|---|
| `apps/web/src/app/studio/[runId]/edit/page.tsx` | Server route; renders `EditVideoView` full-screen |
| `apps/web/src/components/studio/edit/edit-video-view.tsx` | Client: fetch run, pick source vs scene, states, "Back to chat", lazy-mounts the editor, `onSaved` (upload + toast + invalidate + navigate) |
| `apps/web/src/components/studio/edit/cesdk-editor.tsx` | Client wrapper: `next/dynamic({ssr:false})` target; `create` → `initVideoEditor` → load; engine in a `useRef`, `dispose()` on unmount; StrictMode-guarded |
| `apps/web/src/lib/cesdk/index.ts` | `initVideoEditor`: `addPlugin(VideoEditorConfig)` + theme + asset sources + Export-Video button + `registerActions` |
| `apps/web/src/lib/cesdk/actions.ts` | `registerActions`: overrides `exportDesign` to export MP4 + `saveToString` scene → `onSaved` |
| `apps/web/src/lib/cesdk/video-editor/**` | The full Video Editor UI config — `plugin.ts` (`VideoEditorConfig`) + `features/settings/actions/i18n/ui/*`. Ported from img.ly's Video Editor starter kit (`github.com/imgly/starterkit-video-editor-ts-web`); AI background-removal ("Apps" panel) was intentionally dropped |
| `apps/web/src/app/api/runs/[runId]/edited-video/route.ts` | Same-origin Next proxy → streams to the API |
| `apps/web/src/lib/api.ts` | `uploadEditedVideo(runId, mp4, scene?)` |
| `apps/api/src/routes/runs.ts` | `POST /runs/:id/edited-video` + `validateVideo` (mp4 ≤200MB) |
| `apps/api/src/agents/persist.ts` | `persistAsset` — upload bytes + insert an `assets` row (no artifact-table row) |
| `apps/api/src/lib/storage.ts` | `uploadAsset` / paths; `EXT_BY_MIME` maps `application/json → json` for the scene |
| `packages/shared/src/enums.ts` | `assetKindSchema` — adds `edited_video` + `editor_scene` (Drizzle `assetKindEnum` follows) |

## Endpoint contract

`POST /runs/:id/edited-video` — multipart: `video` (required `video/mp4`, ≤200MB) + `scene`
(optional serialized editor scene JSON). Requires `status = completed` (else `422`). Stores
`edited_video` (+ `editor_scene`), keeps `final_video`. → `201 RunDetail`. `404` if the run is
unknown. Full reference: [docs/api-reference.md](../../../docs/api-reference.md).

## Config & prerequisites

- **`NEXT_PUBLIC_CESDK_LICENSE`** (web, client-exposed) — img.ly license/trial key. **Empty is
  allowed**: the editor still works but exported videos carry a watermark and the img.ly "Evaluation
  Purposes Only" banner prints to the console (Next's dev overlay surfaces it as a "Console Error" —
  expected, not a bug). Get a key at img.ly/forms/free-trial.
- **Supabase Storage CORS (#1 first-run blocker)** — the in-browser editor fetches the `final_video`
  **public `*.supabase.co` URL** cross-origin. The `ugc-assets` bucket must allow the web origin
  (`http://localhost:3000` in dev, the prod origin in prod) for `GET` (incl. range requests). If the
  editor canvas loads but the video never appears, this is almost always why.
- **Prod assets** — self-host the engine/asset bundle (see "Where templates come from"); the CDN is
  for development.

## Gotchas

- **React 19 StrictMode** double-mounts effects in dev → the wrapper guards with a `disposed` flag +
  `cesdk.dispose()` in cleanup so only one engine is ever live.
- **Deprecated asset-source methods** — `cesdk.addDefaultAssetSources()` /
  `addDemoAssetSources()` are deprecated in `@cesdk/cesdk-js@1.76.0` and **reject**; the editor uses
  the plugin-based `addPlugin(new XAssetSource())` form. Asset sources are registered best-effort
  (`Promise.allSettled`) so a single failing library can never blank the editor.
- **Export time/size** — a long (60s 1080p) client-side encode is slow and can be large; the API caps
  uploads at 200MB and the Next proxy streams the body rather than buffering it.
