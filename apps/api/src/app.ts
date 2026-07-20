// Hono app builder — wires CORS, routes, and the error sinks. Kept free of
// `serve()` so it can be imported by tests/worker later without a port.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/index.js";
import { onError } from "./lib/errors.js";
import { createLogger } from "./lib/log.js";
import { adTypeMenuList } from "./agents/ad-types/menu.js";
import { ADMIN_KEY_HEADER, adminAuth } from "./lib/admin-auth.js";
import { adminTemplates } from "./routes/admin-templates.js";
import { runs } from "./routes/runs.js";
import { templates } from "./routes/templates.js";

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
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", ADMIN_KEY_HEADER],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  // Ad-type menu for the create-form dropdown (Chunk J). Registry-driven, so it
  // grows automatically as new ad types are registered.
  app.get("/ad-types", (c) => c.json(adTypeMenuList()));

  // The admin-curated template library. `adminAuth` is mounted on this subtree
  // ONLY — a shared-secret soft guard, not real auth (F8). It fails closed when
  // ADMIN_API_KEY is unset.
  const admin = new Hono();
  admin.use("*", adminAuth);
  admin.route("/templates", adminTemplates);
  app.route("/admin", admin);

  // Public: browse the library. Read-only; end users never upload a template.
  app.route("/templates", templates);

  app.route("/runs", runs);

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(onError);

  return app;
}
