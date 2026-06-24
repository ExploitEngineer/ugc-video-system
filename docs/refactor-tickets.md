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

## PIVOT (2026-06-24) — service-based ads are now the PRIMARY product

New direction: the system's main output is **service-based ads** — short narrative/skit ads for a SERVICE or software (SaaS, agency, local service, coaching). The user uploads **nothing** (no product, no person) and just writes what the service does; brand guidelines are optional. Synthesized actors, a multi-scene skit, a dynamic hook, optional on-screen stat/price/end-card — all **driven by the user prompt**, NOT a fixed template (the Gemini B2B breakdown is one example, too static to hardcode).

Decisions:

- **Add ONE `service` ad-type** alongside the existing 6 (they stay). `service` is the default; product/person uploads optional/absent.
- **Fully dynamic, prompt-driven** — the hook and the beat structure derive from the user's prompt, never a hardcoded template. The cold-open hook set likely needs a stat/text-style hook re-added for service ads (pending research).
- **Prompt-improvement step** — expand the user's short service description into a rich, model-ready creative brief (cast, setting, conflict→resolution, hook, CTA) before storyboard/video.
- Character toggle (Chunk 4) + brand guidelines (Chunk 5) become CENTRAL (service ads = synthesized cast + optional brand). Prompting (Chunks 6/7) must cover multi-scene skits + on-screen text + multi-actor.

### Chunk R — Deep research: service-ad prompting ✅

- [x] Deep-research pass (18 confirmed / 7 killed claims) → build-ready spec **`research/06-service-ad-prompting.md`**. Key: storyboard-first anchors synthesized-cast identity; Seedance dialogue = `speaks in English: "..."` (NOT `{braces}`), ONE speaker per shot (multi-person lip-sync unsolved); on-screen text = literal copy in quotes; hooks picked dynamically by awareness stage (re-add stat/question/pain hooks); flexible framework beats (PAS/AIDA/BAB), NOT a fixed second-by-second template; brand prefix block into both prompts.

### Chunk S — Service ad type + dynamic hooks + prompt-improvement

**S1 — service type + creative-director brief ✅**

- [x] Registered single `service` ad-type (default, no required uploads, synthesized cast) + skill; legacy ids untouched.
- [x] New `creative_brief` step + Creative Brief Builder skill: short prompt → structured brief (`concept, framework, awarenessStage, hook, cast[], scenes[], cta`) persisted to `runs.creative_brief` (migration 0019). New `CreativeBrief` shared type.
- [x] Distinct service path in orchestrator/plan: `creative_brief → storyboard → video` (skips product/person sheets); detector + create-form default to `service`; timeline shows "Creative brief" (hidden for product runs).
- [x] Verify: typecheck + 86 tests + offline smoke; real service run passes end-to-end, brief jsonb is sane. _(user manual test passed — video quality not yet brief-driven, expected)_

**S2 — multi-scene storyboard from the brief ✅**

- [x] `storyboard/prompt.ts` consumes `ctx.creativeBrief`: a PLANNED STORY block renders the cast identity blocks + 4 scenes (scene i → panel i) with per-scene setting, colour-grade shift, who/dialogue, and on-screen text verbatim; a script directive ties each panel's sceneDescription/transcript to its planned scene. Brief nudged to exactly 4 scenes. `storyboard/index.ts` passes the brief.
- [x] Verify: typecheck + 86 tests; real service storyboard renders the planned multi-scene story with a consistent synthesized cast. _(user manual test passed)_

**S3 — multi-scene service video (Seedance) ✅**

- [x] `video/prompt.ts` (both builders) + `video/index.ts` branch on service: clean CUTS between distinct scenes (not one continuous take), dialogue `speaks in English: "..."` one speaker per shot, service negatives (multi-character, on-screen text kept) instead of the cinematic ones, no product-object constraints. Non-service stays byte-identical (fragment-regression green). _(user manual test passed; brand prefix deferred to Chunk 5)_

**S4 — service hooks (stat/question/pain) + dynamic selection**

- [ ] Re-add stat/question/pain hooks for `service`; dynamic pick by awareness stage from the brief.

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

### Chunk 2 — Cold-open hooks (#4) ✅

- [x] Replaced `hook-defs.json` with 7 cold-open hooks (kept stable ids + new `striking-visual`); dropped the 10 structural/copy hooks (stat-shock, social-proof, bold-claim, contrarian, direct-callout, unexpected-comparison, negativity-bias, question, demonstration, testimonial-as-hook).
- [x] `registry`: 6 visual-leads + `curiosity-gap` as the lone overlay accent. `compose`: emptied the moot mutually-exclusive sets; remapped placeholders. All 6 defs' `defaultHooks`/`allowedHooks` → cold-open set.
- [x] Hook → storyboard scene-1 + video first time-slice via `hookOpening` (unchanged seam).
- [x] Verify: typecheck + 85 tests (incl. 4 fixed green-but-misleading tests); menu/opening dump; real run confirms the cold-open. _(user manual test passed)_

### Chunk 3 — Creative Direction summary card UI (#2) ✅

- [x] Moved the `adStyle` paragraph + ad-type/hook/cast chips out of the user bubble into a dedicated "Creative direction" agent message (`run-view.tsx`); adStyle is now a real paragraph with the reel icon; "AI person" → "AI character"; "· auto" → "· detected". User bubble keeps the prompt + thumbnails + user-picked options. _(committed 84eb7b6)_

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
