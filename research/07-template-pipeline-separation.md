# 07 - Template pipeline separation + template-native analysis

Status: design accepted 2026-07-13, implementation in progress on `feat/template-library-pipeline`.
Supersedes the shallow, ad-type-coupled template path described in `[[nexrender-template-integration]]` and `[[template-vision-analysis]]` (the latter's Sonnet-vision upgrade was never in the working tree).

## Problem

The template pipeline (`runs.pipeline = "template"`) is meant to be driven entirely by the picked After Effects template.
In practice it piggybacks on the NORMAL video pipeline: it runs the ad-type detector, reuses the 2x2 storyboard, and reuses the Seedance video builder, all threaded with `isTemplate` / `templateBeats` / `slotWindows` flags.

Three consequences:

1. Coupling bug.
   A "service" template makes Seedance bake app-UI screens, stat cards and a brand end-card straight into the footage (`storyboard/prompt.ts:726-736` authors those panels, `video/index.ts:444-447` permits them), then Nexrender composites the template's own text on top, so the overlays collide.
   The template is supposed to own all on-screen text and graphics; the footage should be plain.

2. Blind analysis.
   The first step (`template/plan/index.ts`) is a cheap text-only Haiku call that never sees the template, so the generated footage, stills and copy do not match the template's look or animation.

3. Forced 15s.
   Every template run generates exactly 15s (`geometry.ts` `MASTER_CLIP_SECONDS`), even when the composition is shorter.

## Goal

A genuinely separate template pipeline: its own steps, prompts and skills, zero ad-type dependence, whose first step properly analyzes the whole template and hands a rich blueprint to an LLM that decides how everything fits.
The generated footage is plain (the template composites all overlays), and the clip length matches the template.
The runtime pipeline is fully autonomous: the user defines the end goal and the system reaches it with no runtime questions.

## Key decisions (from the review)

Analysis scope.
The deterministic structural introspection (Nexrender v3 + `.aep` parse) already extracts EVERY element exhaustively: each text field, image, video and audio slot, its exact pixel box, and the exact second it appears (timeline windows via `timeline.ts` `resolveWindows`).
That is the authoritative "what / where / at which second" answer and it is not sampled.
On top of that, the analysis LLM reads the template's LOOK and ANIMATION from a dense, adaptive frame strip sampled across the whole preview `.mp4` (roughly one frame per second, plus every slot boundary and midpoint), not a handful of frames.
This is explicit: the user rejected "just 4 frames" and asked for the full template to be analyzed.

Claude first, Gemini later.
v1 uses Claude Sonnet vision over the poster + the dense frame strip (still images).
Still images approximate motion but cannot fully capture it; true frame-by-frame video understanding is exactly what a Gemini video path gives.
So the analysis provider is an interface (`TemplateVisionProvider`) with a Claude still implementation now and a Gemini video seam (deferred, not built).

Footage look-lock.
No 2x2 storyboard board.
One single clean reference image (no text, logos, UI, end-cards) fixes palette and mood, and a timestamped per-slot script drives the motion.
Confirmed against the user's Seedance research that one reference image beats four.

Duration.
Templates are limited to 8-15s at upload (reject anything shorter or longer).
Seedance 2.0 accepts only `[4, 5, 6, 8, 10, 12, 15]` seconds (`providers/video.ts`), and `snapSeedanceDuration` snaps UP.
The clip length follows the template: `masterClipSeconds(tpl) = snapSeedanceDuration(min(templateDuration, 15))`.
When the template length is not a supported value, Seedance overshoots to the next one and After Effects trims the surplus at composite (equivalent to the user's "crop a second"), for example a 9s template renders a 10s clip that AE trims to 9s.
The number of beats/scenes scales with the template's own video slots, so a longer template gets more.

Audio.
Keep it simple for now: use Seedance's generated audio, no template-audio-ownership branch.
The blueprint keeps only a light voiceover-intent field.
Revisit template-vs-Seedance audio ownership later.

## Architecture

Target step chain (same driver, `runs.pipeline` switch):

```
template_plan (blueprint; text-only in Phase 1, Claude vision in Phase 2)
  -> [ product_sheet || person_sheet ]   reference phase, unchanged
  -> template_keyframe                   NEW: one clean reference image + per-slot script
  -> template_fill                       copy; reads the script; no ad-type
  -> template_images                     unchanged
  -> template_video                      NEW: plain Seedance, real duration
  -> template_render                     unchanged (Nexrender composite)
```

Re-template shortcut preserved: `template_plan -> template_fill` and `template_images -> template_render`.

What stays untouched (the deterministic engine):
`introspect.ts`, `timeline.ts`, `aep.ts`, `geometry.ts` classification/sizing, `beats.ts` `deriveTemplateBeats`, `slices.ts`, `clips.ts`, `render-input.ts`, `self-heal.ts`, `providers/nexrender/*`, and the whole `applyTemplate` render step.
Only the authoring (plan/keyframe/video prompts), the duration constant, and the ad-type coupling change.

Ad-type decoupling.
The Phase-0 detector (`orchestrator.ts:935-1008`) is guarded so template runs never call `interpretAdStyle`/`reconcile`.
The plan and fill-text prompts drop `adType`/`adStyle`.
The plan emits a `visualStyle` string that is persisted to `runs.adStyle` so the reference sheets still get a coherent look without the detector.

## The blueprint (Phase 2)

A backward-compatible superset of the current `templatePlanSchema`, persisted into the SAME `runs.template_plan` jsonb column (no migration), so existing consumers keep parsing (Zod strips extra keys).
Fields:
`conceptSummary`, `durationSec`, `visualStyle` (genre/palette/lighting/mood/pacing/motion), `onScreenText` (owner: template|video|none + requireCleanFootage), a light `audio` (voiceover intent + tone), `slots[]` (role, copyIntent, imageSubject, fill, videoScene + cameraAction + onScreenMoment, window), and `visionSource` (poster+frames|poster|video|text-only).

## Vision provider (Phase 2)

`providers/template-vision/`:
`index.ts` = `TemplateVisionProvider` interface + `createTemplateVisionProvider(openai)` selected by env.
`claude.ts` = v1, poster + dense frame strip on one Sonnet turn via the existing OpenRouter/Claude transport.
`gemini.ts` = v2 seam, throws "not implemented"; docstring pins the Files-API path.
`lib/video/frames.ts` = `sampleFrames(mp4Url, timestampsSec)` ffmpeg extractor returning ~512px JPEG `ImageRef[]`.
Frame count adapts to duration (`TEMPLATE_VISION_FRAME_COUNT`, default 12).
Degrades gracefully: frames -> poster -> text-only, recorded in `visionSource`.

## Risks

A single still shows no motion; mitigated by the dense frame strip, fully closed only by the Gemini path.
Token/latency/cost rise (Haiku text call becomes a Sonnet vision call with many inlined stills); bounded by the frame cap, ~512px frames, and a one-retry pattern.
Placeholder-subject leakage (the preview shows the designer's placeholder content, not this ad); mitigated by an explicit "style from frames, content from brief" rule and a reconcile that keeps our slots authoritative.
Missing preview poster/video; degrade to text-only, never hard-fail.
Re-template with a different-length template reuses the old master and re-slices; tail slots clamp to the master end.

## Verification

typecheck + vitest are the floor, not the bar.
Each phase is smoke-tested on a real run: watch `step_events` for the new chain (no detector/storyboard/video events), assert `videos.durationSec` matches the template, eyeball the pre-composite footage (plain, no baked text/UI) versus the composited output (overlays present), and regression-check a normal video-pipeline run.

## Update 2026-07-18: the placeholder-subject leak DID happen, and the real fix

The risk noted above ("placeholder-subject leakage ... mitigated by an explicit 'style from frames, content from brief' rule and a reconcile that keeps our slots authoritative") was NOT actually mitigated.
It shipped as a live bug: a user uploaded GLASSES with the prompt "create the ugc ad" and the whole ad (blueprint, storyboard, stills, clip) came back as a WATER BOTTLE - the template's demo product (run `090fa5a5`).

Root cause, proven against the DB.
`runs.product_brief` was correctly set to the glasses and was even marked authoritative in the keyframe prompt.
But `template_plan` runs FIRST (before `describeProduct`) and is never given the product image, and with a generic prompt plus only the template's demo frames to look at, its per-slot `videoScene` / `imageSubject` / `conceptSummary` / `audio.voiceover` described the demo water bottle in full sentences.
That long, detailed demo TEXT then out-voted the one-line "authoritative" product brief at every downstream step.
The precise override point was `beats.ts` `beatsToScenes`: `sceneDescription: b.scene || src?.sceneDescription` - the demo beat scene won over the product-grounded storyboard scene.
So the "keep our slots authoritative" mitigation was exactly backwards: the slots were authoritative for the WRONG thing (the demo subject).

The real fix is a WHAT-vs-HOW split (structure/look only).
The blueprint now carries ONLY the template's look, pacing, timing, camera and text-ownership.
Its `videoScene` / `imageSubject` / `conceptSummary` / `audio.voiceover` are SUBJECT-AGNOSTIC structural roles ("opening hero reveal", "hero product shot", "reveal -> detail -> in-use -> sign-off"), never a product noun, enforced by a HARD RULE at the end of the blueprint prompt ("whatever the demo frames show is placeholder content to IGNORE; the real product is attached downstream").
The SUBJECT is authored downstream from the user's real product, exactly like the normal pipeline: `beatsToScenes` now prefers the product-grounded storyboard scene (`src.sceneDescription`) and the beat's structural text is only a fallback; the stills lead the SUBJECT with `productBrief`; the keyframe (already product-authoritative) fills the real product into the template's structural arc.

Lesson.
A one-line "authoritative" product brief cannot win against paragraphs of concrete demo-scene text.
Do not try to out-argue a leak with a priority label; remove the leak's SUBJECT at the source (make the blueprint subject-agnostic) AND guarantee the product wins at every consumption point (prefer product-grounded scenes, compose stills from the brief).
Soft LLM guards ("never copy the placeholder's subject") were present the whole time and did not hold.
