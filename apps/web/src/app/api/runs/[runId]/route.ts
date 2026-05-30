// Poll target for the run progress view. TanStack Query hits this on an
// interval; this handler proxies the Hono API's GET /runs/:id and forwards its
// status (so a 404 still reaches the run view's not-found branch). The backend
// worker advances run state — this is a read-only proxy.

import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    const res = await fetch(apiUrl(`/runs/${runId}`), { cache: "no-store" });
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}
