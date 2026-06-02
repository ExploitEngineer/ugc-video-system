// DB row → DTO mappers — the SOLE exit point from DB rows to wire shapes.
//
// Two jobs: (1) coalesce DB-nullable columns into the DTO's required
// fields (the frontend contract in @ugc/shared requires non-null
// `adStyle`/`currentStep`/`url`/`mime`), and (2) make sure internal-only
// columns (notably `assets.storagePath`) NEVER reach the frontend.

import type { Asset, RunDetail, Scene, StepEvent } from "@ugc/shared";
import type { Run } from "@ugc/shared";
import { sceneSchema, stepEventStatusSchema } from "@ugc/shared";
import type { schema } from "../db/index.js";
import { createLogger } from "./log.js";

type AssetRow = typeof schema.assets.$inferSelect;
type StepEventRow = typeof schema.stepEvents.$inferSelect;
type RunRow = typeof schema.runs.$inferSelect;
type StoryboardRow = typeof schema.storyboardSheets.$inferSelect;

const log = createLogger("mappers");

/**
 * Validate the jsonb `scenes` blob against the shared `Scene` schema (the stored
 * `StoryboardScene` shape matches it). On any drift, log and return null rather
 * than 500-ing the poll — the script panel degrades instead of breaking.
 */
function parseScenes(raw: unknown): Scene[] | null {
  if (raw == null) return null;
  const result = sceneSchema.array().safeParse(raw);
  if (!result.success) {
    log.warn("storyboard scenes failed schema — returning null", {
      err: result.error.message,
    });
    return null;
  }
  return result.data;
}

/** `storagePath` is intentionally dropped — internal only. */
export function toAssetDto(row: AssetRow): Asset {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    url: row.url ?? "",
    mime: row.mime ?? "",
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStepEventDto(row: StepEventRow): StepEvent {
  return {
    id: row.id,
    runId: row.runId,
    step: row.step,
    // DB `status` is free text guarded by a CHECK to these 4 values; validate at
    // the wire boundary instead of an unchecked cast.
    status: stepEventStatusSchema.parse(row.status),
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRunDto(row: RunRow): Run {
  return {
    id: row.id,
    projectId: row.projectId,
    prompt: row.prompt,
    adStyle: row.adStyle ?? "",
    // Default to `ugc` until the interpret step fills it in.
    adType: row.adType ?? "ugc",
    mode: row.mode,
    criticEnabled: row.criticEnabled,
    status: row.status,
    currentStep: row.currentStep ?? "product_sheet",
    error: row.error ?? null,
    feedback: row.feedback ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRunDetailDto(
  run: RunRow,
  assets: AssetRow[],
  stepEvents: StepEventRow[],
  storyboard?: StoryboardRow | null,
): RunDetail {
  return {
    ...toRunDto(run),
    assets: assets.map(toAssetDto),
    stepEvents: stepEvents.map(toStepEventDto),
    scenes: parseScenes(storyboard?.scenes),
  };
}
