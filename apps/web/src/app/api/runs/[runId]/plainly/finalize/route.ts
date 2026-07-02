// Proxy for finishing the Plainly stage → merge branded + raw clips
// (POST /runs/:id/plainly/finalize).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyJson(`/runs/${encodeURIComponent(runId)}/plainly/finalize`, {
    method: "POST",
  });
}
