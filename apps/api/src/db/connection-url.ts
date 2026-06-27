// DATABASE_URL normalizer.
//
// postgres-js parses the connection string with `new URL()` and then runs
// `decodeURIComponent()` on the username + password. A Supabase/Postgres
// password that contains a RAW special char (a bare `%`, `+`, `#`, …) is not
// valid percent-encoding, so that decode throws `URIError: URI malformed` and
// the process crashes on boot before it can serve a single request.
//
// We re-encode the userinfo defensively: decode whatever is there (tolerating a
// malformed escape), then percent-encode it properly. An already-correct URL
// round-trips unchanged; a URL with a raw special char becomes valid so the
// driver decodes it back to the intended password. SSL/query params and the
// host/path are preserved verbatim (the driver still reads `?sslmode=…` etc.).

import { env } from "../config/index.js";

/** decodeURIComponent that returns the input unchanged on a malformed escape. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * The validated `DATABASE_URL` with its userinfo safely re-encoded so the
 * postgres-js driver can never crash on an un-encoded password. Use this instead
 * of `env.DATABASE_URL` wherever a `postgres()` client is created.
 */
export function databaseUrl(): string {
  const u = new URL(env.DATABASE_URL);
  // Reconstruct manually — the URL userinfo SETTERS do not re-encode an existing
  // `%`, so assigning back to `u.password` would not fix a malformed escape.
  const user = encodeURIComponent(safeDecode(u.username));
  const pass = u.password
    ? `:${encodeURIComponent(safeDecode(u.password))}`
    : "";
  const auth = u.username || u.password ? `${user}${pass}@` : "";
  return `${u.protocol}//${auth}${u.host}${u.pathname}${u.search}`;
}
