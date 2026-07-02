// Proxy for accepting a render as a branded segment replacement
// (POST /runs/:id/plainly/clips/accept).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = await req.text();
  return proxyJson(`/runs/${encodeURIComponent(runId)}/plainly/clips/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
