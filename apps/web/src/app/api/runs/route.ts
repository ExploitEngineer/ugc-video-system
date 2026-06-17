// Proxy for the studio sidebar (GET list) and run creation (POST). Mirrors the
// per-run proxy: runs in Next's server, so the browser only ever talks to its
// own origin — no CORS, and the API stays internal (not publicly reachable).
// GET: the sidebar lists every run in the database, merged with local history.
// POST: streams the multipart create-run form through to the API (Route
// Handlers have no body-size cap, unlike Server Actions' 1MB limit).

import { proxyJson, proxyUpload } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson("/runs");
}

export async function POST(req: Request) {
  return proxyUpload("/runs", req);
}
