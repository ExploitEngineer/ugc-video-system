// Proxy for polling one Plainly render (GET /runs/:id/plainly/renders/:renderId).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string; renderId: string }> },
) {
  const { runId, renderId } = await params;
  return proxyJson(
    `/runs/${encodeURIComponent(runId)}/plainly/renders/${encodeURIComponent(renderId)}`,
  );
}
