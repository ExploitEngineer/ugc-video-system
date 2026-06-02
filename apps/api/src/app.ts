// Hono app builder — wires CORS, routes, and the error sinks. Kept free of
// `serve()` so it can be imported by tests/worker later without a port.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/index.js";
import { onError } from "./lib/errors.js";
import { runs } from "./routes/runs.js";

export function createApp() {
  const app = new Hono();

  // Allowed origins come from CORS_ORIGIN (comma-separated, or "*" for any), so
  // the deployed frontend URL is a config change, not a code change.
  const allowed = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    "*",
    cors({
      origin: allowed.includes("*") ? "*" : allowed,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/runs", runs);

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(onError);

  return app;
}
