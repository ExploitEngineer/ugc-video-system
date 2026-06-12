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
 * The first six are the ~15s pipeline. The last four are the 60s pipeline
 * (`duration === "60s"`): `narrative_outline` plans the four segment summaries,
 * then `segment_storyboard`/`segment_video` are single steps that fan out over
 * the four segments internally (the "which segment" dimension lives in the
 * `segment_index` artifact columns, not in this enum), and `merge` concatenates
 * the four clips into the final 60s video. A 15s run never emits the last four.
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
 * AND the merged 60s output; `segment_video` is one of the four 15s segment
 * clips of a 60s run. `storyboard_master` is the 60s single 16-panel (4×4)
 * sheet; its four cropped row strips are persisted as `storyboard_sheet`
 * (`segment_index` 0..3), the same kind a 15s run's single sheet uses.
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
 * Target length of the final ad, chosen by the user at run creation.
 * `15s` (default) — the original single-storyboard, single-clip pipeline.
 * `60s` — four storyboard sheets → four 15s clips → merged into one 60s video.
 */
export const durationSchema = z.enum(["15s", "60s"]);
export type Duration = z.infer<typeof durationSchema>;
