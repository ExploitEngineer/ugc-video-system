// API DTO schemas — the wire shapes exchanged between `web` and `api`.
// Built on the canonical enums (single source of truth) in `./enums`.
// Mirrors the data model in SPEC.md §5; the F2 mock and the F3 Hono API
// both return these shapes, so the frontend never changes when the real
// backend lands.

import { z } from "zod";
import {
  adTypeIdSchema,
  adTypeSourceSchema,
  aspectRatioSchema,
  assetKindSchema,
  durationSchema,
  modeSchema,
  runErrorCodeSchema,
  runStatusSchema,
  stepSchema,
} from "./enums";

/** Max length of the brand-guidelines text (typed or parsed). Kept short: the
 * typed field is for quick notes — detail belongs in an uploaded file, which is
 * condensed to fit this same bound. Shared so the client counter/cap and the
 * server Zod bound never drift. */
export const BRAND_MAX = 1500;

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

// ── Detector output (interpretAdStyle) ──────────────────────────────────────
// The single-call ad-type + hook detector returns this shape. It is validated
// by `parseJsonObject(reply, adStylePlanSchema)` in the agent. Because the
// reasoning backend is Claude (no strict JSON-schema mode), the schema is
// deliberately FORGIVING — every field has a `.catch` default so a slightly-off
// reply degrades to a safe default instead of failing the whole parse; the
// registry clamp + reconcile (api `ad-types/reconcile.ts`) own correctness.

/** Hook role in the resolved opening — visual_lead owns frame 1, overlay layers a line/text on it. */
export const hookRoleSchema = z.enum(["visual_lead", "overlay"]);
export type HookRole = z.infer<typeof hookRoleSchema>;

/** What the PROMPT TEXT implies about an asset, independent of what was uploaded. */
export const intentSignalSchema = z.enum(["implied", "absent", "unclear"]);
export type IntentSignal = z.infer<typeof intentSignalSchema>;

/** One hook the detector picked, with the role hint it assigned (re-derived in compose). */
export const detectedHookSchema = z.object({
  id: z.string(),
  role: hookRoleSchema.catch("overlay"),
});

export const assetIntentSchema = z.object({
  product: intentSignalSchema.catch("unclear"),
  person: intentSignalSchema.catch("unclear"),
});
export type AssetIntent = z.infer<typeof assetIntentSchema>;

/**
 * The detector's output. Reasoning-first key order (adStyle/rationale BEFORE the
 * discrete adType/hooks/confidence) so the model reasons before committing.
 */
export const adStylePlanSchema = z.object({
  adStyle: z.string().catch(""),
  rationale: z.string().catch("").optional(),
  adType: z.string().catch(""),
  hooks: z.array(detectedHookSchema).catch([]),
  confidence: z.coerce.number().catch(0),
  assetIntent: assetIntentSchema.catch({
    product: "unclear",
    person: "unclear",
  }),
  /**
   * Near-miss disambiguation (Fix 9): the top-2 candidate ad-type ids, recorded
   * when confidence is low so the close call is visible in detector_meta.
   */
  topCandidates: z.array(z.string()).catch([]),
  /**
   * Values the model invented for unresolved bracket placeholders (Fix 8) — e.g.
   * a brand name, price, URL or statistic the prompt left as a slot. Surfaced in
   * detector_meta so a fabricated figure is never silently rendered as fact.
   */
  inventedValues: z.array(z.string()).catch([]),
});
export type AdStylePlan = z.infer<typeof adStylePlanSchema>;

/** A resolved hook (post-compose): id + role + its opening directive. */
export const resolvedHookSchema = z.object({
  id: z.string(),
  role: hookRoleSchema.catch("overlay"),
  openingDirective: z.string().catch(""),
});
export type ResolvedHook = z.infer<typeof resolvedHookSchema>;

/** The resolved hook selection persisted to `runs.hooks` and surfaced in RunDetail. */
export const hookSelectionSchema = z.object({
  visualLead: resolvedHookSchema,
  overlay: resolvedHookSchema.nullable(),
});
export type HookSelectionDto = z.infer<typeof hookSelectionSchema>;

/** A generation job — the authoritative state machine row. */
export const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  adStyle: z.string(),
  /** OPEN ad-type id (kebab). Legacy rows are `ugc`/`inspirational`. */
  adType: adTypeIdSchema,
  /** Whether `adType` was auto-detected or a user dropdown pick; null = legacy. */
  adTypeSource: adTypeSourceSchema.nullable(),
  mode: modeSchema,
  aspectRatio: aspectRatioSchema,
  /** Target ad length — `15s` (single clip) or `30/45/60s` (N merged clips). */
  duration: durationSchema,
  criticEnabled: z.boolean(),
  /** Whether a main on-screen character is generated for this run (Chunk 4). */
  characterEnabled: z.boolean(),
  /**
   * Whether this run uses the interactive Plainly pre-merge stage: after the
   * segment clips it pauses at `awaiting_edit` for the user to assemble/brand via
   * a Plainly template (else the ffmpeg merge runs as before). Multi-segment only.
   */
  plainlyEnabled: z.boolean().default(false),
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

/** One Plainly render attempt recorded on `runs.plainly_edit.renders`. */
export const plainlyRenderRecordSchema = z.object({
  renderId: z.string(),
  /** Raw Plainly state at the time recorded (PENDING | … | DONE | ERROR). */
  state: z.string(),
  /** Plainly's (expiring) output URL, if the render finished. */
  outputUrl: z.string().optional(),
  createdAt: z.string().optional(),
});
export type PlainlyRenderRecord = z.infer<typeof plainlyRenderRecordSchema>;

/** One branded segment recorded on `runs.plainly_edit.segments[segmentIndex]`. */
export const plainlySegmentEditSchema = z.object({
  segmentIndex: z.number().int(),
  renderId: z.string(),
  projectId: z.string(),
  templateId: z.string(),
  params: z.record(z.string(), z.string()).default({}),
  /** The re-hosted branded clip asset that replaced this segment. */
  assetId: z.string().optional(),
  /** Whether the original clip voice was muted before this render (the user's
   *  "original voice off" choice) — persisted so re-branding restores the toggle. */
  muteClipAudio: z.boolean().optional(),
});
export type PlainlySegmentEdit = z.infer<typeof plainlySegmentEditSchema>;

/**
 * The per-run Plainly editing state persisted to `runs.plainly_edit`. In the
 * per-clip model the user brands individual segments before the final merge:
 * `segments` is keyed by segmentIndex → the branding applied to that clip. The
 * render history lives in `renders`. (`projectId`/`templateId`/`params`/
 * `acceptedRenderId` are retained for back-compat with the earlier single-clip
 * flow.) All optional — null until the user starts the Plainly stage.
 */
export const plainlyEditSchema = z.object({
  projectId: z.string().optional(),
  templateId: z.string().optional(),
  params: z.record(z.string(), z.string()).default({}),
  renders: z.array(plainlyRenderRecordSchema).default([]),
  acceptedRenderId: z.string().optional(),
  /** Per-clip branding, keyed by segmentIndex (as a string). */
  segments: z.record(z.string(), plainlySegmentEditSchema).default({}),
});
export type PlainlyEdit = z.infer<typeof plainlyEditSchema>;

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
  /**
   * Detector outputs (populated in Chunk E, surfaced in Chunk K). `hooks` = the
   * resolved selection `{ visualLead, overlay }`. Null on legacy/pre-feature runs.
   */
  hooks: hookSelectionSchema.nullable(),
  adTypeConfidence: z.number().nullable(),
  detectorMeta: z.unknown().nullable(),
  /**
   * Per-run Plainly editing state (chosen template, assembled params, render
   * history, accepted render). Null until the user starts the Plainly stage, and
   * always null when `plainlyEnabled` is false.
   */
  plainlyEdit: plainlyEditSchema.nullable(),
  /** The user-typed brand guidelines (tone/palette/wording/do's), null when not set. */
  brandText: z.string().nullable(),
  /** Registry display name for the resolved `adType` (server-mapped) — for the chip. */
  adTypeDisplayName: z.string(),
  /** The resolved ad type's look family (server-mapped) — drives the spoken/voiceover label. */
  lookFamily: z.string(),
  /**
   * Reference steps the backend will NOT run for this run — deterministic from
   * the resolved ad type's asset policy + which images were uploaded (a product
   * sheet only comes from an upload; a person sheet only when uploaded OR
   * required). The timeline renders these as "Skipped" immediately instead of
   * flashing "Generating" during the parallel reference phase.
   */
  skippedSteps: z.array(stepSchema).default([]),
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
  /**
   * Character On/Off toggle (Chunk 4): whether ONE main on-screen character is
   * generated — uploaded if provided, else SYNTHESIZED even with no upload.
   * Optional on the wire; the create-run route defaults it from the picked
   * ad-type's `characterDefault`. Drives `willGeneratePerson`, replacing the old
   * person-REQUIRED gate.
   */
  characterEnabled: z.boolean().optional(),
  /**
   * Whether to use the interactive Plainly pre-merge stage for this run. The
   * create-run route only honors it for multi-segment runs when the server has
   * a Plainly API key configured; otherwise it's forced off.
   */
  plainlyEnabled: z.boolean().optional(),
  /**
   * Optional ad-type override (Chunk J). `"auto"` (or omitted) = let the
   * detector classify; any other kebab id LOCKS the type (`ad_type_source` =
   * `"user"`). Validated as an open string; an unknown id resolves via the
   * registry fallback, never a hard reject.
   */
  adType: z.string().trim().optional(),
  /** Optional user-typed brand guidelines (tone, palette, wording, do/don'ts). */
  brandText: z.string().trim().max(BRAND_MAX).optional(),
});
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

/** One ad-type the create-form dropdown offers (GET /ad-types). */
export const adTypeMenuItemSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  whenToUse: z.string(),
  assetPolicy: z.object({
    product: z.enum(["required", "optional", "forbidden"]),
    person: z.enum(["required", "optional", "forbidden"]),
  }),
  /** Default state of the Character On/Off toggle when this type is picked. */
  characterDefault: z.boolean(),
});
export type AdTypeMenuItem = z.infer<typeof adTypeMenuItemSchema>;

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
