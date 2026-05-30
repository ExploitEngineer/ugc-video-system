// Background worker — the in-process loop that drives runs (SPEC §4: in-process
// through F7). Each tick claims runs that need work and hands them to the
// orchestrator, single-flight per runId (parallel across runs). On boot, runs
// left mid-flight by a previous process are reclaimed and resume from
// `currentStep`, because the `runs` row is the authoritative state.

import type { RunStatus } from "@ugc/shared";
import { inArray } from "drizzle-orm";
import { env } from "../../config/index.js";
import { db, schema } from "../../db/index.js";
import { driveRun } from "./orchestrator.js";

/** Statuses the driver can advance. Terminal + awaiting_confirmation are skipped. */
const CLAIMABLE: RunStatus[] = ["queued", "running", "regenerating"];

/** runIds currently being driven — prevents a tick from double-driving a run. */
const inFlight = new Set<string>();

async function tick(): Promise<void> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(inArray(schema.runs.status, CLAIMABLE));

  for (const { id } of rows) {
    if (inFlight.has(id)) continue;
    inFlight.add(id);
    void driveRun(id)
      .catch((err) => console.error(`[worker] run ${id} failed:`, err))
      .finally(() => inFlight.delete(id));
  }
}

/**
 * Start the polling loop. Returns a stop function (used by tests). No-op when
 * `WORKER_ENABLED=false`, leaving a passive HTTP server.
 */
export function startWorker(): () => void {
  if (!env.WORKER_ENABLED) {
    console.log("[worker] disabled (WORKER_ENABLED=false)");
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const loop = async () => {
    if (stopped) return;
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    if (!stopped) timer = setTimeout(loop, env.WORKER_POLL_INTERVAL_MS);
  };

  console.log(
    `[worker] started — polling every ${env.WORKER_POLL_INTERVAL_MS}ms`,
  );
  void loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
