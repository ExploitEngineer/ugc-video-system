// Proxy for saving a CE.SDK edit of a run's final video. Streams the multipart
// body (edited MP4 + optional scene JSON) through to the Hono API's
// POST /runs/:id/edited-video. Going through this same-origin Route Handler
// (not a Server Action, whose ~1MB body cap rejects real video) keeps the
// browser same-origin — no CORS, no public API URL needed.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const res = await fetch(apiUrl(`/runs/${runId}/edited-video`), {
      method: "POST",
      body: req.body,
      headers: { "content-type": req.headers.get("content-type") ?? "" },
      duplex: "half", // stream the request body instead of buffering it
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
