// Background worker — the in-process loop that drives runs (SPEC §4: in-process
// through F7). Each tick claims runs that need work and hands them to the
// orchestrator, single-flight per runId (parallel across runs). On boot, runs
// left mid-flight by a previous process are reclaimed and resume from
// `currentStep`, because the `runs` row is the authoritative state.

import type { RunStatus } from "@ugc/shared";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { env } from "../../config/index.js";
import { db, schema } from "../../db/index.js";
import { createLogger } from "../../lib/log.js";
import { driveRun } from "./orchestrator.js";

/** Statuses the driver can advance. Terminal + awaiting_confirmation are skipped. */
const CLAIMABLE: RunStatus[] = ["queued", "running", "regenerating"];

/** Refresh the lock this often while a run is being driven. */
const HEARTBEAT_MS = 30_000;
/** A lock older than this is considered abandoned (dead process) and reclaimable. */
const STALE_MS = 180_000; // 3 min — comfortably > HEARTBEAT_MS

/**
 * Per-process worker id. Every CLAIMED/released line carries it, so if a second
 * server instance is ever running you SEE two distinct `wid`s in the log — the
 * #1 cause of a run not pausing (two drivers racing the same run).
 */
export const workerId = Math.random().toString(36).slice(2, 8);
const log = createLogger("worker", { wid: workerId, pid: process.pid });

/**
 * runIds this process is driving — a cheap in-memory pre-filter so a tick
 * skips DB work for runs it already owns. The authoritative guard is the
 * `locked_at` DB claim below, which is what keeps a SECOND process (tsx-watch
 * restart, rolling deploy, or a stray instance) from driving the same run.
 */
const inFlight = new Set<string>();

/** Throttle the noisy "locked elsewhere" line to once / 30s per run. */
const lockedLogAt = new Map<string, number>();

async function tick(): Promise<void> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(inArray(schema.runs.status, CLAIMABLE));

  for (const { id } of rows) {
    if (inFlight.has(id)) continue;

    // Atomic claim: win the row only if it's still claimable AND its lock is
    // free or stale. Two workers racing this UPDATE — only one gets a row back.
    const claimed = await db
      .update(schema.runs)
      .set({ lockedAt: new Date(), lockedBy: workerId })
      .where(
        and(
          eq(schema.runs.id, id),
          inArray(schema.runs.status, CLAIMABLE),
          or(
            isNull(schema.runs.lockedAt),
            lt(
              schema.runs.lockedAt,
              sql`now() - ${`${STALE_MS} milliseconds`}::interval`,
            ),
          ),
        ),
      )
      .returning({ id: schema.runs.id, status: schema.runs.status });
    if (claimed.length === 0) {
      // Held by another driver — if you EVER see this with one instance, a
      // second one is alive.
      const now = Date.now();
      if ((lockedLogAt.get(id) ?? 0) < now - 30_000) {
        lockedLogAt.set(id, now);
        log.debug("locked elsewhere — skip", { run: id });
      }
      continue;
    }

    log.info("CLAIMED", { run: id, status: claimed[0].status });
    inFlight.add(id);
    // Refresh the lock on its own timer, independent of the step's await, so
    // even a multi-minute video step keeps the lock fresh.
    const heartbeat = setInterval(() => {
      void db
        .update(schema.runs)
        .set({ lockedAt: new Date(), lockedBy: workerId })
        .where(eq(schema.runs.id, id))
        // Best effort: a missed refresh just lets the lock go stale (the run is
        // re-claimable later). Log it so a flaky DB is visible, never crash.
        .catch((err) =>
          log.warn("heartbeat refresh failed", {
            run: id,
            err: err instanceof Error ? err.message : String(err),
          }),
        );
    }, HEARTBEAT_MS);

    void driveRun(id, workerId)
      .catch((err) =>
        log.error("driveRun threw", {
          run: id,
          err: err instanceof Error ? err.message : String(err),
        }),
      )
      .finally(async () => {
        clearInterval(heartbeat);
        inFlight.delete(id);
        // Release the lock so a paused→confirmed (or regenerating) run is
        // re-claimable on a later tick.
        await db
          .update(schema.runs)
          .set({ lockedAt: null, lockedBy: null })
          .where(eq(schema.runs.id, id))
          // Best effort: if release fails the lock goes stale and is reclaimed
          // after STALE_MS — never fatal, but worth surfacing.
          .catch((err) =>
            log.warn("lock release failed", {
              run: id,
              err: err instanceof Error ? err.message : String(err),
            }),
          );
        log.debug("released", { run: id });
      });
  }
}

/**
 * Start the polling loop. Returns a stop function (used by tests). No-op when
 * `WORKER_ENABLED=false`, leaving a passive HTTP server.
 */
export function startWorker(): () => void {
  if (!env.WORKER_ENABLED) {
    log.warn("disabled (WORKER_ENABLED=false)");
    return () => {};
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const loop = async () => {
    if (stopped) return;
    try {
      await tick();
    } catch (err) {
      log.error("tick error", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) timer = setTimeout(loop, env.WORKER_POLL_INTERVAL_MS);
  };

  log.info("BOOT", { pollMs: env.WORKER_POLL_INTERVAL_MS });
  // NOTE: do NOT blanket-clear locks on boot. A restart can overlap a still-
  // draining previous process; wiping its lock lets two drivers race the same
  // run (the bug we hit). Recovery of a dead process's lock is handled safely
  // by stale-reclaim (the claim WHERE clause) + release-on-stop below.
  void loop();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    // Release locks THIS worker holds so a clean restart hands runs off
    // immediately — no stale wait, no overlap window where a dying process
    // still "owns" a run.
    void db
      .update(schema.runs)
      .set({ lockedAt: null, lockedBy: null })
      .where(eq(schema.runs.lockedBy, workerId))
      .catch((err) =>
        log.warn("lock release on stop failed", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );
  };
}
