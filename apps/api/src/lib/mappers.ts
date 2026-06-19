// DB row → DTO mappers — the SOLE exit point from DB rows to wire shapes.
//
// Two jobs: (1) coalesce DB-nullable columns into the DTO's required
// fields (the frontend contract in @ugc/shared requires non-null
// `adStyle`/`url`/`mime`; `currentStep` stays nullable — the UI needs the
// null), and (2) make sure internal-only
// columns (notably `assets.storagePath`) NEVER reach the frontend.

import type { Asset, RunDetail, Scene, StepEvent } from "@ugc/shared";
import type { Run } from "@ugc/shared";
import {
  hookSelectionSchema,
  isMultiSegment,
  narrativeOutlineSchema,
  runErrorCodeSchema,
  sceneSchema,
  stepEventStatusSchema,
} from "@ugc/shared";
import type { schema } from "../db/index.js";
import { FALLBACK_AD_TYPE_ID, getAdType } from "../agents/ad-types/registry.js";
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

/**
 * The run columns `toRunDto` actually reads. Declaring it as a `Pick` lets the
 * list query (`loadRunList`) select a column SUBSET — dropping the heavy jsonb
 * (`narrativeOutline`/`productUse`/`visualStyle`) the list DTO never carries —
 * and still pass the result here. A full `RunRow` satisfies it (superset), so
 * `toRunDetailDto` keeps working unchanged.
 */
export type RunListRow = Pick<
  RunRow,
  | "id"
  | "projectId"
  | "prompt"
  | "adStyle"
  | "adType"
  | "adTypeSource"
  | "mode"
  | "aspectRatio"
  | "duration"
  | "criticEnabled"
  | "status"
  | "currentStep"
  | "error"
  | "errorCode"
  | "feedback"
  | "createdAt"
  | "updatedAt"
>;

export function toRunDto(row: RunListRow): Run {
  return {
    id: row.id,
    projectId: row.projectId,
    prompt: row.prompt,
    adStyle: row.adStyle ?? "",
    // Default to `ugc` until the interpret step fills it in.
    adType: row.adType ?? "ugc",
    // null on legacy rows (detector source not yet recorded).
    adTypeSource:
      row.adTypeSource === "auto" || row.adTypeSource === "user"
        ? row.adTypeSource
        : null,
    mode: row.mode,
    aspectRatio: row.aspectRatio,
    duration: row.duration,
    criticEnabled: row.criticEnabled,
    status: row.status,
    // Pass `currentStep` through verbatim — null means "no step has completed
    // yet" (fresh run) or "parallel reference phase in flight". Coalescing it to
    // a step made a brand-new queued run report product_sheet as the last
    // completed step, so the timeline showed it "passed" before it ever ran.
    currentStep: row.currentStep,
    error: row.error ?? null,
    // `error_code` is plain text in the DB — validate at the wire boundary and
    // degrade an unknown value to null rather than 500-ing the poll.
    errorCode: runErrorCodeSchema.nullable().catch(null).parse(row.errorCode ?? null),
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
  segmentStoryboards?: StoryboardRow[] | null,
): RunDetail {
  // Multi-segment: group the segment sheets' scenes by segment, in `segmentIndex`
  // order, and flatten into `scenes` for back-compat. 15s leaves both as the
  // single storyboard (`segmentScenes` null).
  let scenes = parseScenes(storyboard?.scenes);
  let segmentScenes: Scene[][] | null = null;
  if (
    isMultiSegment(run.duration) &&
    segmentStoryboards &&
    segmentStoryboards.length
  ) {
    // Rows arrive oldest→newest; keep the LAST (newest) per segment index so a
    // targeted regen's fresh sheet wins, then order by segment index.
    const byIndex = new Map<number, StoryboardRow>();
    for (const s of segmentStoryboards) {
      if (s.segmentIndex != null) byIndex.set(s.segmentIndex, s);
    }
    const ordered = [...byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, s]) => s);
    segmentScenes = ordered.map((s) => parseScenes(s.scenes) ?? []);
    scenes = segmentScenes.flat();
  }
  // The planned narrative arc (jsonb). Validate at the wire boundary; drop on drift.
  const outline =
    isMultiSegment(run.duration) && run.narrativeOutline != null
      ? (narrativeOutlineSchema.safeParse(run.narrativeOutline).data ?? null)
      : null;
  return {
    ...toRunDto(run),
    assets: assets.map(toAssetDto),
    stepEvents: stepEvents.map(toStepEventDto),
    scenes,
    segmentScenes,
    narrativeOutline: outline,
    // The locked visual-style bible (multi-segment only; null for 15s/pre-outline).
    visualStyle: isMultiSegment(run.duration) ? (run.visualStyle ?? null) : null,
    // Detector outputs (Chunk E), surfaced in the run view (Chunk K). Validate
    // the hooks jsonb at the wire boundary; drop on drift (legacy/null rows).
    hooks: hookSelectionSchema.safeParse(run.hooks).data ?? null,
    adTypeConfidence: run.adTypeConfidence ?? null,
    detectorMeta: run.detectorMeta ?? null,
    // Registry-resolved display name + look family for the resolved adType.
    adTypeDisplayName: getAdType(run.adType ?? FALLBACK_AD_TYPE_ID).displayName,
    lookFamily: getAdType(run.adType ?? FALLBACK_AD_TYPE_ID).lookFamily,
  };
}
