// Admin gate for `/admin/*` — template library management.
//
// This is a SOFT GUARD, not authentication. F8 (Supabase auth + RLS policies)
// is not started and the rest of the API is unauthenticated; this exists so a
// stranger who finds the URL cannot upload a 200MB .aep and burn Nexrender
// credits. Do not describe it as securing the API.
//
// It FAILS CLOSED in every environment when `ADMIN_API_KEY` is unset. A
// dev-only "open with a warning" bypass was considered and rejected: a misread
// NODE_ENV in a deploy would silently expose template upload to the internet.
//
// Swapping to real RBAC when F8 lands changes only the BODY of `adminAuth`:
// verify the `Authorization: Bearer <supabase jwt>` and check
// `app_metadata.role === "admin"`. The seam and the route mounting stay put.

import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

import { env } from "../config/index.js";
import { createLogger } from "./log.js";

const log = createLogger("admin-auth");

/** The header the admin console sends. Must be in the CORS allowlist. */
export const ADMIN_KEY_HEADER = "x-admin-key";

/**
 * Length-safe constant-time comparison.
 *
 * `crypto.timingSafeEqual` THROWS when the buffers differ in length, which
 * would both crash the request and leak the key's length through the error. So
 * compare lengths first (that single bit is unavoidable) and only then do the
 * constant-time byte compare on equal-length buffers.
 */
export function secretEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const adminAuth: MiddlewareHandler = async (c, next) => {
  const expected = env.ADMIN_API_KEY;
  if (!expected) {
    log.error(
      "ADMIN_API_KEY is unset — admin routes are disabled (they never default open)",
    );
    return c.json(
      { error: "Admin API is not configured.", code: "ADMIN_NOT_CONFIGURED" },
      503,
    );
  }

  const provided = c.req.header(ADMIN_KEY_HEADER);
  if (!provided || !secretEquals(provided, expected)) {
    log.warn("admin request rejected", { path: c.req.path });
    return c.json({ error: "Unauthorized", code: "ADMIN_UNAUTHORIZED" }, 401);
  }

  return next();
};
