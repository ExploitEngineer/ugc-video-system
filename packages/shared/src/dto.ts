// API DTO schemas — the wire shapes exchanged between `web` and `api`.
// Built on the canonical enums (single source of truth) in `./enums`.
// Mirrors the data model in SPEC.md §5; the F2 mock and the F3 Hono API
// both return these shapes, so the frontend never changes when the real
// backend lands.

import { z } from "zod";
import {
  adTypeSchema,
  assetKindSchema,
  modeSchema,
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
  criticEnabled: z.boolean(),
  status: runStatusSchema,
  currentStep: stepSchema,
  error: z.string().nullable(),
  /** Pending step-by-step feedback message, consumed by the next regen. */
  feedback: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Run = z.infer<typeof runSchema>;

/**
 * One planned storyboard scene — the script for ~3-4s of the ad. `transcript`
 * is the spoken line for the scene (UGC review line or voiceover narration).
 */
export const sceneSchema = z.object({
  index: z.number(),
  cameraAngle: z.string(),
  actionMovement: z.string(),
  sceneDescription: z.string(),
  transcript: z.string(),
  adStyle: z.string(),
});
export type Scene = z.infer<typeof sceneSchema>;

/** Shape returned by `GET /runs/:id` — run + its artifacts + audit trail. */
export const runDetailSchema = runSchema.extend({
  assets: z.array(assetSchema),
  stepEvents: z.array(stepEventSchema),
  /** Storyboard scenes + transcripts, null until the storyboard step lands. */
  scenes: z.array(sceneSchema).nullable(),
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
  criticEnabled: z.boolean(),
  hasPersonImage: z.boolean(),
});
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

/**
 * Body for `POST /runs/:id/feedback` — the user's free-text reply at a
 * step-by-step gate. The API classifies it (approve → continue, revise →
 * regenerate with this text threaded into the agent prompt).
 */
export const feedbackInputSchema = z.object({
  message: z.string().trim().min(1, "Feedback is required").max(2000),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
