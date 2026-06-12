# 60s refactor checklist — single 16-panel master + row-crop strips

Living tracker for the 60s pipeline rework: replace **four separate storyboard
sheets** with **ONE 16-panel master** (consistency is inherent in one gen),
**crop it into four 4-panel row strips**, animate each strip into a ~15s clip,
merge. Plus: simplify the storyboard + video prompts, and kill near-duplicate
panels.

Full design + rationale: `~/.claude/plans/so-our-current-flow-effervescent-dusk.md`.

**Locked decisions:** row strips (4×4 row-major master, crop = one row); simple
timestamped video shot-list + ONE audio line (UGC lip-sync / inspirational VO) +
`@Image` anchors + leak-guard.

**Flow (step graph + names unchanged):**
`narrative_outline → segment_storyboard (1 master gen + 4 row crops) → segment_video ×4 → merge`

## Chunks (implement one at a time; pause for manual test before committing)

- [x] **0. Checklist doc** — this file.
- [x] **1. sharp + crop module** — `sharp@^0.34.5` in `apps/api/package.json`; NEW
      `apps/api/src/lib/image/crop.ts` `cropPanelRows(bytes, rowCount)` (row inset
      to avoid neighbour bleed). Typecheck clean.
- [x] **2. `storyboard_master` asset kind + migration** — `packages/shared/src/enums.ts`;
      migration `0013_watery_ezekiel.sql` (ALTER TYPE ADD VALUE), applied to local DB.
- [x] **3. 16-panel storyboard mode (prompt + skill)** — `agents/image/storyboard/{prompt.ts,index.ts}`:
      `full60s` branch (4×4, panels 01–16, 16 scenes, anti-repetition, segment→row
      mapping), `slice(0,16)`, maxTokens 12288/16384, non-persisting `generateMaster`.
      15s path byte-for-byte unchanged.
- [x] **4. `segment_storyboard` rewrite + inputs helpers** — `orchestrator.ts`
      (master gen + crop + persist master & 4 crops; idempotent/resume; revise
      rebuilds all), `inputs.ts` (`persistedMasterStoryboard`, `latestMasterStoryboard`),
      `image/index.ts` (export `generateMaster`).
- [x] **5. Read-path & mapper fixes** — `lib/runs.ts` (60s single-sheet arg dropped;
      15s query scoped to `storyboard_sheet` kind), `routes/runs.ts` (`/artifacts`
      `storyboardMaster`, singular `storyboardSheet` null for 60s). `mappers.ts` verified.
- [x] **6. Video prompt simplification + 1×4 language + audio line** —
      `agents/video/prompt.ts` rewritten to the simple timestamped shot-list
      (`Generate a scene using shots in the uploaded film storyboard [0:00-0:04]: …`),
      `@Image` legend + ONE audio line + leak-guard retained; `buildSliceBrackets`
      (0:00-0:04/…/0:11-0:15); deterministic fallback matches. `video/index.ts`
      strip legend prose. Pure-function output verified.
- [x] **7. Face-asset name uniqueness** — `video/index.ts` per-segment
      `referenceTag=${runId}-seg${i}`. **Validation gate (still pending a real run):**
      eyeball ONE clip from a 2048×288 strip before trusting all four.
- [x] **8. Web** — `run-view.tsx` shows the single 16-panel master (not 4 crops),
      revise copy updated; `step-timeline.tsx` maps `segment_storyboard → storyboard_master`.
      Typecheck + Biome clean.
- [x] **9. Remove dead targeting** — deleted `parseTargetSegments`, the
      `targetSegments` field, and the orchestrator targeting branch; revise now
      grounds on `latestMasterStoryboard` and rebuilds the whole master.
- [x] **10. Docs** — `pipeline.md` (§1/§4/§6a/§8), `system-context.md`
      (§3/§6/§10/§12), `agents-and-skills-io.md`, `SPEC.md` progress log.

## Round 2 — post-test refinements

- [~] **R2-1. Fix `HeightTooSmall`** — strip height upscale added, but a 1×4 strip
  still fails BytePlus's aspect limit (≤2.5). **Superseded by R2-5** (re-tile to 2×2).
- [x] **R2-5. Re-tile rows → 2×2** — `crop.ts` `cropRowsAs2x2` composites each row's
      4 panels into a 2×2 block (TL=1…BR=4). Scratch-verified **984×552, aspect 1.78**
      (clears BytePlus aspect 0.4–2.5 AND height ≥300). Video prompt reverted to 2×2
      language (`video/{prompt,index}.ts`).
- [x] **R2-6. UGC active-demo** — `storyboard/prompt.ts` UGC `typeBlock` + full60s block
      now push talk-to-camera + actively show/handle the product (hold up, take off, rotate,
      point); ban passive lifestyle b-roll. Inspirational unchanged.
- [x] **R2-2/R2-3. Drop summaries + one coherent scene** — `narrative_outline`
      retired from the 60s chain (`plan.ts` `nextStep`/`gateForNext`; dormant in the
      enum/skill/columns). `generateMaster` no longer takes `segments`; the full60s
      prompt authors ONE continuous coherent scene (ONE place/wardrobe/look, vary only
      the shot) and the anti-repetition rule is softened to "distinct SHOTS of the same
      scene". Removed `otherSummaries`/outline reads from the orchestrator; web drops
      `narrative_outline` from `STEP_ORDER_60` + `OutlinePanel`. Typecheck + lint clean.
- [ ] **R2-4. Continuity anchor** — prev row's last panel as a parallel reference
      (new `storyboard_anchor` kind + `cropPanel`). **HELD until the wide-strip
      composition is validated** (if Seedance composes the ~7:1 strip badly, the crop
      approach pivots and R2-4 changes).

## Remaining (needs a real run)

- **Thin-strip validation gate (Chunk 7):** generate ONE segment clip from a
  2048×288 (16:9) strip and confirm Seedance composes it sanely BEFORE trusting
  all four. If it fails → fall back to 2×2 quadrant crops (1024×576, reuses the
  old 2×2 video-prompt language).
- **Full end-to-end 60s run** (automatic + confirm) on local DB with OpenAI +
  BytePlus keys: 1 `storyboard_master` (16 scenes) + 4 crops + 4 `segment_video`
  - 1 `final_video`; panels distinct; four clips share one look.

## Notes / bugs fixed along the way

- `loadRunDetail` newest-by-createdAt returns a crop, not the master → fixed in 5.
- Storyboard token ceiling (5120/8192) truncates 16-scene JSON → raised in 3.
- BytePlus face-asset name collision (`${runId}-person-0` for all segments) → fixed in 7.
