// step_events writer — the audit-trail row every agent writes.
//
// `lib/runs.ts` reads these into RunDetail, so the frontend timeline picks them
// up for free. Lives at the neutral agent root (not under any one agent) so the
// critic, video, and F7 orchestrator can all write without cross-agent imports.
//
// Append-only audit row: a single insert, no transaction. `status` is
// constrained to the four values the DB CHECK allows.

import { and, eq, sql } from "drizzle-orm";
import type { Step } from "@ugc/shared";
import { db, schema } from "../db/index.js";

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
