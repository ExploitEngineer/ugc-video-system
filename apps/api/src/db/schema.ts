// Drizzle schema — Supabase Postgres. Mirrors SPEC.md §5 data model.
//
// Pipeline shape: a `project` owns `runs`; each run produces `assets`
// (uploads + generated files) and emits `step_events` (audit trail).
// The four artifact tables (`product_reference_sheets`,
// `person_reference_sheets`, `storyboard_sheets`, `videos`) hold the
// structured output of each pipeline step and point at their `asset`.
//
// Enums are native Postgres enum types whose values are pulled straight
// from the shared Zod enums (`@ugc/shared`) so the DB and the app can
// never drift. Free-form status fields use text + CHECK instead.
//
// RLS is enabled on every table with NO policies — auth lands in F8, so
// for now the service-role API/worker (which bypasses RLS) is the only
// thing that may touch these rows; the public anon key gets zero access.

import type {
  ArtifactStatus,
  AspectRatio,
  AssetKind,
  Duration,
  Mode,
  Pipeline,
  RunStatus,
  Step,
} from "@ugc/shared";
import {
  aspectRatioSchema,
  assetKindSchema,
  artifactStatusSchema,
  durationSchema,
  modeSchema,
  pipelineSchema,
  runStatusSchema,
  stepSchema,
} from "@ugc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums (native pg types, values sourced from @ugc/shared) ──────────

// `.options` is a plain array at the type level; cast to a non-empty
// tuple of the shared literal union so pgEnum keeps the precise types.
export const runStatusEnum = pgEnum(
  "run_status",
  runStatusSchema.options as [RunStatus, ...RunStatus[]],
);
export const stepEnum = pgEnum(
  "step",
  stepSchema.options as [Step, ...Step[]],
);
export const assetKindEnum = pgEnum(
  "asset_kind",
  assetKindSchema.options as [AssetKind, ...AssetKind[]],
);
export const modeEnum = pgEnum(
  "mode",
  modeSchema.options as [Mode, ...Mode[]],
);
export const aspectRatioEnum = pgEnum(
  "aspect_ratio",
  aspectRatioSchema.options as [AspectRatio, ...AspectRatio[]],
);
export const artifactStatusEnum = pgEnum(
  "artifact_status",
  artifactStatusSchema.options as [ArtifactStatus, ...ArtifactStatus[]],
);
export const durationEnum = pgEnum(
  "duration",
  durationSchema.options as [Duration, ...Duration[]],
);
export const pipelineEnum = pgEnum(
  "pipeline",
  pipelineSchema.options as [Pipeline, ...Pipeline[]],
);

// ── Core tables ───────────────────────────────────────────────────────

/** A user's workspace for ad-video generation. `ownerId` stays null until Auth (F8). */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id"), // null until F8
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

/**
 * The admin-curated template library. One row per After Effects template
 * uploaded to Nexrender Cloud.
 *
 * Users never upload here — they PICK from this table (`GET /templates`), which
 * is why every row carries a rendered `preview_video_url`: Nexrender exposes no
 * thumbnail endpoint, so a cheap `preview: true` render of the template's own
 * placeholder content is the only way to show a user what they are choosing.
 * A preview belongs to no run, and `assets.run_id` is NOT NULL, so preview
 * files live under their own `templates/{id}/…` storage prefix and their URLs
 * are columns here rather than `assets` rows.
 *
 * `status`/`locked_at`/`locked_by` deliberately mirror `runs` so the preview
 * worker reuses the same claim / heartbeat / stale-reclaim pattern as the run
 * worker. Advanced by `registering → introspecting → previewing → ready`.
 */
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(), // clients pick by THIS, never the nexrender id
    nexrenderTemplateId: text("nexrender_template_id"), // null until registration succeeds
    contentHash: text("content_hash").notNull(), // sha256 of the uploaded bytes — dedupes a re-upload of the same file
    sourceType: text("source_type").notNull(), // aep | zip | mogrt
    sourceFilename: text("source_filename").notNull(),

    displayName: text("display_name").notNull(),
    description: text("description"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),

    status: text("status").notNull().default("registering"), // TemplateStatus — text + CHECK so new values need no enum migration
    structure: jsonb("structure"), // TemplateStructure — slots[], comps, dims, duration, frame rate
    metadata: jsonb("metadata"), // TemplateMetadata — durationSec, frameRate, aspectRatio, clipSeconds, trimComp, slotCounts

    previewVideoUrl: text("preview_video_url"),
    previewVideoPath: text("preview_video_path"), // Supabase Storage object path (internal)
    previewPosterUrl: text("preview_poster_url"),
    previewPosterPath: text("preview_poster_path"),
    previewJobId: text("preview_job_id"), // persisted BEFORE polling so a crash never resubmits a paid render
    previewSource: text("preview_source"), // "auto" (nexrender preview render) | "admin" (hand-uploaded override)

    error: text("error"), // failure reason, surfaced in the admin console
    useCount: integer("use_count").notNull().default(0), // incremented at run creation; powers "popular" sort

    lockedAt: timestamp("locked_at", { withTimezone: true }), // preview-worker lock
    lockedBy: text("locked_by"), // preview-worker fencing token
    archivedAt: timestamp("archived_at", { withTimezone: true }), // soft delete — hides from the picker, frees the content hash

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Dedupe re-uploads of an identical file, but only among LIVE rows: archiving
    // a template must free its hash so the same file can be re-added later.
    uniqueIndex("templates_content_hash_uq")
      .on(t.contentHash)
      .where(sql`${t.archivedAt} is null`),
    index("templates_status_idx").on(t.status), // the preview worker polls by status
    // The picker's hot path: every listed template is ready + unarchived.
    index("templates_ready_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'ready' and ${t.archivedAt} is null`),
    index("templates_tags_idx").using("gin", t.tags),
    check(
      "templates_status_check",
      sql`${t.status} in ('registering', 'introspecting', 'previewing', 'ready', 'failed')`,
    ),
    check(
      "templates_source_type_check",
      sql`${t.sourceType} in ('aep', 'zip', 'mogrt')`,
    ),
    check(
      "templates_preview_source_check",
      sql`${t.previewSource} is null or ${t.previewSource} in ('auto', 'admin')`,
    ),
  ],
).enableRLS();

/** One generation job — the authoritative state machine for the pipeline. */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(), // raw user prompt
    adStyle: text("ad_style"), // interpreted style propagated to agents
    adType: text("ad_type"), // OPEN kebab id (was a pg enum) — text so new ad types need no migration; resolved via the ad-type registry (Chunk C)
    adTypeSource: text("ad_type_source"), // "auto" (detected) | "user" (explicit dropdown pick); null = pre-feature/legacy
    hooks: jsonb("hooks"), // resolved hook selection { visualLead, overlay }, set by the detector (Chunk E)
    adTypeConfidence: real("ad_type_confidence"), // detector self-reported 0–1 confidence (coarse gate only)
    detectorMeta: jsonb("detector_meta"), // detector rationale + assetIntent (debug/telemetry)
    personBrief: text("person_brief"), // product-derived person/wardrobe brief; drives the (parallel) person sheet
    productBrief: text("product_brief"), // factual product identity anchor (category/materials/colors/markings); threaded to storyboard + critic
    productUse: jsonb("product_use"), // causal use-sequence {accessVerb,changedState,persistenceCue,functionSignal,useVerb}; baked into the storyboard still
    creativeBrief: jsonb("creative_brief"), // service-ad only: creative-director brief { concept, framework, hook, cast, scenes, cta } — multi-scene plan with no product/person upload
    brandText: text("brand_text"), // optional user-typed brand guidelines (tone, palette, do/don'ts), injected into the prompts
    brandGuidelines: jsonb("brand_guidelines"), // optional structured brand kit extracted from an uploaded brand file (5b); injected alongside brand_text
    mode: modeEnum("mode").notNull(),
    aspectRatio: aspectRatioEnum("aspect_ratio").notNull().default("16:9"), // output shape, propagated to sheets + video
    duration: durationEnum("duration").notNull().default("15s"), // 15s single-clip pipeline | 60s four-clip merged pipeline
    pipeline: pipelineEnum("pipeline").notNull().default("video"), // "video" (normal, unchanged) | "template" (Nexrender template, picked at creation — see the template_* columns below)
    narrativeOutline: jsonb("narrative_outline"), // 60s only: { segments: [{ index, beat, summary }], visualStyle } — continuity arc planned before any storyboard
    visualStyle: text("visual_style"), // 60s only: locked visual-style bible (grade/lens/lighting/palette/time-of-day arc), injected verbatim into all 4 storyboard + 4 video prompts
    criticEnabled: boolean("critic_enabled").notNull().default(false), // Critic parked — off by default
    characterEnabled: boolean("character_enabled").notNull().default(true), // Chunk 4 toggle: generate ONE main on-screen character (uploaded or synthesized). The create-run route sets it explicitly from the ad-type's characterDefault; this column default only covers direct inserts.
    supportingCast: jsonb("supporting_cast"), // Chunk 4b: text-only supporting roles [{ role, appearance }] planned from the prompt, woven into storyboard + video prompts (no extra reference sheets)
    status: runStatusEnum("status").notNull().default("queued"),
    currentStep: stepEnum("current_step"),
    error: text("error"), // user-facing failure sentence (raw detail stays in logs/step_events)
    errorCode: text("error_code"), // RunErrorCode — plain text so new codes need no enum migration; Zod-validated at the mapper
    feedback: text("feedback"), // pending step-by-step feedback, consumed by next regen
    templateId: uuid("template_id").references(() => templates.id, {
      onDelete: "set null",
    }), // pipeline:"template" only — the library row this run picked. SET NULL (not cascade): archiving/deleting a template must never delete the ads made with it.
    template: jsonb("template"), // pipeline:"template" only — immutable snapshot resolved server-side at run creation: RunTemplate { templateId, nexrenderTemplateId, mainComposition, renderCompositions, slots[], compositionWidth, compositionHeight, metadata, displayName? }
    templatePlan: jsonb("template_plan"), // TemplatePlan { conceptSummary, slots[] } — written by the template_plan step, read by the storyboard, copywriter, image and video agents so all four describe the same ad
    templateTextFill: jsonb("template_text_fill"), // TemplateTextFillEntry[] { jobLayerName, value } — written by the template_fill step (LLM), consumed by template_render
    nexrenderJobId: text("nexrender_job_id"), // Nexrender Cloud job id — persisted on submit for idempotent resume/poll of template_render
    lockedAt: timestamp("locked_at", { withTimezone: true }), // worker lock — one driver per run
    lockedBy: text("locked_by"), // worker fencing token (workerId) — losing driver self-aborts

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("runs_project_id_idx").on(t.projectId),
    index("runs_status_idx").on(t.status), // worker polls by status
  ],
).enableRLS();

/** Stored file (upload or generated artifact) backed by Supabase Storage. */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    storagePath: text("storage_path").notNull(), // Supabase Storage object path
    url: text("url"), // public or signed URL
    mime: text("mime"),
    meta: jsonb("meta"), // width/height/duration/provider info
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assets_run_id_idx").on(t.runId)],
).enableRLS();

/** Audit trail of pipeline progress — drives the frontend timeline. */
export const stepEvents = pgTable(
  "step_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    step: stepEnum("step").notNull(),
    status: text("status").notNull(), // started / passed / failed / regenerated
    payload: jsonb("payload"), // Critic diagnostics, prompts used, decisions
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("step_events_run_id_idx").on(t.runId),
    check(
      "step_events_status_check",
      sql`${t.status} in ('started', 'passed', 'failed', 'regenerated')`,
    ),
  ],
).enableRLS();

// ── Artifact tables (structured output per pipeline step) ─────────────

/** 4 product views composited into one reference sheet. */
export const productReferenceSheets = pgTable(
  "product_reference_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    views: jsonb("views"), // { front, threeQuarter, side, rear }
    promptUsed: text("prompt_used"), // final GPT Image 2 prompt
    status: artifactStatusEnum("status").notNull().default("draft"),
  },
  (t) => [
    index("product_reference_sheets_run_id_idx").on(t.runId),
    index("product_reference_sheets_asset_id_idx").on(t.assetId),
  ],
).enableRLS();

/** Person reference sheet — only created when no person image is uploaded. */
export const personReferenceSheets = pgTable(
  "person_reference_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    views: jsonb("views"), // multiple view descriptors
    personDetails: jsonb("person_details"), // { demographics, costumeStyle, colorReference }
    promptUsed: text("prompt_used"),
    status: artifactStatusEnum("status").notNull().default("draft"),
  },
  (t) => [
    index("person_reference_sheets_run_id_idx").on(t.runId),
    index("person_reference_sheets_asset_id_idx").on(t.assetId),
  ],
).enableRLS();

/** Ordered storyboard scenes in the chosen ad style. */
export const storyboardSheets = pgTable(
  "storyboard_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    scenes: jsonb("scenes"), // [{ index, cameraAngle, actionMovement, sceneDescription, panelCaption, transcript, adStyle }]
    segmentIndex: integer("segment_index"), // 60s: 0..3 segment; null = 15s single sheet
    promptUsed: text("prompt_used"),
    status: artifactStatusEnum("status").notNull().default("draft"),
  },
  (t) => [
    index("storyboard_sheets_run_id_idx").on(t.runId),
    index("storyboard_sheets_asset_id_idx").on(t.assetId),
    index("storyboard_sheets_run_segment_idx").on(t.runId, t.segmentIndex),
  ],
).enableRLS();

/**
 * A final clip with native Seedance 2.0 audio. 15s runs have one row
 * (`segmentIndex` null). 60s runs have four segment rows (`segmentIndex` 0..3,
 * ~15s each) plus one merged row (`segmentIndex` null, ~60s) — the merged row
 * is the `final_video`; the segment rows are `segment_video` assets.
 */
export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    durationSec: numeric("duration_sec"), // ~15 per segment / ~60 merged
    segmentIndex: integer("segment_index"), // 60s: 0..3 segment clip; null = merged 60s OR legacy 15s
    hasAudio: boolean("has_audio").notNull().default(true),
    providerMeta: jsonb("provider_meta"), // BytePlus task id, model slug, params
    status: text("status").notNull().default("processing"), // processing / completed / failed
  },
  (t) => [
    index("videos_run_id_idx").on(t.runId),
    index("videos_asset_id_idx").on(t.assetId),
    index("videos_run_segment_idx").on(t.runId, t.segmentIndex),
    check(
      "videos_status_check",
      sql`${t.status} in ('processing', 'completed', 'failed')`,
    ),
    check("videos_duration_sec_check", sql`${t.durationSec} > 0`),
  ],
).enableRLS();
