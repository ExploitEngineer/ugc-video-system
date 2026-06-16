// SSE passthrough proxy for the run LIST stream. Keeps the browser same-origin
// (no CORS) while streaming the Hono API's `GET /runs/events` through
// unbuffered. Forwarding `req.signal` is essential — when the browser closes
// its EventSource, the abort flows web→api and the API tears down its bus
// listener. The sidebar consumes this instead of polling the list.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  let upstream: Response;
  try {
    upstream = await fetch(apiUrl("/runs/events"), {
      headers: { accept: "text/event-stream" },
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "Stream unavailable" },
      { status: upstream.status || 502 },
    );
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
