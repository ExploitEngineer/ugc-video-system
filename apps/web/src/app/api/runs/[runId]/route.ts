// Read-only proxy for one run (GET) + permanent delete (DELETE). Forwards the
// Hono API's status (so a 404 reaches the run view's not-found branch). The
// backend worker advances run state — this never mutates beyond DELETE.
// `runId` is encodeURIComponent'd so a crafted value can't alter the upstream
// path/query.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyJson(`/runs/${encodeURIComponent(runId)}`);
}

// Permanently delete a run (and all its stored files + DB rows) via the API.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  return proxyJson(`/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
}
