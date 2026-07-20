# Testing checklist - template + video prompting refactor (2026-07-18)

Covers the 4 shipped changes.
Floor (typecheck + `pnpm --filter api test`) is already green - this list is the REAL E2E proof per CLAUDE.md.
Local DB: `psql postgresql://postgres:postgres@localhost:5432/ugc`.

## 0. Setup (once)

- [ ] Restart the worker so it loads the new code: stop `pnpm dev:api`, start it again (`pnpm dev` or `pnpm dev:api`).
- [ ] Open the studio (`http://localhost:3000`).
- [ ] Helper - after any run, grab its id:
  `psql ... -c "select id, pipeline, ad_type, status from runs order by created_at desc limit 1;"`

## 1. Fix 1 - template pipeline uses the REAL product (glasses, not the demo)

- [ ] Template run: pick a template, upload the GLASSES product image, prompt "create the ugc ad", run to completion.
- [ ] Blueprint carries NO product noun (structure only):
  `psql ... -c "select jsonb_pretty(template_plan) from runs where id='<RUN>';"`
  PASS = `slots[].videoScene` / `imageSubject` / `conceptSummary` / `audio.voiceover` describe STRUCTURE ("hero reveal", "detail beat", "reveal -> ... -> sign-off"), and NEVER name a bottle/glasses/any product.
- [ ] Storyboard + video show the GLASSES, not the template's demo product:
  `psql ... -tA -c "select jsonb_path_query_array(scenes,'$[*].sceneDescription') from storyboard_sheets where run_id='<RUN>' limit 1;"`
  PASS = scenes describe the glasses; the rendered clip shows glasses.
- [ ] Regression: run a NON-glasses product on a template too - it should track ITS product, not leak.

## 2. Fix 2 - the UGC character actually TALKS (lip-sync)

- [ ] Normal (video) pipeline: upload a product (+ optionally a person), prompt "create a ugc ad", run to completion.
- [ ] The Seedance prompt directs on-camera lip-sync:
  `psql ... -tA -c "select provider_meta->>'videoPrompt' from videos where run_id='<RUN>' order by segment_index;"`
  PASS = contains the deterministic `SPEECH (most important): the on-screen person SPEAKS ... mouth clearly visible and moving ... never a detached or off-screen voiceover`, AND the spoken lines are attributed `says: "..."` in DOUBLE quotes (not `(spoken:` / single quotes).
- [ ] Watch the clip: the person's mouth MOVES in sync with the words (not silent / not disembodied VO).
- [ ] No-product UGC stays a talking testimonial (not downgraded to voiceover):
  run "create a ugc ad" with NO product uploaded -> `select ad_type from runs where id='<RUN>';` PASS = `testimonial` (not founder-pov / brand-story).
- [ ] Cinematic still narrates by design: a `brand-story` / `inspirational` run's prompt uses `narrates: "..."` and has NO forced lip-sync SPEECH block. (Intended - only UGC/testimonial/service lip-sync.)

## 3. Fix 3 - regenerate buttons, orange step colours, fallbacks

Regenerate + orange:
- [ ] Completed normal run -> press "Regenerate" (clip): the regenerating step turns ORANGE and STAYS orange for the whole redo (does not flip back to blue when work starts).
- [ ] Completed template run -> "Try another template" (retemplate): steps show the ORANGE "rebuilding" state through the redo.
- [ ] Confirm-mode revise (type feedback at a gate): the revised step shows orange.

Reachable Retry for every template failure code:
- [ ] Force a template failure and confirm a reachable "Retry" appears (previously only render/fill had one). Quick way to fake a code for the UI:
  `psql ... -c "update runs set status='failed', error_code='TEMPLATE_KEYFRAME_FAILED', error='forced test' where id='<TEMPLATE_RUN>';"` then reload the run -> a "Retry" button must show. Repeat for `TEMPLATE_PLAN_FAILED` and `TEMPLATE_VIDEO_FAILED`.
- [ ] Pressing Retry lights the ORANGE loader on the CORRECT step (the failed step), not always on `template_render`.

Silent-fallback surfacing:
- [ ] If a completed template run had any image slot fall back to the template's own art, the finished-ad card shows the amber note "N template image(s) could not be generated and kept the template's built-in artwork." (Check a run whose `template_images` step event payload has `fellBack > 0`:
  `psql ... -tA -c "select step, status, payload from step_events where run_id='<RUN>' and step='template_images';"`)

## 4. Phase 2 - refreshed Seedance prompt format

- [ ] Any talking run's `videoPrompt` (query in 2) uses `says: "..."` for on-camera speech and `narrates: "..."` for voiceover, both in DOUBLE quotes - the research-validated lip-sync/voiceover triggers.
- [ ] No `(spoken:` / `(voiceover:` bare labels remain in emitted prompts.

## 5. Floor (already green - re-run if you touch code)

- [ ] `pnpm typecheck`
- [ ] `pnpm --filter api test`  (470 pass, 1 skipped)
- [ ] `pnpm --filter web lint`

## Notes / known limits (from the 2026 research refresh)

- Seedance speech audio is its WEAKEST channel (~50-60% production-ready, occasional metallic sibilants). If a voice-critical ad needs perfect audio, the guaranteed path is still post-dub VO over a silent/lip-timed clip.
- Per-ad-type camera/motion recipes were deliberately NOT rewritten - the research found no reliable evidence, so they need first-party A/B testing through the pipeline, not speculative prompt edits (this repo has a history of reverted prompt-rule tuning).
