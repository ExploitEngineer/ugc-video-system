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
  /**
   * `pipeline: "template"` only — the library template this ad is composited
   * into. Unlike `pipeline`, this CAN change after creation: `POST
   * /runs/:id/retemplate` swaps it and re-composites the same video.
   * Null on a `video`-pipeline run, and on a template run whose template row was
   * later deleted (`ON DELETE SET NULL`).
   */
  templateId: z.string().nullable(),
  /** The template's display name, read off the run's immutable snapshot. */
  templateName: z.string().nullable(),
  /**
   * A re-template is in flight: the worker is re-running `template_plan →
   * template_fill → template_images → template_render` against a NEW template,
   * reusing the reference sheets, the storyboard and the 15s master clip.
   *
   * The timeline needs this. Step events are append-only, so without it a run
   * mid-re-template is indistinguishable from a fresh one: the reference sheets'
   * old `started` rows read as "Generating" and the four re-running steps read
   * as "Passed" before they run. Cleared when `template_render` lands.
   */
  retemplating: z.boolean().default(false),
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
/**
 * Who speaks a scene's `transcript`, and in what voice. `role` doubles as the
 * per-line key the video prompt uses ("the woman"); `voice` is one frozen
 * descriptor, reused verbatim across a merged ad's segments so a character's
 * voice cannot drift between them.
 */
export const speakerSchema = z.object({
  id: z.string().catch(""),
  role: z.string().catch(""),
  voice: z.string().catch(""),
});
export type Speaker = z.infer<typeof speakerSchema>;

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
  // BOTH modifiers are load-bearing. `.optional()` — every row written before
  // speaker identity existed has no speaker, and `parseScenes` returns null for
  // the WHOLE array on any parse failure, so requiring it would blank the script
  // panel of every past run. `.catch(undefined)` — a malformed speaker degrades
  // this one field instead of nulling the array with it.
  speaker: speakerSchema.optional().catch(undefined),
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

/**
 * Body for `POST /runs/:id/retemplate` — composite the ad's EXISTING video into
 * a different template. The reference sheets, the storyboard and the 15s master
 * clip are template-independent and are reused; only the plan, the copy, the
 * stills and the composite are re-derived for the new slots.
 *
 * The new template must have the same aspect ratio as the run: the master was
 * shot in the original template's shape.
 */
export const retemplateInputSchema = z.object({
  templateId: z.string().uuid(),
});
export type RetemplateInput = z.infer<typeof retemplateInputSchema>;

// ── Template pipeline: auto-discovered slots + the run's template snapshot ───
// An ADMIN uploads a template into a global library; we register it with
// Nexrender, introspect it via its v3 API, classify its layers into SLOTS, and
// render its own placeholder content once so users can see it before picking it.
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
/**
 * One placement of a placeholder in the render tree. A designer often re-uses the
 * SAME placeholder comp in several scenes (or twice in a split-screen), so each
 * copy is a separate layer that must be targeted individually.
 */
export const templateSlotInstanceSchema = z.object({
  composition: z.string(),
  jobLayerName: z.string(),
  targetBy: z.enum(["name", "index"]).default("name"),
  layerIndex: z.number().int().positive().nullable().default(null),
});
export type TemplateSlotInstance = z.infer<typeof templateSlotInstanceSchema>;

export const templateSlotSchema = z.object({
  /** Which kind of content this layer expects / Nexrender asset family. */
  asset: z.enum(["VIDEO", "IMAGE", "AUDIO", "TEXT"]),
  /** The composition the target layer lives in (asset `composition`). */
  composition: z.string(),
  /** Display label — the discovered layer/placeholder name. */
  layerName: z.string(),
  /**
   * Stable key for this slot: what the plan, the copywriter and the image agent
   * all address it by, and the `layerName` a render job sends when `targetBy` is
   * `"name"`. Not necessarily the layer's real name — see `targetBy`.
   */
  jobLayerName: z.string(),
  /**
   * How a render job addresses this layer.
   *
   * `"name"` when the designer gave the layer a name (always true of text
   * layers, which After Effects names after their own words).
   *
   * `"index"` when they did not. An unnamed footage layer stores an empty name
   * and After Effects merely DISPLAYS its source's name, which is what Nexrender
   * reports — aiming a media asset at that name fails outright. Such a layer can
   * only be reached by its stacking position, and `nx:layer-autoscale` cannot
   * touch it (that function takes a `layerName` and nothing else).
   */
  targetBy: z.enum(["name", "index"]).default("name"),
  /** 1-based stacking index, from the project file. Required by `targetBy: "index"`. */
  layerIndex: z.number().int().positive().nullable().default(null),
  /** TEXT only: the layer's current words (= its name), used as an AI hint. */
  currentText: z.string().optional(),
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
   * designer's layout. Derived from the placeholder the designer typed, which is
   * the only trustworthy signal — a split-text layer's box is far wider than its
   * glyphs. The copywriter treats this as a hard ceiling rather than a vague
   * "match the rough length".
   */
  charBudget: z.number().int().positive().optional(),

  // ── Position on the main composition's timeline (`agents/template/timeline.ts`) ──
  /**
   * Seconds into the main composition where this slot first appears, resolved
   * through the whole nesting chain. Null when the layer's window could not be
   * resolved (an older snapshot, or a comp nothing places).
   */
  startSec: z.number().nonnegative().nullable().default(null),
  /**
   * VIDEO only: how long the slot is actually on screen.
   *
   * NOT the placeholder composition's own `duration` — a designer's empty `PH_2`
   * comp routinely reports 60 seconds while the scene that places it is visible
   * for 2.3. This is the resolved window, and it is what lets a 4-scene template
   * receive four DIFFERENT slices of one 15s master rather than the same opening
   * seconds four times.
   */
  durationSec: z.number().positive().nullable().default(null),
  /**
   * VIDEO placeholder only: EVERY placement of this placeholder in the render
   * tree, each independently targeted. A single (composition, layerIndex) fills
   * only ONE copy, so a placeholder re-used across scenes (or a split-screen)
   * leaves the other copies showing the template's own solid (the blue block).
   * At render every instance gets the SAME slot media, so all copies fill. Absent
   * on older snapshots / genuinely single-instance slots — the top-level
   * (composition, targetBy, layerIndex) is then used directly.
   */
  instances: z.array(templateSlotInstanceSchema).optional(),
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
 * surface the picker card and the run gate read.
 *
 * NOTE what is NOT here. There is no `clipSeconds` and no `trimComp`. Every
 * template run generates ONE 15-second master clip, which is then cut into a
 * slice per video slot (`agents/template/slices.ts`). The composition keeps its
 * full length, so a 30s template renders 30 seconds and its graphics fill the
 * rest of the timeline — nothing is ever trimmed to fit the footage.
 */
export const templateMetadataSchema = z.object({
  /**
   * The template's REAL length — how long the rendered ad actually runs. This is
   * the one number every step reads (beats, segments, slices, the crop).
   *
   * NOT simply the composition's `duration` property. After Effects renders a
   * comp's WORK AREA, and the v3 compositions response has no work-area field, so
   * `duration` is arbitrary: one real template's `Main_Comp` reports 30.97s and
   * renders 21.0s, while sibling comps in the same file claim 3600s and 90.97s.
   * Believing it generated a 36s master for a 21s ad — ~40% of the video spend
   * discarded, and every slice cut from the wrong second.
   *
   * So it is MEASURED off the template's own preview render (which is that same
   * composition rendered with no assets, i.e. the template's own output), falling
   * back to the composition's number when no measurement exists.
   */
  durationSec: z.number().nullable().default(null),
  /** The measured value, when we have one — provenance for `durationSec`. */
  measuredDurationSec: z.number().nullable().optional(),
  /** Where `durationSec` came from. Absent on rows predating the measurement. */
  durationSource: z.enum(["measured", "composition"]).optional(),
  frameRate: z.number().nullable().default(null),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  /** Nearest Seedance-supported ratio for the composition (16:9 / 9:16). */
  aspectRatio: aspectRatioSchema.nullable().default(null),
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
  /** VIDEO: one camera move (or a hold) for this slot's beat. Vision analysis. */
  cameraAction: z.string().optional(),
  /** VIDEO: what visibly happens on screen during this slot's window. Vision analysis. */
  onScreenMoment: z.string().optional(),
});
export type TemplateSlotPlan = z.infer<typeof templateSlotPlanSchema>;

/**
 * Who owns the ad's on-screen text. When the template has TEXT layers it owns
 * them, and the generated footage must be CLEAN (no baked text/logos/end-cards);
 * a template with none may let the footage carry copy. Decided by the vision
 * analysis; defaults keep footage clean, which is the safe choice.
 */
export const templateOnScreenTextSchema = z.object({
  owner: z.enum(["template", "video", "none"]).catch("template"),
  requireCleanFootage: z.boolean().catch(true),
});
export type TemplateOnScreenText = z.infer<typeof templateOnScreenTextSchema>;

/**
 * A light audio plan. Audio ownership (template's own track vs Seedance's
 * generated audio) is DEFERRED — for now Seedance's audio is always used, so
 * this only carries what the voiceover should convey and how it should sound.
 */
export const templateAudioPlanSchema = z.object({
  voiceover: z.string().catch(""),
  tone: z.string().catch(""),
});
export type TemplateAudioPlan = z.infer<typeof templateAudioPlanSchema>;

/**
 * `runs.template_plan` — written by the `template_plan` step, read by the
 * storyboard, the copywriter, the image agent and the video agent. Its whole
 * job is to make those four describe the same ad.
 */
export const templatePlanSchema = z.object({
  conceptSummary: z.string().catch(""),
  slots: z.array(templateSlotPlanSchema).catch([]),
  /**
   * The template's LOOK read from its frames — palette, lighting, mood, pacing,
   * motion — as one look-bible string. Injected as the shared look into the
   * keyframe, the stills and the clip so they match the template. Absent on a
   * text-only (pre-vision) plan. Persisted here AND mirrored to `runs.visual_style`
   * so `ctx.visualStyle` carries it downstream.
   */
  visualStyle: z.string().optional(),
  /** Who owns on-screen text (drives clean-footage). Absent ⇒ default clean. */
  onScreenText: templateOnScreenTextSchema.optional(),
  /** Light audio intent for the generated voiceover. */
  audio: templateAudioPlanSchema.optional(),
  /**
   * Which analysis path produced this plan — for provenance/debugging. `text-only`
   * = no vision (no preview to see); `poster` / `poster+frames` = Claude vision;
   * `video` = the deferred Gemini path.
   */
  visionSource: z
    .enum(["text-only", "poster", "poster+frames", "video"])
    .optional(),
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
  /** The composition's real length — what the finished ad will run for. */
  durationSec: z.number().nullable(),
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
