// Background worker for the template library.
//
// Templates are NOT runs, so `driveRun` does not apply to them: they have their
// own lifecycle (`introspecting → previewing → ready`), each stage of which
// polls an async Nexrender operation that offers no webhook.
//
// This mirrors `creative-direction/worker.ts` exactly — poll by status, claim by
// an atomic DB update on a free-or-stale lock, advance ONE stage, release — so a
// crashed process resumes on boot and two instances can never drive the same
// template. Volume is tiny (an admin action), so it polls slowly.

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { env } from "../../config/index.js";
import { db, schema } from "../../db/index.js";
import { createLogger } from "../../lib/log.js";
import {
  failTemplate,
  introspectTemplate,
  reapArchivedTemplates,
} from "./library.js";
import { previewTemplate } from "./preview.js";

/** Non-terminal statuses the worker can advance. `ready`/`failed` are terminal. */
const CLAIMABLE = ["introspecting", "previewing"] as const;

/**
 * Sweep archived templates whose Nexrender upload survived, once a minute.
 *
 * `archiveTemplate` deletes the upload inline, but skips a template a run is
 * still rendering with. Without this sweep that upload would orphan forever.
 * Counted in ticks rather than kept on a second timer, so it cannot outlive the
 * worker or fire while the process is shutting down.
 */
const REAP_EVERY_TICKS = 12;

/** A lock older than this belonged to a dead process and is reclaimable. */
const STALE_MS = 180_000;

/**
 * Templates poll a remote render, not a local CPU-bound step, so there is no
 * point spinning. An admin adding a template waits a few seconds either way.
 */
const POLL_INTERVAL_MS = 5_000;

export const previewWorkerId = Math.random().toString(36).slice(2, 8);
const log = createLogger("template-worker", {
  wid: previewWorkerId,
  pid: process.pid,
});

/** Ids this process is advancing — a cheap pre-filter before the DB claim. */
const inFlight = new Set<string>();

async function advance(id: string, status: string): Promise<void> {
  if (status === "introspecting") {
    await introspectTemplate(id);
    return;
  }
  if (status === "previewing") {
    await previewTemplate(id);
    return;
  }
}

let ticks = 0;

async function tick(): Promise<void> {
  // Cleanup, not progress: a stubborn upload must not stop templates advancing.
  if (ticks++ % REAP_EVERY_TICKS === 0) {
    await reapArchivedTemplates().catch((err) => {
      log.warn("reaping archived templates failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  const rows = await db
    .select({ id: schema.templates.id, status: schema.templates.status })
    .from(schema.templates)
    .where(inArray(schema.templates.status, [...CLAIMABLE]));

  for (const { id, status } of rows) {
    if (inFlight.has(id)) continue;

    const staleBefore = new Date(Date.now() - STALE_MS);
    // Atomic claim: win the row only if it is STILL claimable and its lock is
    // free or stale. Two workers racing this UPDATE — exactly one gets a row.
    const claimed = await db
      .update(schema.templates)
      .set({ lockedAt: new Date(), lockedBy: previewWorkerId })
      .where(
        and(
          eq(schema.templates.id, id),
          inArray(schema.templates.status, [...CLAIMABLE]),
          or(
            isNull(schema.templates.lockedAt),
            lt(schema.templates.lockedAt, staleBefore),
          ),
        ),
      )
      .returning({ id: schema.templates.id });

    if (claimed.length === 0) continue; // another worker owns it

    inFlight.add(id);
    void (async () => {
      try {
        await advance(id, status);
      } catch (err) {
        // A stage that THROWS (rather than marking the row failed itself) would
        // otherwise be retried forever. Record it and stop.
        const reason = err instanceof Error ? err.message : String(err);
        log.error("template stage threw", { id, status, err: reason });
        await failTemplate(id, reason).catch(() => {});
      } finally {
        inFlight.delete(id);
        // Release the lock so the NEXT tick can advance the next stage. We do
        // not clear it on a still-rendering poll either — the row is unchanged,
        // and holding the lock across ticks would stall it forever.
        await db
          .update(schema.templates)
          .set({ lockedAt: null, lockedBy: null })
          .where(
            and(
              eq(schema.templates.id, id),
              eq(schema.templates.lockedBy, previewWorkerId),
            ),
          )
          .catch(() => {});
      }
    })();
  }
}

/** Start the loop. Returns a stop function. No-op when `WORKER_ENABLED=false`. */
export function startTemplateWorker(): () => void {
  if (!env.WORKER_ENABLED) {
    log.info("template worker disabled (WORKER_ENABLED=false)");
    return () => {};
  }

  let stopped = false;
  log.info("template worker started", { intervalMs: POLL_INTERVAL_MS });

  const timer = setInterval(() => {
    if (stopped) return;
    void tick().catch((err) => {
      log.error("template worker tick failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, POLL_INTERVAL_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
    log.info("template worker stopped");
  };
}

/**
 * Release any lock this process left behind. Called on boot: a `tsx watch`
 * restart or a rolling deploy leaves rows locked by a worker id that no longer
 * exists, and they would otherwise wait out the full stale timeout.
 */
export async function releaseStaleTemplateLocks(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  await db
    .update(schema.templates)
    .set({ lockedAt: null, lockedBy: null })
    .where(
      and(
        inArray(schema.templates.status, [...CLAIMABLE]),
        lt(schema.templates.lockedAt, staleBefore),
      ),
    );
}
