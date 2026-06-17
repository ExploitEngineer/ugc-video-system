// Proxy for saving a CE.SDK edit of a run's final video. Streams the multipart
// body (edited MP4 + optional scene JSON) through to the Hono API's
// POST /runs/:id/edited-video. Going through this same-origin Route Handler
// (not a Server Action, whose ~1MB body cap rejects real video) keeps the
// browser same-origin — no CORS, no public API URL needed.

import { proxyUpload } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyUpload(`/runs/${encodeURIComponent(runId)}/edited-video`, req);
}
