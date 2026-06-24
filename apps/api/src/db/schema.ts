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
  RunStatus,
  Step,
} from "@ugc/shared";
import {
  aspectRatioSchema,
  assetKindSchema,
  artifactStatusSchema,
  durationSchema,
  modeSchema,
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
    mode: modeEnum("mode").notNull(),
    aspectRatio: aspectRatioEnum("aspect_ratio").notNull().default("16:9"), // output shape, propagated to sheets + video
    duration: durationEnum("duration").notNull().default("15s"), // 15s single-clip pipeline | 60s four-clip merged pipeline
    narrativeOutline: jsonb("narrative_outline"), // 60s only: { segments: [{ index, beat, summary }], visualStyle } — continuity arc planned before any storyboard
    visualStyle: text("visual_style"), // 60s only: locked visual-style bible (grade/lens/lighting/palette/time-of-day arc), injected verbatim into all 4 storyboard + 4 video prompts
    criticEnabled: boolean("critic_enabled").notNull().default(false), // Critic parked — off by default
    status: runStatusEnum("status").notNull().default("queued"),
    currentStep: stepEnum("current_step"),
    error: text("error"), // user-facing failure sentence (raw detail stays in logs/step_events)
    errorCode: text("error_code"), // RunErrorCode — plain text so new codes need no enum migration; Zod-validated at the mapper
    feedback: text("feedback"), // pending step-by-step feedback, consumed by next regen
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
