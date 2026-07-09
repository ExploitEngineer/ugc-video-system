// Canonical enums for the run state machine, shared by `web` and `api`.
// Each is a Zod schema (single source of truth) + an inferred TS type.
// Mirrors the data model in SPEC.md §5.

import { z } from "zod";

/**
 * Lifecycle of a generation job (`runs.status`).
 *
 * `awaiting_regen` is a SOFT-FAIL gate: a recoverable video failure (a transient
 * provider hiccup that exhausted the in-clip retry ladder, or a content-safety
 * block) parks the run here instead of dead `failed`, so the user can retry or
 * tweak the clip via `POST /runs/:id/regenerate-video`. `failed` is reserved for
 * truly unrecoverable errors. Like `awaiting_confirmation`, it is terminal for
 * the worker (not in CLAIMABLE); the regenerate route flips it back to `running`.
 *
 * There is no mid-pipeline template choice gate: a `pipeline: "template"` run
 * (see `pipelineSchema`) has its Nexrender template registered and introspected
 * BEFORE the run is even created, so it flows straight through to `completed`
 * like a normal run — see `template_fill`/`template_render` in `stepSchema`.
 */
export const runStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "regenerating",
  "awaiting_regen",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Discrete pipeline units (`runs.currentStep`, `step_events.step`).
 *
 * `creative_brief` runs ONLY for the `service` ad-type (the creative-director
 * step: short prompt → multi-scene brief; no product/person sheets). The 15s
 * product/person pipeline and the last four multi-segment
 * pipeline (`isMultiSegment(duration)` — 30/45/60s): `narrative_outline` is
 * dormant; `segment_storyboard`/`segment_video` are single steps that fan out
 * over the run's N segments internally (the "which segment" dimension lives in
 * the `segment_index` artifact columns, not in this enum), and `merge`
 * concatenates the N clips into the final video. A 15s run never emits these.
 */
export const stepSchema = z.enum([
  "creative_brief",
  "product_sheet",
  "person_sheet",
  "product_inspection",
  "storyboard",
  "storyboard_inspection",
  "video",
  "narrative_outline",
  "segment_storyboard",
  "segment_video",
  "merge",
  // ── `pipeline: "template"` steps. Automatic, never gated (template runs are
  // forced `mode: "automatic"`, `criticEnabled: false` at the create route).
  // Full chain:
  //   template_plan → [product_sheet ∥ person_sheet] → storyboard
  //     → template_fill → template_images → video → template_render
  //
  // Runs FIRST, before any image/video spend: one cheap LLM call reads the
  // template's slot inventory (kinds, geometry, placeholder text, clipSeconds)
  // and the ad brief, then emits a per-slot plan (`runs.template_plan`). Every
  // downstream agent reads it, which is what keeps the copy, the images and the
  // clip describing the SAME ad instead of three unrelated ones.
  "template_plan",
  // Writes every TEXT slot's value from the plan + the storyboard scenes
  // (`runs.template_text_fill`). Placed after the storyboard so the copy can
  // draw on the product brief and the spoken script, not just the raw prompt.
  "template_fill",
  // Generates the CONTENT image slots with gpt-image-2 (`template_image`
  // assets), conditioned on the plan + product sheet + storyboard look. Slots
  // classified `brand` (logo/icon) or `decorative` (background/texture) are
  // never generated — the template keeps its own art. Never hard-fails: a
  // failed slot falls back to the template's default asset.
  "template_images",
  // ...then the clip + those text values + those images are composited into the
  // template picked at run creation (`runs.template`), persisting a
  // `templated_video`.
  "template_render",
]);
export type Step = z.infer<typeof stepSchema>;

/**
 * Kind of stored file (`assets.kind`). `final_video` is the single ~15s clip
 * AND the merged multi-segment output; `segment_video` is one of the N 15s
 * segment clips of a 30/45/60s run. `storyboard_master` is the multi-segment
 * single N×4-panel sheet; its cropped row blocks are persisted as
 * `storyboard_sheet` (`segment_index` 0..N-1), the same kind a 15s run's
 * single sheet uses.
 *
 * Post-generation editing (img.ly CE.SDK) adds three kinds, all attached to a
 * `completed` run alongside the original `final_video` (never replacing it):
 * `edited_video` is the user's MP4 export from the editor, `editor_scene`
 * is the serialized CE.SDK scene (so reopening the editor resumes the edit), and
 * `final_audio` is the audio track extracted from `final_video` (ffmpeg, lazily
 * on first editor open) so the editor can show it as its own timeline lane.
 */
export const assetKindSchema = z.enum([
  "product_upload",
  "person_upload",
  "product_sheet",
  "person_sheet",
  "storyboard_sheet",
  "storyboard_master",
  "final_video",
  "segment_video",
  "edited_video",
  "editor_scene",
  "final_audio",
  // One gpt-image-2 still generated for a CONTENT image slot of the run's
  // template (`template_images`). `meta.jobLayerName` maps it back to its slot
  // at render time. N per run, one per fillable slot.
  "template_image",
  // One slice of the 15s master clip, cut to the exact length of ONE video slot
  // in the template. A template with 7s/2s/2s video layers gets three of these,
  // showing three DIFFERENT moments of the same continuous shot — Nexrender
  // cannot offset a source's in-point, so the cut happens here (ffmpeg).
  // `meta.jobLayerName` maps it back to its slot; muted unless it is the one
  // slice carrying the voiceover (see `template_audio`).
  "template_clip",
  // The master clip's full 15s audio track, extracted so it can be injected
  // into the template's own AUDIO layer. Without this, slicing the master would
  // chop the voiceover into stuttering half-words across the video slots.
  "template_audio",
  // The Nexrender output: the `pipeline: "template"` run's clip composited into
  // the template registered at run creation, re-hosted from Nexrender Cloud to
  // Supabase. The sole deliverable a template-pipeline run shows once completed.
  "templated_video",
  // The MODIFIED .aep Nexrender returns from a render — the editable project,
  // re-hosted from Nexrender Cloud to Supabase alongside the `templated_video`.
  "template_aep",
]);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** Run mode — controls step gating, not the Critic auto-checks. */
export const modeSchema = z.enum(["automatic", "confirm"]);
export type Mode = z.infer<typeof modeSchema>;

/**
 * Which generation pipeline a run uses (`runs.pipeline`), picked up front via
 * the studio sidebar switch — NOT a mid-run choice. `video` (default) is the
 * unchanged product/person/storyboard/video pipeline. `template` registers +
 * introspects a Nexrender After Effects template BEFORE the run is created
 * (so a bad template file fails fast, before any AI cost is spent), then runs
 * the same agent pipeline and automatically composites the clip + AI-written
 * text into the template (`template_fill` → `template_render`).
 */
export const pipelineSchema = z.enum(["video", "template"]);
export type Pipeline = z.infer<typeof pipelineSchema>;

/**
 * Output aspect ratio, chosen by the user at run creation. Propagated to the
 * reference/storyboard image sheets (so the guidance frame matches) AND the
 * final Seedance video. `16:9` landscape (default) · `9:16` vertical.
 */
export const aspectRatioSchema = z.enum(["16:9", "9:16"]);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

/**
 * Ad treatment, inferred from the prompt by the Creative Direction Agent.
 * `ugc` — a person gives a spoken review/testimonial of the product.
 * `inspirational` — open-ended cinematic scene with voiceover narration.
 */
export const adTypeSchema = z.enum(["ugc", "inspirational"]);
export type AdType = z.infer<typeof adTypeSchema>;

/**
 * OPEN ad-type id — validated as SHAPE (non-empty kebab-case), NOT membership,
 * so adding a new ad type needs no enum migration (the `errorCode` precedent).
 * Unrecognised ids resolve via the ad-type registry's fallback (Chunk C), not
 * rejection. The legacy `adTypeSchema` union above is kept for back-compat.
 */
export const adTypeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/, "adType must be a kebab-case id");
export type AdTypeId = z.infer<typeof adTypeIdSchema>;

/** How the run's adType was set: auto-detected, or an explicit user dropdown pick. */
export const adTypeSourceSchema = z.enum(["auto", "user"]);
export type AdTypeSource = z.infer<typeof adTypeSourceSchema>;

/** Approval state of a generated artifact (sheets, video). */
export const artifactStatusSchema = z.enum(["draft", "approved", "rejected"]);
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;

/**
 * Target length of the final ad, chosen by the user at run creation. One ~15s
 * segment per step of 15: `15s` (default) is the single-storyboard, single-clip
 * pipeline; `30s`/`45s`/`60s` author one master sheet of N×4 panels, crop it
 * into N row blocks, render N 15s clips, and merge them into the final video.
 */
export const durationSchema = z.enum(["15s", "30s", "45s", "60s"]);
export type Duration = z.infer<typeof durationSchema>;

/** Number of ~15s segments for a duration: 15s→1, 30s→2, 45s→3, 60s→4. */
export function segmentCountFor(duration: Duration): number {
  return Number.parseInt(duration, 10) / 15;
}

/**
 * Whether a run uses the multi-segment pipeline (master sheet → row crops →
 * per-segment videos → merge). True for everything but `15s`, which stays the
 * single-storyboard, single-clip path.
 */
export function isMultiSegment(duration: Duration): boolean {
  return duration !== "15s";
}

/**
 * Machine-readable cause of a failed run (`runs.errorCode`). Paired with the
 * user-facing sentence in `runs.error`; the raw provider/ffmpeg detail never
 * leaves the server logs / step_event payloads. Stored as plain text in the DB
 * (new codes must not require an enum migration) — this schema validates at
 * the wire boundary.
 */
export const runErrorCodeSchema = z.enum([
  "PERSON_IMAGE_INVALID",
  "IMAGE_GENERATION_FAILED",
  "VIDEO_GENERATION_FAILED",
  // We polled past BYTEPLUS_POLL_TIMEOUT_MS — the provider never returned a
  // terminal status. Distinct from a provider-side failure so logs/dashboards
  // can tell "too slow / stuck" apart from "the job itself failed".
  "VIDEO_GENERATION_TIMEOUT",
  // The provider expired the task on its own side before it finished.
  "VIDEO_GENERATION_EXPIRED",
  "VIDEO_MERGE_FAILED",
  // Seedance's OUTPUT-AUDIO moderation flagged the generated voiceover as
  // sensitive ("output audio may contain sensitive information"). Distinct from
  // the generic content block so the video ladder can retry it with neutralized,
  // brand-safe spoken lines before parking the run.
  "PROVIDER_AUDIO_BLOCKED",
  // The `template_plan` LLM step failed (provider error / unparseable reply)
  // after its retry. Nothing downstream has run, so recovery restarts the run.
  "TEMPLATE_PLAN_FAILED",
  // The Nexrender template render failed or timed out (provider error, bad
  // template/layer mapping, or output never reached a terminal status).
  "TEMPLATE_RENDER_FAILED",
  // The `template_fill` LLM step failed (provider error / unparseable reply)
  // after its retry.
  "TEMPLATE_FILL_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_CONTENT_BLOCKED",
  "RUN_CANCELLED",
  "INTERNAL",
]);
export type RunErrorCode = z.infer<typeof runErrorCodeSchema>;
