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

**S4 — service hooks (stat/question/pain) + dynamic selection ✅**

- [x] Re-added `stat` + `question` cold-opens (service-only via allowedHooks; `problem-solution` covers pain); `VISUAL_LEAD_IDS` updated; service `defaultHooks` lead with problem-solution/stat. The brief's chosen hook is rendered in the storyboard opening (dynamic pick by awareness stage). _(user manual test passed)_

**Chunk S is complete** — short prompt → creative-director brief → 4-scene storyboard (cast + hook) → multi-scene skit video with cuts + dialogue. Known minor follow-up: unify the creative-direction chip hook (detector) with the brief's hook for service.

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

**4a — character toggle + dynamic main character `[~]` (implemented, awaiting manual test)**

- [x] Schema: `runs.character_enabled` boolean (default true) + `runs.supporting_cast` jsonb (migration `0021_next_mac_gargan`); `dto.ts` `createRunInputSchema.characterEnabled` (optional) + `runSchema.characterEnabled` + `adTypeMenuItemSchema.characterDefault`.
- [x] `AdTypeDef.characterDefault` on all 7 defs (product-demo Off, rest On); exposed via `menu.ts`. The create-run route resolves the default from the picked type's `characterDefault` when the client omits it.
- [x] `willGeneratePerson` driven by `character_enabled`, NOT `personRequired` (`plan.ts` AssetCtx + predicate; orchestrator `assetCtxFor`/reference-phase asset; `reconcile.ts` synthesize-person + person-hook validity via an optional `characterEnabled` param; `mappers.ts` skip-step ctx).
- [x] Synthesize the main character even with NO uploads: `planPersonBrief`/`buildPersonBriefPrompt` now take `productUpload` OPTIONAL and plan the brief from the prompt alone when absent; orchestrator `personBranch` synthesizes whenever the toggle is On and no person was uploaded.
- [x] Character On/Off control in `create-run-form.tsx` (Options popover, default from ad-type, re-syncs on type change); Off → hide person-upload + drop a stale file; hidden entirely for `service` (cast comes from the brief). Sends `characterEnabled` in the multipart body.
- [x] Floor: typecheck (3/3) + 86 api tests + web lint; migration applied to local DB; menu dump confirms per-type `characterDefault`.
- [ ] **Manual test:** toggle On + no upload (e.g. brand-story/lifestyle) → a main character IS synthesized; toggle Off → person-upload hidden, NO `person_sheet`, run still completes; product-demo defaults Off, ugc/founder default On.

**4b — text-only supporting cast `[ ]` (next sub-step)**

- [ ] Character-planning step → `{ mainCharacter, supportingCast[] }` (extends the prompt-only person-brief planner); persist `runs.supporting_cast`; carry in ctx; splice supporting-role TEXT into `storyboard/prompt.ts` + `video/prompt.ts` (no extra sheets).
- [ ] Verify: a 2-3-person prompt → main sheet + supporting roles present as text in the storyboard + video prompts.

### Chunk 5 — Brand guidelines: text + inject (#1)

**5a — brand text box + inject ✅**

- [x] Schema: `runs.brand_text` + `runs.brand_guidelines` (migration 0020). `lib/brand.ts` `formatBrand()`.
- [x] Injected the brand block into the creative brief + storyboard + video prompts (both builders). `routes/runs.ts` accepts `brandText`; `dto.ts`; `SkillContext.brandText` + buildCtx; "Brand guidelines" textarea in the create-form Options popover.
- [x] Verify: typecheck + 86 tests + web lint; real service run (OrderCalm) — brand palette/tone/name visibly drive the storyboard + the colour-grade shift. _(user manual test passed)_

**5b — brand FILE upload + AI extraction + logo (deferred)** — file (PDF/image) → structured `brand_guidelines` via a vision LLM (ai-ad-gen pattern) + logo asset; revisit after the prompting pass.

### Chunk 6/7 — Prompting deep pass (now SERVICE-focused, iterative)

**Round 1 — on-screen text + end card ✅**

- [x] Garbled-UI-text fix: brief + storyboard render busy app/UI screens with ABSTRACT non-readable text; only the hero stat + end-card line crisp + verbatim. End card = brief scene 4 (brand name/logo + tagline + URL, no actors), rendered as a clean designed last panel. Video negatives match. _(user manual test passed)_

**Round 1.5 — voice + hero-text fidelity ✅** _(committed `b3ba8ab`)_

- [x] Each on-screen character keeps a CONSISTENT voice matching apparent age/gender across their scenes (service.skill.md + video/prompt.ts); hero + end-card text rendered VERBATIM letter-for-letter (storyboard/prompt.ts).

**Round 2 — dynamic solution-screen + storyboard consistency/POV `[~]` (implemented, awaiting manual test)**

- [x] **Dynamic UI screen** (prompt-driven, not a fixed template): brief authors an app/dashboard/device screen ONLY when the service is genuinely screen-based AND the beat needs it (creative-brief/prompt.ts — removed the "show busy screens/apps" push); video service negatives no longer force "Render busy app/UI screens" — they follow the storyboard and only keep screen text abstract IF a screen is shown (video/index.ts).
- [x] **Storyboard consistency + POV** via `cinematic_polished.shotDirection` (was empty `[]`): shot-type variety, RECURRING SET & PROPS held identical across panels (fixes the drifting-towels case), and screens/devices framed OVER-THE-SHOULDER / POV (fixes POS screens facing camera). Reaches service + all cinematic product types. `plannedStoryBlock` MULTI-SCENE rule refined to hold shared settings identical.
- [x] Floor: typecheck (3/3) + 86 api tests (fragment-regression `inspirational` storyboard baseline re-locked via `regen-legacy-fixtures.ts`) + web lint; offline dump confirms the shot-direction prose splices + the brief UI language is conditional.
- [ ] **Manual test:** OrderEase (screen service) → screens POV/over-shoulder, kitchen + props consistent, solution screen still present; a NON-screen service (cleaning/coaching) → no forced UI screen; Lumio (brand-story) → one consistent towel/mug/counter across panels.

**Open follow-ups (next rounds, driven by user-reported issues):**

- [ ] identity/realism polish, supporting-cast presence, brand-palette adherence in-frame.
- [ ] multi-segment service brief→panel mapping (30s/60s: 4 brief scenes → N×4 master).
- [ ] (original product-type items below, lower priority post-pivot.)

### Chunk 6 — Prompting deep pass: gpt-image-2 storyboard (#6a, product types)

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
