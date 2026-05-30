// step_events writer — the critic is the first code in the repo to WRITE
// step_events (only the confirm/reject routes did before). `lib/runs.ts`
// already READS them into RunDetail, so the frontend timeline picks these up
// for free.
//
// Append-only audit row: a single insert, no transaction. `status` is
// constrained to the four values the DB CHECK allows.

import type { Step } from "@ugc/shared";
import { db, schema } from "../../db/index.js";

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
