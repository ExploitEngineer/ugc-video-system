# 08 - After Effects work area vs composition duration: how long is a template, really?

Status: root-caused + fixed 2026-07-16 on `feat/template-library-pipeline`.
Scope: the template pipeline's duration model (`geometry.ts`, `introspect.ts`, `preview.ts`, `library.ts`).
Related: `[[nexrender-layer-targeting]]`, `07-template-pipeline-separation.md`.

## TL;DR

- **After Effects renders a composition's WORK AREA, not its `duration` property.** Nexrender's v3 API exposes `duration` and *no work area*, so the number we trusted was never the ad's length.
- Measured on the live template `01KXK7B8P21EW09CXVNQYSBX3G` ("Mister Horse"): `Main_Comp.duration = 30.9666666666667`, actual render = **21.0s**. A **9.97s** lie.
- Consequence: `planFootageSegments(30.97)` → `ceil(30.97/15) = 3` segments × `snapUp(10.32) = 12s` = **36s master for a 21s ad**. One entire Seedance segment generated, paid for, and discarded (~33% of the video spend), *and* `planClipSlices` cut every slot's footage against a 31s timeline that did not exist.
- The segmenting math was never wrong. **It was fed a bad number.** `geometry.ts` needed no functional change.
- Fix: measure the template's own preview render. It is that same composition rendered with `assets: []`, so its length *is* the template's length, by definition.
- **There is no ffprobe.** `ffmpeg-static` ships exactly one binary. `ffmpeg -i F -t 0 -f null -` reads the header, decodes zero frames, and exits 0.

## The evidence

Nexrender `GET /api/v3/templates/{id}/compositions` for the real template, 66 comps:

```
aeid=1     name='Main_Comp'                duration=30.9666666666667  1920x1080
aeid=150   name='UI (1)'                   duration=22.9666666666667  1920x1080
aeid=1293  name='Mobile UI'                duration=90.9666666666667  1920x1080
aeid=30    name='NO (Hand Drawn Cartoon)'  duration=3600              1920x1080
```

Two things follow. `detectMainComposition` picked `Main_Comp` **correctly** — this was never a comp-selection bug. And `duration` is plainly arbitrary: a comp claiming **one hour** sits in the same project as the 21s ad. The delivered `templated_video` measured **21.000000s** by ffprobe. Nexrender rendered `Main_Comp`; `Main_Comp` says 30.97; the output is 21.0.

The full composition object exposes nothing else usable:

```json
{ "aeid": "1", "name": "Main_Comp", "width": 1920, "height": 1080,
  "duration": 30.9666666666667, "frame_rate": 30, "data": {} }
```

`aeid, data, duration, frame_rate, height, name, width` — the complete key set across all 66 comps. **No work area, on any comp.**

### Why AE behaves this way

A composition has a `duration` (how long the timeline *is*) and a **work area** (`workAreaStart` + `workAreaDuration` — the span the render actually covers). A designer routinely leaves a long timeline and pulls the work area in around the finished ad. Render Queue honours the work area. So `duration` is closer to "how much room the designer had" than "how long the ad is", which is exactly why sibling comps report 3600s.

## Why measuring the preview is ground truth

The preview render is the same composition, same engine, same settings, with an empty asset list:

```ts
// preview.ts
await provider.submitRender({
  composition: structure.mainComposition,
  assets: [],              // the template renders its OWN placeholder content
  libraryPreview: true,
});
```

Its length is what Nexrender outputs for this template — not a proxy for it.

One trap ruled out: `libraryPreview: true` *sounds* like Nexrender's `preview` flag, which truncates (a 12.03s template came back as 3.7s — the reason `preview.ts` refuses it). It is not. `libraryPreview` is consumed only as a log field and by the stub branch; `job-body.test.ts` pins `expect(body).not.toHaveProperty("libraryPreview")`. It never reaches the wire.

**Load-bearing assumption:** the work area is stable between an empty-asset render and a filled one. It is a project property, not asset-dependent — and the delivered 21.0s `templated_video` (a *filled* render) matching the measured preview is the evidence.

## Measuring it: there is no ffprobe

`ffmpeg-static@5.3.0` ships one executable:

```
node_modules/.../ffmpeg-static/
  ffmpeg          79826272   ← the only binary
```

`package.json` declares `"executable-base-name": "ffmpeg"`. A system `/usr/bin/ffprobe` may exist on a dev box — ours does — but depending on it works locally and breaks in the container, and `merge.ts` already hard-fails on `if (!ffmpegPath)`. Adding `ffprobe-static` is unnecessary; measured against a real 36s mp4:

| approach | exit | wall | usable? |
|---|---|---|---|
| `ffmpeg -i F` | **1** | — | prints Duration, but `runFfmpeg` rejects non-zero |
| `ffmpeg -i F -f null -` | 0 | 1.46s | full decode, 16× the cost |
| **`ffmpeg -i F -t 0 -f null -`** | **0** | **0.09s** | ✅ `frame=0`, header still printed |

`-t 0` decodes nothing; `-f null -` supplies the output ffmpeg insists on so it exits 0. Parse target:

```
  Duration: 00:00:21.00, start: 0.000000, bitrate: 5067 kb/s
```

Centisecond precision — ample when the question is 21.0 vs 30.97. Verified end-to-end: `probeVideoDuration(templated_video)` returned **21**, matching ffprobe exactly.

## The arithmetic, before and after

```
before   durationSec = comp.duration = 30.97
         planFootageSegments(30.97) → ceil(30.97/15)=3 × snapUp(10.32)=12 → 36s master
         real ad = 21s → 15s of Seedance discarded; slices cut against a 31s fiction

after    durationSec = probe(preview) = 21.0
         planFootageSegments(21.0)  → ceil(21/15)=2  × snapUp(10.5)=12  → 24s master
         AE trims 3s. One fewer generation, slices aligned to the real timeline.
```

## Design decisions

**`durationSec` is corrected IN PLACE.** It stays the single number every consumer reads (`plan/index.ts`, `keyframe/index.ts`, `video/index.ts`, `clips.ts`, `template/index.ts`, `template-mappers.ts`), so fixing it needed no call-site changes. `measuredDurationSec` + `durationSource` ride alongside as provenance. `templates.metadata` is jsonb → no migration.

**The length gate MOVED, and the old placement was harmful.** It ran at introspect on the untrusted number — and a rejection *discards the uploaded bytes* (`discardRemoteTemplate`), so a comp under-reporting its length **lost the user's file over a number that was never true**. Now:

- introspect keeps structural checks + `MAX_COMP_PREFILTER_SEC = 600`, a pure cost fuse so a comp claiming 3600s can't bill us for an absurd preview render;
- `validateMeasuredDuration` enforces the real 8-60s rule at preview time, and **does not discard bytes** — it is our measurement, and a regression in it must not wipe a library.

**`withMeasuredDuration` guards both introspect paths.** `buildMetadata` re-derives `durationSec` from the comp, so one click of `POST /:id/reintrospect` would silently revert 21.0 → 30.97 and quietly resume over-generating. Nothing about the project file changed, so the measurement survives.

**The run snapshot is refreshed in `template_plan`.** `runs.template` is immutable by design — a template edit must not change a run mid-flight. A duration correction is different in kind: the snapshot recorded a *wrong fact* about an unchanged template. `template_plan` is the first step and already fetches the live row, so the refresh is free and lands before any spend.

**Two guards that would otherwise bite:**
- `isStubTemplateId(row.nexrenderTemplateId)` — the stub returns a canned **2s** clip; measuring it would fail every template under `MIN_TEMPLATE_SEC` and break the free smoke-test path. Checked per-ROW, not per-env, since registration and preview can run under different env.
- `setPreviewOverride` never measures — an admin's hand-picked demo clip has a length unrelated to the composition, and writing it in would make every beat/segment/slice follow a fiction.

**The crop changed.** `capVideoDuration` now fires only when `compSec != null && compSec > adSec`. A template with no readable duration used to be cropped to the 15s default, truncating a real 21s ad on the strength of a number we never had.

## Backfill

`previewVideoUrl` is Nexrender's own CDN URL (~14d retention), so:

- **preview alive** → `POST /admin/templates/:id/remeasure` re-reads it. Free: no render, no AI spend. Used on `edc560b1-…`: `30.97 → 21`, `durationSource: measured`.
- **preview expired** → `DELETE /admin/templates/:id/preview` regenerates one; the normal path measures it. One Nexrender render, no Seedance.

Rows never touched keep working on the comp's number, degraded exactly as before — every new field is optional.

## Open

- **Work-area drift.** If a template's work area is ever changed after registration, the measurement goes stale silently. Re-preview fixes it; nothing detects it.
- **The `.aep` `cdta` chunk** carries the work area structurally (`aep.ts` already parses RIFX). That would let us know the length *before* paying for a preview, and cross-check the measurement. Not needed while the preview exists; the honest reason to skip it is that it means reverse-engineering an undocumented binary layout for a number we can already measure exactly.
- **`MAX_COMP_PREFILTER_SEC = 600`** is a judgement call, not a measured constant.
