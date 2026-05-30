// List proxy for the studio sidebar. Mirrors the per-run proxy: runs in the
// browser, so the client never talks to the Hono API directly (no CORS). The
// sidebar polls this to surface every run already in the database, merged with
// the local run history.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(apiUrl("/runs"), { cache: "no-store" });
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}
