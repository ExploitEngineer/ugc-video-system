# Ad-gen refactor — feature tickets

Goal: make the system produce **realistic UGC / inspirational-style ad videos**, fixing the pipeline stage-by-stage (upload → creative direction → reference sheets → storyboard → video). Each chunk is implemented, smoke-tested, **manually tested by the user**, then committed. Branch `refactor/ad-gen-overhaul` off `dev`; one `dev → main` PR at the very end; never push `main`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (smoke + manual passed + committed).

---

## Decisions (locked)

- **Ad-types:** curate to a tight realistic core; drop the motion-graphics/banner/explainer (`graphic_text`) family entirely.
- **Hooks:** replace with short cold-open visual attention devices (first 3-4s); drop structural/copy overlays.
- **Character:** an explicit **Character On/Off toggle** drives whether a person is generated — NOT the ad-type. On → one main-character sheet (uploaded or synthesized even with no upload) + person-upload shown. Off → no character sheet + person-upload hidden. Supporting cast = **text-only** roles woven into prompts (no extra sheets).
- **Brand guidelines:** per-run (no auth). File upload (PDF/image) + AI extraction **and** a free-text box (+ optional logo). Injected into image + video prompts.

### Proposed ad-type core (6) — edit before Chunk 1

| id              | display name      | look family        | product      | character default | notes                                                   |
| --------------- | ----------------- | ------------------ | ------------ | ----------------- | ------------------------------------------------------- |
| `ugc`           | UGC / Testimonial | ugc_authentic      | **required** | On                | person to camera; product shown/held                    |
| `brand-story`   | Brand Story       | cinematic_polished | optional     | On                | narrative / origin                                      |
| `inspirational` | Inspirational     | cinematic_polished | optional     | On                | emotional mood film                                     |
| `product-demo`  | Product Demo      | demo_clean         | **required** | Off               | product hero; merges product-showcase + demo + unboxing |
| `lifestyle`     | Lifestyle         | cinematic_polished | optional     | On                | product in real life                                    |
| `founder`       | Founder Story     | cinematic_polished | optional     | On                | founder POV; merges founder-pov + spokesperson          |

Dropped: `social-proof, explainer, promo-offer, announcement, brand-awareness` (graphic_text); `product-showcase, comparison, before-after, unboxing, spokesperson, problem-agitate-solve` folded in or moved to hooks. Legacy aliases kept so old runs resolve.

### Proposed cold-open hook set (~6-7) — edit before Chunk 2

`striking-visual`, `pattern-interrupt`, `problem-solution`, `before-after` (reveal), `relatable-moment`, `curiosity-tease`, `confession` (ugc/founder). Each = one opening directive → storyboard panel 1 + the video's first time-slice.

---

## Chunks

### Chunk 0 — Housekeeping + baseline

- [x] Commit pending verified prompt-tuning (`5e1ebfd`); ff `dev`; branch `refactor/ad-gen-overhaul`.
- [x] Create this ticket file.
- [x] Baseline smoke: real UGC + Product Demo runs generated end-to-end.

### Chunk 1 — Ad-type tight core (#3) ✅

- [x] Curated `registry.ts` to the 6 core; deleted 11 dropped defs+skills; kept internal ids stable (display-name change only — lower-risk than id renames); added legacy aliases for every dropped id.
- [x] Removed `graphic_text` from `LookFamily` + look base + `videoNegatives` + every `isGraphic` branch (`storyboard`/`video` builders, `video/index`, `dump-prompt`). Left the `cleanGraphic`-gated branches in `storyboard/prompt.ts` as dead code (`= false`) → pruned in Chunk 6.
- [x] Detector menu auto-shrank (registry-derived); trimmed `CONFUSABLE_RULES` + the explicit-name map; `reconcile` defaults/downgrades use only surviving types; UGC product **required**; `lifestyle` product **optional**.
- [x] Display names via the registry-derived dropdown; updated `detector*` tests + eval fixtures.
- [x] Verify: typecheck + 86 tests; menu dump = 6 types; real UGC + Product Demo runs `passed`.
- [x] **Bugfix (surfaced in manual test):** a mislabelled image mime (WebP stored as `image/png`) made Claude-via-OpenRouter 400 on the product brief + sheet plan. Fixed by sniffing the true format at the provider boundary (+ AVIF/HEIC→PNG), storing the sniffed mime on upload, and surfacing real chat-error bodies.

### Chunk 2 — Cold-open hooks (#4)

- [ ] Replace `hooks/hook-defs.json` with the cold-open set + opening directives; update `hooks/registry.ts`, `hooks/compose.ts`, per-type `defaultHooks`/`allowedHooks`, detector menu.
- [ ] Confirm hook → storyboard panel-1 + video first time-slice.
- [ ] Verify: tests; real run — hook opens the first 3-4s in storyboard + `videoPrompt`.

### Chunk 3 — Creative Direction summary card UI (#2)

- [ ] Move the `adStyle` paragraph + creative chips out of the user bubble into a Creative Direction agent message (`run-view.tsx`); tidy chip layout; relabel "AI person" → "AI character".
- [ ] Verify: studio visual check.

### Chunk 4 — Character On/Off toggle + dynamic main character + text supporting cast (#5)

- [ ] Schema: `runs.character_enabled` boolean + `runs.supporting_cast` jsonb (one migration); `dto.ts` create-run + RunDetail.
- [ ] Character On/Off control in `create-run-form.tsx` (default from ad-type); Off → hide person-upload. `willGeneratePerson` driven by `character_enabled`, not `personRequired` (`plan.ts`, `reconcile.ts`).
- [ ] Character-planning step → `{ mainCharacter, supportingCast[] }`; carry `supportingCast` in ctx; splice into `storyboard/prompt.ts` + `video/prompt.ts`.
- [ ] Verify: On + no upload → main character generated; Off → no `person_sheet`, upload hidden, run completes; 2-3-person prompt → supporting roles as text in prompts.

### Chunk 5 — Brand guidelines: upload + extraction + text + inject (#1)

- [ ] Schema: `runs.brand_guidelines` jsonb + `runs.brand_text` text (+ migration).
- [ ] `lib/brand/` (schema + `extractBrand()` vision call + `formatBrand()`), ported from `ai-ad-gen`.
- [ ] `routes/runs.ts` accept brand file + text + logo, store, extract; `dto.ts`; brand inputs in `create-run-form.tsx`.
- [ ] Inject brand into `interpret-style/prompt.ts`, `storyboard/prompt.ts`, `video/prompt.ts`.
- [ ] Verify: real run with a brand deck — extraction populates `brand_guidelines`, brand appears in prompts, palette/tone visibly influences output.

### Chunk 6 — Prompting deep pass: gpt-image-2 storyboard (#6a)

- [ ] Deepen `storyboard/prompt.ts` + `fragments/looks.ts` + `providers/openai` params: identity lock, anti-plastic-skin, panel-grid geometry, text fidelity, supporting-cast text, brand-palette adherence.
- [ ] Verify: storyboards across the 6 types (with/without brand + supporting cast) for realism + identity consistency.

### Chunk 7 — Prompting deep pass: Seedance 2.0 video (#6b)

- [ ] Deepen `video/prompt.ts` (`buildVideoPrompt` + `buildDeterministicVideoPrompt`) + `providers/byteplus` params: motion realism, main-character lip-sync, supporting-cast presence, brand adherence, per-look negatives, ~90-word limit, `camerafixed`.
- [ ] Verify: full runs to final video across types; realism, character consistency, audio, brand fit, merged 30/60s continuity.

---

## Per-chunk verification floor

1. `pnpm typecheck` + `pnpm --filter api test`.
2. Real end-to-end via `pnpm dev` (restart `dev:api` after any migration/new step); inspect local db (`psql postgresql://postgres:postgres@localhost:5432/ugc`): `step_events`, `runs.error`, `videos.provider_meta->>'videoPrompt'`, persisted briefs/brand jsonb; confirm the actual model prompt is sane.
3. Pause for user manual test → commit.
