// SSE passthrough proxy for ONE run's stream. Same-origin (no CORS), unbuffered
// passthrough of the Hono API's `GET /runs/:id/events`. `req.signal` is
// forwarded so the browser closing its EventSource aborts upstream and the API
// detaches its bus listener. A missing run upstream returns its 404 JSON (the
// run view's own one-shot fetch is what surfaces not-found to the user — the
// stream is supplementary). `runId` is encodeURIComponent'd against path injection.

import { proxyStream } from "@/lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyStream(`/runs/${encodeURIComponent(runId)}/events`, req);
}
