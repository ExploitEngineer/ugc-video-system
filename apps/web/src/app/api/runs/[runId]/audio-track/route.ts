// Proxy for the editor's "separate audio lane" feature. Forwards to the Hono
// API's GET /runs/:id/audio-track, which lazily extracts the final video's
// audio into a standalone asset and returns its URL. Same-origin Route Handler
// so the browser never needs CORS or a public API URL.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyJson(`/runs/${encodeURIComponent(runId)}/audio-track`);
}
