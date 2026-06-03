// Proxy for the studio sidebar (GET list) and run creation (POST). Mirrors the
// per-run proxy: runs in Next's server, so the browser only ever talks to its
// own origin — no CORS, and the API stays internal (not publicly reachable).
// GET: the sidebar polls this to surface every run in the database, merged with
// local history. POST: streams the multipart create-run form through to the API.

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

// Create a run. Streams the incoming multipart body straight to the API instead
// of buffering the image in this server. Route Handlers have no body-size cap
// under `next start` (unlike Server Actions' 1 MB limit), so large product/person
// images go through fine. Only `content-type` is forwarded — it carries the
// multipart boundary the API needs to parse the form.
export async function POST(req: Request) {
  try {
    const res = await fetch(apiUrl("/runs"), {
      method: "POST",
      body: req.body,
      headers: { "content-type": req.headers.get("content-type") ?? "" },
      // duplex is required to send a streaming request body (undici); not yet
      // in the RequestInit types.
      duplex: "half",
      cache: "no-store",
    } as RequestInit);
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}
