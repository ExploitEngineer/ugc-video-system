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
  pipelineSchema,
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
  /** Which generation pipeline this run uses — picked at creation, never changes. */
  pipeline: pipelineSchema,
  criticEnabled: z.boolean(),
  /** Whether a main on-screen character is generated for this run (Chunk 4). */
  characterEnabled: z.boolean(),
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
  /**
   * Detector outputs (populated in Chunk E, surfaced in Chunk K). `hooks` = the
   * resolved selection `{ visualLead, overlay }`. Null on legacy/pre-feature runs.
   */
  hooks: hookSelectionSchema.nullable(),
  adTypeConfidence: z.number().nullable(),
  detectorMeta: z.unknown().nullable(),
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
   * Optional ad-type override (Chunk J). `"auto"` (or omitted) = let the
   * detector classify; any other kebab id LOCKS the type (`ad_type_source` =
   * `"user"`). Validated as an open string; an unknown id resolves via the
   * registry fallback, never a hard reject.
   */
  adType: z.string().trim().optional(),
  /** Optional user-typed brand guidelines (tone, palette, wording, do/don'ts). */
  brandText: z.string().trim().max(4000).optional(),
  /** Which pipeline to run. Omitted/legacy clients default to `video`. */
  pipeline: pipelineSchema.default("video"),
  /**
   * Required when `pipeline === "template"` — OUR `templates.id` (a library
   * row), never Nexrender's own id. The route resolves the structure from that
   * row and derives `aspectRatio` from it; the requirement is conditional on
   * `pipeline`, so it is enforced in the handler rather than here.
   */
  templateId: z.string().uuid().optional(),
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

/**
 * Body for `POST /runs/:id/regenerate-video` — re-render the video clip(s) of a
 * finished or soft-failed (`awaiting_regen`) run, reusing the existing
 * storyboard + reference sheets (no image re-gen). `segmentIndex` targets ONE
 * clip of a multi-segment run (omitted = the 15s final clip, or ALL segments of
 * a multi run). `note` is an optional one-line steer ("less movement", "slower")
 * threaded into the video prompt.
 */
export const regenerateVideoInputSchema = z.object({
  segmentIndex: z.number().int().min(0).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type RegenerateVideoInput = z.infer<typeof regenerateVideoInputSchema>;

// ── Template pipeline: auto-discovered slots + the run's template snapshot ───
// An ADMIN uploads a template into a global library; we register it with
// Nexrender, introspect it via its v3 API, classify its layers into SLOTS, and
// render a cheap `preview: true` clip so users can see it before picking it.
// See `apps/api/src/agents/template/introspect.ts`.

/**
 * What an IMAGE slot is FOR, which decides whether the Image Agent may fill it.
 * A generated product photo dropped into a logo layer is wrong every time, so
 * this is computed by a deterministic name+geometry heuristic that acts as a
 * HARD GUARD — the plan LLM may only arbitrate slots left `content` by it, and
 * can never promote a `brand`/`decorative` slot.
 *
 *  - `content`    — a photographic slot the ad should fill (generate it)
 *  - `brand`      — logo / wordmark / icon / badge (never generate)
 *  - `decorative` — background / texture / gradient / overlay (never generate)
 */
export const imageSlotClassSchema = z.enum(["content", "brand", "decorative"]);
export type ImageSlotClass = z.infer<typeof imageSlotClassSchema>;

/** One slot discovered by introspection (a fill-in point in the template). */
export const templateSlotSchema = z.object({
  /** Which kind of content this layer expects / Nexrender asset family. */
  asset: z.enum(["VIDEO", "IMAGE", "AUDIO", "TEXT"]),
  /** The composition the target layer lives in (asset `composition`). */
  composition: z.string(),
  /** Display label — the discovered layer/placeholder name. */
  layerName: z.string(),
  /** The exact string to send as the render job's `layerName`. */
  jobLayerName: z.string(),
  /** TEXT only: the layer's current words (= its name), used as an AI hint. */
  currentText: z.string().optional(),
  /** VIDEO only: a placeholder precomp with no introspectable inner layer. */
  empty: z.boolean().optional(),
  /** How to inject: a normal asset, or an `nx:text-params-set` function asset. */
  injectVia: z.enum(["asset", "function"]),

  // ── Geometry, from the v3 layers response (previously discarded) ──
  /** Layer box width in px, when Nexrender reports it. */
  width: z.number().nullable().default(null),
  /** Layer box height in px, when Nexrender reports it. */
  height: z.number().nullable().default(null),
  /**
   * IMAGE only: whether the Image Agent may fill this slot. See
   * `imageSlotClassSchema`. Absent on non-image slots.
   */
  imageClass: imageSlotClassSchema.optional(),
  /**
   * TEXT only: how many characters this box can hold before it overflows the
   * designer's layout. Derived from the placeholder's own length and, when
   * geometry + font size are known, the box width. The copywriter treats this
   * as a hard ceiling rather than a vague "match the rough length".
   */
  charBudget: z.number().int().positive().optional(),
  /**
   * TEXT only: the layer's font family, IF Nexrender's opaque `data` bag
   * carries it (undocumented — probed defensively). We never SEND this back;
   * it exists so the plan agent knows how wide the copy will render. The
   * designer's own typography is always preserved.
   */
  font: z.string().optional(),
});
export type TemplateSlot = z.infer<typeof templateSlotSchema>;

/**
 * `POST /templates/register` response — no run required, registration is a
 * standalone step that happens before the ad brief is even filled in.
 */
export const templateRegisterResultSchema = z.object({
  nexrenderTemplateId: z.string(),
});
export type TemplateRegisterResult = z.infer<
  typeof templateRegisterResultSchema
>;

/** How many fillable slots of each kind a template has — drives the picker card. */
export const slotCountsSchema = z.object({
  video: z.number().int().nonnegative(),
  image: z.number().int().nonnegative(),
  text: z.number().int().nonnegative(),
  audio: z.number().int().nonnegative(),
});
export type SlotCounts = z.infer<typeof slotCountsSchema>;

/**
 * Composition-level facts derived from the introspected structure. This is the
 * surface the picker card, the run gate and the video agent all read.
 *
 * `clipSeconds` is the whole point of the v2 pipeline: the generated clip must
 * be as long as the template's video slot, not a fixed 15s. Seedance accepts
 * only `{4,5,6,8,10,12,15}`, so it is the smallest allowed value >= the comp's
 * duration, capped at 15 — snapping UP, never down, because a clip shorter than
 * its layer ends on a freeze frame while a longer one is simply trimmed by AE.
 */
export const templateMetadataSchema = z.object({
  /** Main composition duration in seconds, from the v3 compositions response. */
  durationSec: z.number().nullable().default(null),
  frameRate: z.number().nullable().default(null),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  /** Nearest Seedance-supported ratio for the composition (16:9 / 9:16). */
  aspectRatio: aspectRatioSchema.nullable().default(null),
  /** The Seedance clip length for this template. See the note above. */
  clipSeconds: z.number().int().min(4).max(15),
  /** True when the comp is longer than 15s → `nx:comp-duration-set` trims it. */
  trimComp: z.boolean().default(false),
  slotCounts: slotCountsSchema,
});
export type TemplateMetadata = z.infer<typeof templateMetadataSchema>;

/** The introspected structure of a registered template. */
export const templateStructureSchema = z.object({
  status: z.enum(["processing", "ready", "failed"]),
  /** The composition to render (put in the job's `template.composition`). */
  mainComposition: z.string().nullable(),
  /** Root/renderable comp names — informational only in v1 (no comp picker). */
  renderCompositions: z.array(z.string()).default([]),
  slots: z.array(templateSlotSchema),
  /** Pixel size of `mainComposition`, when Nexrender reports it. */
  mainCompositionWidth: z.number().nullable().default(null),
  mainCompositionHeight: z.number().nullable().default(null),
  /** Duration + frame rate of `mainComposition`, when Nexrender reports them. */
  mainCompositionDurationSec: z.number().nullable().default(null),
  mainCompositionFrameRate: z.number().nullable().default(null),
  /**
   * Derived from the composition's pixel dimensions (`deriveAspectRatio`),
   * server-computed so the frontend never re-implements the ratio logic. Null
   * when the dimensions are unknown — the run-creation form falls back to a
   * manual aspect-ratio pick in that case.
   */
  suggestedAspectRatio: aspectRatioSchema.nullable().default(null),
  /** Counts of ignored structure/control layers (shapes, solids, nulls…). */
  ignored: z.record(z.string(), z.number()).optional(),
  error: z.string().optional(),
});
export type TemplateStructure = z.infer<typeof templateStructureSchema>;

/**
 * The template snapshot stored on the run (`runs.template`) at creation time —
 * an immutable copy of the library row's structure + metadata, resolved
 * server-side from our `templateId` (a `templates.id` uuid, NOT the Nexrender
 * id) the moment the run is created. Every template step consumes this; the run
 * never re-queries Nexrender or the library for it.
 */
export const runTemplateSchema = z.object({
  /** Our library row id — what the client sends and what `use_count` tracks. */
  templateId: z.string(),
  /** Nexrender's own id — only the render provider ever sees this. */
  nexrenderTemplateId: z.string(),
  mainComposition: z.string(),
  renderCompositions: z.array(z.string()).default([]),
  slots: z.array(templateSlotSchema),
  compositionWidth: z.number().nullable(),
  compositionHeight: z.number().nullable(),
  metadata: templateMetadataSchema,
  displayName: z.string().optional(),
});
export type RunTemplate = z.infer<typeof runTemplateSchema>;

/**
 * One `template_fill`-resolved text value (`runs.template_text_fill`) — maps
 * back onto a `TemplateSlot` by `jobLayerName`.
 */
export const templateTextFillEntrySchema = z.object({
  jobLayerName: z.string(),
  value: z.string(),
});
export type TemplateTextFillEntry = z.infer<
  typeof templateTextFillEntrySchema
>;

// ── `template_plan` — the one plan every downstream agent reads ──────────────

/** What the plan decides for a single slot. */
export const templateSlotPlanSchema = z.object({
  jobLayerName: z.string().catch(""),
  asset: z.enum(["VIDEO", "IMAGE", "AUDIO", "TEXT"]),
  /** What this slot is FOR, in the ad's terms ("the headline", "the hero shot"). */
  role: z.string().catch(""),
  /** TEXT: what the copy should say, and why. */
  copyIntent: z.string().optional(),
  /** IMAGE: what the generated still should depict. Absent when `fill` is false. */
  imageSubject: z.string().optional(),
  /**
   * IMAGE: whether to generate this slot at all. The deterministic
   * `imageClass` heuristic already removed `brand`/`decorative` slots before
   * the model ever saw them, so this only arbitrates ambiguous `content` slots
   * (the `PH_2` / `Media_3` names that most real templates use).
   */
  fill: z.boolean().optional(),
  /** VIDEO: the hero scene the clip should show. */
  videoScene: z.string().optional(),
});
export type TemplateSlotPlan = z.infer<typeof templateSlotPlanSchema>;

/**
 * `runs.template_plan` — written by the `template_plan` step, read by the
 * storyboard, the copywriter, the image agent and the video agent. Its whole
 * job is to make those four describe the same ad.
 */
export const templatePlanSchema = z.object({
  conceptSummary: z.string().catch(""),
  slots: z.array(templateSlotPlanSchema).catch([]),
});
export type TemplatePlan = z.infer<typeof templatePlanSchema>;

// ── The template library (admin-curated, user-picked) ────────────────────────

/**
 * Lifecycle of a `templates` row, advanced by the preview worker. Text + CHECK
 * in the DB (not a pg enum), matching the `adType` / `errorCode` convention, so
 * new values never need a migration.
 */
export const templateStatusSchema = z.enum([
  "registering", // row inserted; registering with Nexrender + uploading bytes
  "introspecting", // polling v3 until `uploaded`, then building structure
  "previewing", // rendering the `preview: true` clip + poster frame
  "ready", // visible in the picker
  "failed", // see `error`; the admin can retry
]);
export type TemplateStatus = z.infer<typeof templateStatusSchema>;

/** `GET /templates` and `GET /templates/:id` — what the picker renders. */
export const templateSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  status: templateStatusSchema,
  durationSec: z.number().nullable(),
  clipSeconds: z.number().int().nullable(),
  aspectRatio: aspectRatioSchema.nullable(),
  slotCounts: slotCountsSchema.nullable(),
  previewVideoUrl: z.string().nullable(),
  previewPosterUrl: z.string().nullable(),
  useCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;

/**
 * The admin view. Adds the introspected slots + the failure reason. NEVER
 * returned from the public routes — `nexrenderTemplateId` and storage paths
 * stay server-side.
 */
export const templateAdminSchema = templateSummarySchema.extend({
  nexrenderTemplateId: z.string(),
  slots: z.array(templateSlotSchema).default([]),
  metadata: templateMetadataSchema.nullable(),
  previewSource: z.enum(["auto", "admin"]).nullable(),
  error: z.string().nullable(),
  archivedAt: z.string().nullable(),
});
export type TemplateAdmin = z.infer<typeof templateAdminSchema>;

/** `PATCH /admin/templates/:id`. */
export const templateUpdateInputSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});
export type TemplateUpdateInput = z.infer<typeof templateUpdateInputSchema>;
