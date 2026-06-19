// step_events writer — the audit-trail row every agent writes.
//
// `lib/runs.ts` reads these into RunDetail, so the frontend timeline picks them
// up for free. Lives at the neutral agent root (not under any one agent) so the
// critic, video, and F7 orchestrator can all write without cross-agent imports.
//
// Append-only audit row: a single insert, no transaction. `status` is
// constrained to the four values the DB CHECK allows.

import { and, desc, eq, sql } from "drizzle-orm";
import type { Step } from "@ugc/shared";
import { db, schema } from "../db/index.js";
import { notifyRunChanged } from "../lib/run-events.js";

/** Mirrors the `step_events_status_check` CHECK constraint. */
export type StepEventStatus = "started" | "passed" | "failed" | "regenerated";

export interface WriteStepEventInput {
  runId: string;
  step: Step;
  status: StepEventStatus;
  /** Critic diagnostics, prompts used, decisions — anything JSON-serializable. */
  payload?: Record<string, unknown>;
}

export async function writeStepEvent({
  runId,
  step,
  status,
  payload,
}: WriteStepEventInput): Promise<void> {
  await db.insert(schema.stepEvents).values({
    runId,
    step,
    status,
    payload: payload ?? null,
  });
  // Push the new audit row to any connected SSE stream for this run.
  notifyRunChanged(runId);
}

/**
 * Count Critic-driven regenerations already spent on a run — the run-level
 * regen budget. Only counts `regenerated` events written by the remediate
 * engine (which always tags its payload with `strategy`), so confirm-mode
 * manual rejects don't eat the auto budget.
 */
export async function countRegenEvents(runId: string): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.stepEvents)
    .where(
      and(
        eq(schema.stepEvents.runId, runId),
        eq(schema.stepEvents.status, "regenerated"),
        sql`${schema.stepEvents.payload} ? 'strategy'`,
      ),
    );
  return rows[0]?.value ?? 0;
}

/**
 * The most recent `step_event` status for a given step on a run (null if the
 * step never emitted one). Used as the AUTHORITATIVE per-step status — e.g. the
 * `video` step refuses to run unless `storyboard` last emitted `passed`, so a
 * failed/empty storyboard can never silently produce a video.
 */
export async function latestStepEventStatus(
  runId: string,
  step: Step,
): Promise<StepEventStatus | null> {
  const [row] = await db
    .select({ status: schema.stepEvents.status })
    .from(schema.stepEvents)
    .where(and(eq(schema.stepEvents.runId, runId), eq(schema.stepEvents.step, step)))
    .orderBy(desc(schema.stepEvents.createdAt))
    .limit(1);
  return (row?.status as StepEventStatus | undefined) ?? null;
}

/**
 * On cancel: close out any step still "in flight" (its latest event is
 * `started`, with no later terminal event) by writing a terminal `failed` event
 * tagged with the cancel code. This stops the timeline showing a perpetually
 * "running" step after a cancel. Steps that already completed (latest event
 * `passed`) are left untouched — so cancelling AFTER a step finished keeps that
 * step's `passed` status and its artifact. Returns the steps it closed.
 *
 * Writes the audit rows directly (no per-row SSE push); the caller pushes one
 * `notifyRunChanged` after flipping the run status.
 */
export async function closeInFlightStepsOnCancel(
  runId: string,
  code = "RUN_CANCELLED",
): Promise<Step[]> {
  const rows = await db
    .select({ step: schema.stepEvents.step, status: schema.stepEvents.status })
    .from(schema.stepEvents)
    .where(eq(schema.stepEvents.runId, runId))
    .orderBy(desc(schema.stepEvents.createdAt));
  // First row per step (rows are newest-first) = that step's latest status.
  const latestByStep = new Map<Step, string>();
  for (const r of rows) {
    if (!latestByStep.has(r.step as Step)) latestByStep.set(r.step as Step, r.status);
  }
  const inFlight = [...latestByStep.entries()]
    .filter(([, status]) => status === "started")
    .map(([step]) => step);
  for (const step of inFlight) {
    await db.insert(schema.stepEvents).values({
      runId,
      step,
      status: "failed",
      payload: { error: "Run cancelled.", code },
    });
  }
  return inFlight;
}
