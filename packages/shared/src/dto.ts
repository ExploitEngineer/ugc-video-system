// API DTO schemas — the wire shapes exchanged between `web` and `api`.
// Built on the canonical enums (single source of truth) in `./enums`.
// Mirrors the data model in SPEC.md §5; the F2 mock and the F3 Hono API
// both return these shapes, so the frontend never changes when the real
// backend lands.

import { z } from "zod";
import {
  adTypeSchema,
  aspectRatioSchema,
  assetKindSchema,
  durationSchema,
  modeSchema,
  runErrorCodeSchema,
  runStatusSchema,
  stepSchema,
} from "./enums";

/** A stored file (image sheet or final video) attached to a run. */
export const assetSchema = z.object({
  id: z.string(),
  runId: z.string(),
  kind: assetKindSchema,
  url: z.string(),
  mime: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type Asset = z.infer<typeof assetSchema>;

/** Per-step audit entry — drives the progress timeline. */
export const stepEventStatusSchema = z.enum([
  "started",
  "passed",
  "failed",
  "regenerated",
]);
export type StepEventStatus = z.infer<typeof stepEventStatusSchema>;

export const stepEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  step: stepSchema,
  status: stepEventStatusSchema,
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
});
export type StepEvent = z.infer<typeof stepEventSchema>;

/** A generation job — the authoritative state machine row. */
export const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  adStyle: z.string(),
  adType: adTypeSchema,
  mode: modeSchema,
  aspectRatio: aspectRatioSchema,
  /** Target ad length — `15s` (single clip) or `30/45/60s` (N merged clips). */
  duration: durationSchema,
  criticEnabled: z.boolean(),
  status: runStatusSchema,
  /**
   * The LAST COMPLETED step — `null` before the first step finishes (a fresh
   * `queued` run) and throughout the parallel reference phase (the backend
   * holds it null until BOTH reference sheets finish). The UI relies on this
   * null to render "pending"/"generating" correctly instead of a premature
   * "passed", so it must NOT be coalesced to a step in the mapper.
   */
  currentStep: stepSchema.nullable(),
  /** User-facing failure sentence — never raw provider/ffmpeg output. */
  error: z.string().nullable(),
  /** Machine failure code; null while not failed and for pre-feature rows. */
  errorCode: runErrorCodeSchema.nullable(),
  /** Pending step-by-step feedback message, consumed by the next regen. */
  feedback: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof runSchema>;

/**
 * One planned storyboard scene — the script for ~3-4s of the ad. `transcript`
 * is the spoken line for the scene (UGC review line or voiceover narration).
 * `panelCaption` is the brief label burned into the storyboard panel (a
 * condensed form of `sceneDescription`); optional for rows created before
 * labelled storyboards landed.
 */
export const sceneSchema = z.object({
  // Field-level `.catch` keeps a single missing/malformed field (e.g. legacy
  // rows with no `transcript`) from failing the whole `scenes` array and
  // blanking the script panel. Fallbacks preserve the non-null wire contract.
  index: z.number().catch(0),
  cameraAngle: z.string().catch(""),
  actionMovement: z.string().catch(""),
  sceneDescription: z.string().catch(""),
  panelCaption: z.string().optional(),
  transcript: z.string().catch(""),
  adStyle: z.string().catch(""),
});
export type Scene = z.infer<typeof sceneSchema>;

/**
 * One segment of the 60s narrative arc, planned up front by the
 * `narrative_outline` step. `beat` names the act (e.g. "hook"); `summary` is the
 * 2–3 sentence brief that drives that segment's storyboard + video.
 */
export const narrativeSegmentSchema = z.object({
  index: z.number().catch(0),
  beat: z.string().catch(""),
  summary: z.string().catch(""),
});
export type NarrativeSegment = z.infer<typeof narrativeSegmentSchema>;

export const narrativeOutlineSchema = z.object({
  segments: z.array(narrativeSegmentSchema),
});
export type NarrativeOutline = z.infer<typeof narrativeOutlineSchema>;

/** Shape returned by `GET /runs/:id` — run + its artifacts + audit trail. */
export const runDetailSchema = runSchema.extend({
  assets: z.array(assetSchema),
  stepEvents: z.array(stepEventSchema),
  /**
   * Storyboard scenes + transcripts, null until the storyboard step lands.
   * For 15s runs this is the single storyboard's four scenes. For multi-segment
   * runs it is the concatenation of all N sheets' scenes (N×4), in segment
   * order; `segmentScenes` carries the same scenes grouped by segment for the UI.
   */
  scenes: z.array(sceneSchema).nullable(),
  /**
   * Multi-segment runs only: the N×4 scenes grouped by segment
   * (`[seg0[], seg1[], …]`), in `segment_index` order. Null for 15s (use `scenes`).
   */
  segmentScenes: z.array(z.array(sceneSchema)).nullable(),
  /**
   * Multi-segment runs only: the planned narrative arc (segment summaries), null
   * until the `narrative_outline` step lands (and always null for 15s).
   */
  narrativeOutline: narrativeOutlineSchema.nullable(),
  /**
   * 60s runs only: the locked visual-style bible (grade/lens/lighting/palette/
   * time-of-day arc) injected into all eight downstream prompts. Null until the
   * `narrative_outline` step lands (and always null for 15s).
   */
  visualStyle: z.string().nullable(),
});
export type RunDetail = z.infer<typeof runDetailSchema>;

/**
 * Payload to create a run. In F2 the images are handled out-of-band (the
 * mock only needs to know whether a person image was provided); F3 will
 * accept the actual files as multipart.
 */
export const createRunInputSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(2000),
  mode: modeSchema,
  aspectRatio: aspectRatioSchema,
  /** `15s` (default) or `60s`. FormData omits it on legacy clients → 15s. */
  duration: durationSchema.default("15s"),
  criticEnabled: z.boolean(),
  hasPersonImage: z.boolean(),
});
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

/**
 * Body for `POST /runs/:id/feedback` — the user's free-text reply at a
 * step-by-step gate. The single gate button always posts here: a BLANK message
 * means "continue", a non-blank one is classified (approve → continue, revise →
 * regenerate with this text threaded into the agent prompt).
 */
export const feedbackInputSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
