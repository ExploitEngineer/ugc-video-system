// Proxy for skipping the Plainly stage → ffmpeg merge fallback
// (POST /runs/:id/plainly/skip).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyJson(`/runs/${encodeURIComponent(runId)}/plainly/skip`, {
    method: "POST",
  });
}
