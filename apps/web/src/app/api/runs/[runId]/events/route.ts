// SSE passthrough proxy for ONE run's stream. Same-origin (no CORS), unbuffered
// passthrough of the Hono API's `GET /runs/:id/events`. `req.signal` is
// forwarded so the browser closing its EventSource aborts upstream and the API
// detaches its bus listener. A missing run upstream returns its 404 JSON (the
// run view's own one-shot fetch is what surfaces not-found to the user — the
// stream is supplementary). Replaces the run view's polling.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(apiUrl(`/runs/${runId}/events`), {
      headers: { accept: "text/event-stream" },
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const body = await upstream
      .json()
      .catch(() => ({ error: "Stream unavailable" }));
    return Response.json(body, { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
