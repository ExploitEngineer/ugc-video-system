import { serve } from "@hono/node-server";
import { startWorker } from "./agents/creative-direction/index.js";
import {
  releaseStaleTemplateLocks,
  startTemplateWorker,
} from "./agents/template/preview-worker.js";
import { createApp } from "./app.js";
import { env } from "./config/index.js";
import { migrate } from "./db/migrate.js";
import { createLogger } from "./lib/log.js";

const log = createLogger("server");

if (env.DB_MIGRATE_ON_BOOT) {
  try {
    await migrate();
  } catch (err) {
    // drizzle wraps the failing statement as "Failed query: …" and hides the
    // real Postgres error (permission denied / read-only / pooler can't DDL) on
    // `err.cause`. Surface its fields so the deploy log is actually diagnosable.
    const cause = (err as { cause?: Record<string, string | undefined> })
      .cause;
    log.error("migrations failed, aborting startup", {
      err: err instanceof Error ? err.message : String(err),
      ...(cause && typeof cause === "object"
        ? {
            pgMessage: cause.message,
            pgCode: cause.code,
            pgDetail: cause.detail,
            pgHint: cause.hint,
            pgSeverity: cause.severity,
            pgRoutine: cause.routine,
          }
        : {}),
    });
    process.exit(1);
  }
} else {
  log.warn(
    "DB_MIGRATE_ON_BOOT=false — skipping startup migrations; apply them out-of-band (pnpm --filter api db:migrate via a direct/session connection)",
  );
}

const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    log.info("listening", { port: info.port });
  },
);

// F7: in-process background worker advances runs through the pipeline.
const stopWorker = startWorker();

// The template library has its own lifecycle (introspecting → previewing →
// ready), polling async Nexrender operations that offer no webhook. Templates
// are not runs, so they get their own loop. Release any lock a previous process
// left behind first, or those rows wait out the full stale timeout on every
// `tsx watch` restart.
await releaseStaleTemplateLocks().catch((err) => {
  log.warn("could not release stale template locks", {
    err: err instanceof Error ? err.message : String(err),
  });
});
const stopTemplateWorker = startTemplateWorker();

// Graceful shutdown. The worker loop keeps Node's event loop alive, so without
// these handlers the process never exits on its own — closing the terminal
// (SIGHUP) or a killed parent leaves an orphaned server still bound to the
// port. Stop the worker, close the server, and force-exit if an in-flight
// step (e.g. a long video poll) holds the close open.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn("shutting down", { signal });
  stopWorker();
  stopTemplateWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => shutdown(sig));
}
