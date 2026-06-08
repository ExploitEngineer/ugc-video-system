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
  AdType,
  ArtifactStatus,
  AspectRatio,
  AssetKind,
  Mode,
  RunStatus,
  Step,
} from "@ugc/shared";
import {
  adTypeSchema,
  aspectRatioSchema,
  assetKindSchema,
  artifactStatusSchema,
  modeSchema,
  runStatusSchema,
  stepSchema,
} from "@ugc/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
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
export const adTypeEnum = pgEnum(
  "ad_type",
  adTypeSchema.options as [AdType, ...AdType[]],
);
export const artifactStatusEnum = pgEnum(
  "artifact_status",
  artifactStatusSchema.options as [ArtifactStatus, ...ArtifactStatus[]],
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
    adType: adTypeEnum("ad_type"), // ugc | inspirational, inferred at interpret step
    personBrief: text("person_brief"), // product-derived person/wardrobe brief; drives the (parallel) person sheet
    productBrief: text("product_brief"), // factual product identity anchor (category/materials/colors/markings); threaded to storyboard + critic
    mode: modeEnum("mode").notNull(),
    aspectRatio: aspectRatioEnum("aspect_ratio").notNull().default("16:9"), // output shape, propagated to sheets + video
    criticEnabled: boolean("critic_enabled").notNull().default(true),
    status: runStatusEnum("status").notNull().default("queued"),
    currentStep: stepEnum("current_step"),
    error: text("error"),
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
    promptUsed: text("prompt_used"),
    status: artifactStatusEnum("status").notNull().default("draft"),
  },
  (t) => [
    index("storyboard_sheets_run_id_idx").on(t.runId),
    index("storyboard_sheets_asset_id_idx").on(t.assetId),
  ],
).enableRLS();

/** The single ~15s final clip with native Seedance 2.0 audio. No merge step. */
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
    durationSec: numeric("duration_sec"), // ~15
    hasAudio: boolean("has_audio").notNull().default(true),
    providerMeta: jsonb("provider_meta"), // BytePlus task id, model slug, params
    status: text("status").notNull().default("processing"), // processing / completed / failed
  },
  (t) => [
    index("videos_run_id_idx").on(t.runId),
    index("videos_asset_id_idx").on(t.assetId),
    check(
      "videos_status_check",
      sql`${t.status} in ('processing', 'completed', 'failed')`,
    ),
    check("videos_duration_sec_check", sql`${t.durationSec} > 0`),
  ],
).enableRLS();
