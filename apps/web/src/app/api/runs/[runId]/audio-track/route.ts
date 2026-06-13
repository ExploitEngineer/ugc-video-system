// Proxy for the editor's "separate audio lane" feature. Forwards to the Hono
// API's GET /runs/:id/audio-track, which lazily extracts the final video's
// audio into a standalone asset and returns its URL. Same-origin Route Handler
// so the browser never needs CORS or a public API URL. The first call may take
// a few seconds (download + ffmpeg); subsequent calls return the cached asset.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const res = await fetch(apiUrl(`/runs/${runId}/audio-track`), {
      cache: "no-store",
    });
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}
