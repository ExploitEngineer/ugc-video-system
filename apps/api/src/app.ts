// Hono app builder — wires CORS, routes, and the error sinks. Kept free of
// `serve()` so it can be imported by tests/worker later without a port.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { onError } from "./lib/errors.js";
import { runs } from "./routes/runs.js";

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: ["http://localhost:3000"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/runs", runs);

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(onError);

  return app;
}
