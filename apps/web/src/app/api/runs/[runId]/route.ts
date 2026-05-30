// Poll target for the run progress view. TanStack Query hits this on an
// interval; each call advances the mock state machine one tick and returns
// the current `RunDetail`. In F3 this handler proxies the Hono API instead.

import { advanceRun } from "@/lib/mock/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const detail = advanceRun(runId);

  if (!detail) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  return Response.json(detail);
}
