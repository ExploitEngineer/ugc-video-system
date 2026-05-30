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

/** Discrete pipeline units (`runs.currentStep`, `step_events.step`). */
export const stepSchema = z.enum([
  "product_sheet",
  "person_sheet",
  "product_inspection",
  "storyboard",
  "storyboard_inspection",
  "video",
]);
export type Step = z.infer<typeof stepSchema>;

/** Kind of stored file (`assets.kind`). */
export const assetKindSchema = z.enum([
  "product_upload",
  "person_upload",
  "product_sheet",
  "person_sheet",
  "storyboard_sheet",
  "final_video",
]);
export type AssetKind = z.infer<typeof assetKindSchema>;

/** Run mode — controls step gating, not the Critic auto-checks. */
export const modeSchema = z.enum(["automatic", "confirm"]);
export type Mode = z.infer<typeof modeSchema>;

/** Approval state of a generated artifact (sheets, video). */
export const artifactStatusSchema = z.enum(["draft", "approved", "rejected"]);
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;
