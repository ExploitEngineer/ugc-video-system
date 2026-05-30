import { serve } from "@hono/node-server";
import { startWorker } from "./agents/creative-direction/index.js";
import { createApp } from "./app.js";
import { env } from "./config/index.js";

const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// F7: in-process background worker advances runs through the pipeline.
const stopWorker = startWorker();

// Graceful shutdown. The worker loop keeps Node's event loop alive, so without
// these handlers the process never exits on its own — closing the terminal
// (SIGHUP) or a killed parent leaves an orphaned server still bound to the
// port. Stop the worker, close the server, and force-exit if an in-flight
// step (e.g. a long video poll) holds the close open.
let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down…`);
  stopWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => shutdown(sig));
}
