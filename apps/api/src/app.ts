// Hono app builder — wires CORS, routes, and the error sinks. Kept free of
// `serve()` so it can be imported by tests/worker later without a port.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/index.js";
import { onError } from "./lib/errors.js";
import { createLogger } from "./lib/log.js";
import { adTypeMenuList } from "./agents/ad-types/menu.js";
import {
  createPlainlyProvider,
  isPlainlyConfigured,
} from "./providers/plainly/index.js";
import { brand } from "./routes/brand.js";
import { runs } from "./routes/runs.js";

export function createApp() {
  const app = new Hono();

  // Allowed origins come from CORS_ORIGIN (comma-separated, or "*" for any), so
  // the deployed frontend URL is a config change, not a code change.
  const allowed = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const wildcard = allowed.includes("*");
  // A wildcard origin in production is almost never intended — surface it loudly
  // so a real frontend allowlist is set instead of shipping "*".
  if (wildcard && env.NODE_ENV === "production") {
    createLogger("app").warn(
      "CORS_ORIGIN is '*' in production — set an explicit frontend origin allowlist",
    );
  }
  app.use(
    "*",
    cors({
      origin: wildcard ? "*" : allowed,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  // Ad-type menu for the create-form dropdown (Chunk J). Registry-driven, so it
  // grows automatically as new ad types are registered.
  app.get("/ad-types", (c) => c.json(adTypeMenuList()));

  // Plainly capability + defaults — lets the create-form decide whether to offer
  // the "Customize with Plainly" toggle and prefill the default template.
  app.get("/plainly/config", (c) =>
    c.json({
      configured: isPlainlyConfigured(),
      defaultProjectId: env.PLAINLY_DEFAULT_PROJECT_ID ?? null,
      defaultTemplateId: env.PLAINLY_DEFAULT_TEMPLATE_ID ?? null,
    }),
  );

  // The curated public designs the editor offers as single-clip branded wraps —
  // confirmed live against Plainly's catalog + enriched with preview MP4s. Falls
  // back to the pinned list when the catalog is unreachable.
  app.get("/plainly/designs", async (c) =>
    c.json({ designs: await createPlainlyProvider().listDesignsEnriched() }),
  );

  app.route("/runs", runs);
  app.route("/brand", brand);

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(onError);

  return app;
}
