# 60-Second Video Feature

Tracking doc for the 60s ad feature. Branch: `feat/60s-video`. See `SPEC.md` Progress Log for the landed-work record; this file is the live checklist.

## What it does

Today a run makes **one ~15s ad**. This feature adds a per-run `duration` toggle (`15s` default, `60s` new) that produces a **60s ad**:

```
4 storyboard sheets (4 panels each = 16 scenes)  →  4× 15s Seedance clips  →  merged into one 60s video
```

…that feels like ONE cohesive ad.

## The core design problem & resolution

The required continuity mechanism: when generating segment N, it must see the **other** segments' summaries so the 60s stays coherent. That's circular — you can't hand a storyboard the others' summaries before they exist.

**Resolution:** a single upfront **`narrative_outline`** step plans all 4 segment summaries (the 60s arc) BEFORE any storyboard renders. Those 4 summaries are the continuity glue passed to every storyboard and every video.

```
narrative_outline  ── produces [summary0..3] → runs.narrativeOutline
        │
segment_storyboard ── seg i gets summary[i] + the other 3  → renders its 4 panels   (∥ parallel ×4)
        │
   [confirm gate 2]   user reviews 4 sheets → revise targets ONE segment only
        │
segment_video      ── seg i gets its sheet + scenes + the other 3 summaries → 15s clip  (∥ parallel ×4)
        │
merge              ── ffmpeg concat 4 clips → 60s final_video
```

## Decided behavior

- **Per-run toggle** `duration` = `15s` (default, existing path 100% untouched) | `60s`.
- **Video fan-out: PARALLEL** — 4 Seedance tasks concurrent (continuity via shared summaries + same person/product refs, not frame-chaining). Capped by `SEGMENT_VIDEO_CONCURRENCY`.
- **Merge: ffmpeg in the worker** — `ffmpeg-static` + `spawn`, concat-filter re-encode preserving each segment's native audio.
- **Confirm-mode (60s)**: two gates — (1) after person reference sheet, (2) after all 4 storyboards. At gate 2 the user names a specific bad sheet/panel ("storyboard 3 panel 2") and we regenerate **only that segment**. Approve → all 4 videos → merge → final 60s.
- **UI** shows the 4× 15s clips AND the final merged 60s video.

## Checklist

Implement one chunk at a time. Every chunk after #1 must keep a **15s run working** (purely additive, duration-guarded). Typecheck clean after each chunk.

### Chunk 0 — Branch + tracking doc
- [x] `git checkout main && git pull`; `git checkout -b feat/60s-video`
- [x] Create `docs/60s-video.md`
- [x] Confirm `.env` `DATABASE_URL` → local PG, not prod
- [x] Add 60s entry to `SPEC.md` Progress Log

### Chunk 1 — Shared types (`packages/shared/src`)
- [x] `durationSchema` + `Duration` in `enums.ts`
- [x] `stepSchema` += `narrative_outline, segment_storyboard, segment_video, merge` (append-only)
- [x] `assetKindSchema` += `segment_video`
- [x] `dto.ts`: `createRunInputSchema.duration`, `runSchema.duration`, `runDetailSchema.duration` + `segmentScenes`
- [x] Both apps typecheck

### Chunk 2 — Schema + migration (`apps/api/src/db/schema.ts`)
- [x] `runs`: `duration` enum (default `15s`) + `narrativeOutline` jsonb
- [x] `storyboardSheets.segmentIndex` + index; `videos.segmentIndex` + index
- [x] `db:generate` (`0011_gray_bushwacker.sql`), `db:migrate` applied to local
- [x] typecheck green (placeholder 60s cases added in plan.ts/orchestrator.ts; mappers carry `duration`/`segmentScenes`); 15s path untouched

### Chunk 3 — Narrative-outline agent (NEW)
- [x] `creative-direction/narrative-outline/{prompt,index}.ts`; `SegmentSummary`/`NarrativeOutline` in `types.ts`
- [x] Wire into `creative-direction/index.ts` barrel (`narrativeOutline`, `SEGMENT_COUNT`)
- [~] Sanity: 4 coherent summaries — folded into the Chunk 8 live end-to-end run (needs OpenAI key)

### Chunk 4 — Input loaders (`inputs.ts`)
- [x] `latestNarrativeOutline`, `persistedSegment{Storyboard,Video}Indices`, `segmentStoryboards`, `segmentVideos` (newest-per-index = latest regen wins)

### Chunk 5 — Storyboard skill extension
- [x] Optional `segmentIndex/segmentSummary/otherSummaries`; persist `segmentIndex`
- [x] Continuity block in `buildStoryboardPrompt`; 15s path byte-identical (block gated on `segmentSummary != null`)

### Chunk 6 — Video skill extension
- [x] Optional `segmentIndex/otherSummaries`; persist `segmentIndex` + `kind:"segment_video"`; step events under `segment_video`
- [x] Short continuity preamble in `buildVideoPrompt`; 15s path unchanged (gated on `segmentIndex != null`)

### Chunk 7 — Merge (NEW)
- [x] `ffmpeg-static@^5.2.0` in `package.json` + BOTH pnpm allowlists; `pnpm install` ran postinstall OK
- [x] `lib/video/merge.ts` (download → spawn ffmpeg concat-filter → bytes), merge semaphore (1) + `-threads 2`
- [x] `agents/merge/index.ts` (load segments by index → merge → persist `final_video`, segmentIndex null)
- [x] Standalone smoke test PASSED: 4×3s clips → 12.07s mp4, video+audio both present

### Chunk 8 — State machine (automatic mode end-to-end)
- [x] `plan.ts`: thread `duration`; 60s ordering; gates (`narrative_outline`→reference, `segment_video`→storyboard); `genStepForRevise`
- [x] `orchestrator.ts`: 4 new cases (parallel fan-outs via `Promise.allSettled`/`runBounded`, idempotent skip), completion→`merge`, `SEGMENT_VIDEO_CONCURRENCY` env
- [x] Sequencing/gates asserted (15s + 60s order, both gates, revise routing) — pure-logic test PASSED
- [x] API boots clean (module graph + ffmpeg + merge agent load)
- [~] Full live 60s run + resume → deferred to Chunk 11 user manual test (needs OpenAI + BytePlus keys)

### Chunk 9 — API + Web (automatic)
- [x] `POST /runs` accepts `duration`; artifacts route returns `segmentStoryboards`/`segmentVideos` (newest-per-index); `finalVideo` = merged row; mappers add `duration`+`segmentScenes`; `loadRunDetail` passes segment sheets
- [x] `DurationToggle` (15s/60s); run-view renders segment-clip + storyboard galleries + final 60s; `artifact-card` `segment_video`; `script-panel` groups 16 scenes by segment; timeline duration-aware (`stepOrderFor`)
- [x] typecheck + web lint green
- [~] Live UI run → Chunk 11 user manual test

### Chunk 10 — Confirm-mode gating + targeted regen
- [x] Gates 1 (after person) + 2 (after 4 storyboards) wired for 60s (via `gateForNext`/`gateForCurrentStep` in Chunk 8 — confirm-mode threads through unchanged)
- [x] `parseTargetSegments` extracts `targetSegments[]` from message ("storyboard 3 panel 2" → seg 2; ignores "panel N"; out-of-range dropped) — 9/9 unit cases pass
- [x] `segment_storyboard` regen path: regen ONLY targeted segments (grounds vision on the named sheet; latest-per-index wins); empty target ⇒ all 4 fallback
- [x] Gate-2 UI tip copy in run-view (60s storyboard gate)
- [~] Live step-by-step run → Chunk 11 user manual test

### Chunk 11 — Final verification
- [x] `pnpm typecheck` (all 3 packages) + web `lint` + web `build` green
- [x] Unit/smoke gates pass: step sequencing+gates, ffmpeg merge (4 clips→one mp4, A/V intact), `parseTargetSegments` 9/9
- [x] 15s path code-unchanged (additive, duration-guarded); sequencing test confirms 15s order intact
- [x] Updated SPEC.md Progress Log → "code complete, live pending"
- [ ] **AWAITING user manual local test** — 60s auto run + confirm-mode targeted regen (needs OpenAI + BytePlus keys). Commit/PR only on user OK ([[commit-pr-workflow]]).

## Status: code complete on `feat/60s-video` — paused for user's manual local verification before commit/PR.

## Risks

- **BytePlus concurrency** — 4 parallel Seedance tasks may hit account limits → `SEGMENT_VIDEO_CONCURRENCY` semaphore.
- **ffmpeg CPU** — child process won't block the event loop, but concurrent 60s merges can saturate the box → merge semaphore + `-threads`.
- **pnpm allowlist** — `ffmpeg-static` postinstall must be in both allowlists or CI install fails (highest-likelihood footgun).
- **Enum `ADD VALUE` migration** — verify transactional apply on local PG.
- **15s regression** — every 60s step/column is additive and duration-guarded; the existing path must stay behaviorally identical.
