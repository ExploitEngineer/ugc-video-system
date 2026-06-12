// Canonical enums for the run state machine, shared by `web` and `api`.
// Each is a Zod schema (single source of truth) + an inferred TS type.
// Mirrors the data model in SPEC.md §5.

import { z } from "zod";

/** Lifecycle of a generation job (`runs.status`). */
export const runStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "regenerating",
  "completed",
  "failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

/**
 * Discrete pipeline units (`runs.currentStep`, `step_events.step`).
 *
 * The first six are the ~15s pipeline. The last four are the multi-segment
 * pipeline (`isMultiSegment(duration)` — 30/45/60s): `narrative_outline` is
 * dormant; `segment_storyboard`/`segment_video` are single steps that fan out
 * over the run's N segments internally (the "which segment" dimension lives in
 * the `segment_index` artifact columns, not in this enum), and `merge`
 * concatenates the N clips into the final video. A 15s run never emits these.
 */
export const stepSchema = z.enum([
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
 * Post-generation editing (img.ly CE.SDK) adds two kinds, both attached to a
 * `completed` run alongside the original `final_video` (never replacing it):
 * `edited_video` is the user's MP4 export from the editor, and `editor_scene`
 * is the serialized CE.SDK scene (so reopening the editor resumes the edit).
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
]);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** Run mode — controls step gating, not the Critic auto-checks. */
export const modeSchema = z.enum(["automatic", "confirm"]);
export type Mode = z.infer<typeof modeSchema>;

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
