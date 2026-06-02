// DB row → DTO mappers — the SOLE exit point from DB rows to wire shapes.
//
// Two jobs: (1) coalesce DB-nullable columns into the DTO's required
// fields (the frontend contract in @ugc/shared requires non-null
// `adStyle`/`currentStep`/`url`/`mime`), and (2) make sure internal-only
// columns (notably `assets.storagePath`) NEVER reach the frontend.

import type { Asset, RunDetail, Scene, StepEvent } from "@ugc/shared";
import type { Run, StepEventStatus } from "@ugc/shared";
import type { schema } from "../db/index.js";

type AssetRow = typeof schema.assets.$inferSelect;
type StepEventRow = typeof schema.stepEvents.$inferSelect;
type RunRow = typeof schema.runs.$inferSelect;
type StoryboardRow = typeof schema.storyboardSheets.$inferSelect;

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
    // DB `status` is free text guarded by a CHECK to these 4 values.
    status: row.status as StepEventStatus,
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
    scenes: (storyboard?.scenes as Scene[] | null) ?? null,
  };
}
