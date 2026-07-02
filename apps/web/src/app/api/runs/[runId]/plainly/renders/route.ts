// Proxy for submitting a Plainly render (POST /runs/:id/plainly/renders).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const body = await req.text();
  return proxyJson(`/runs/${encodeURIComponent(runId)}/plainly/renders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
