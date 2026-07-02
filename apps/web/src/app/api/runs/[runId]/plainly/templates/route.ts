// Proxy for discovering a Plainly template's parameters (+ this run's clip URLs).
// Forwards the projectId/templateId query (re-encoded) to GET
// /runs/:id/plainly/templates.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const projectId = url.searchParams.get("projectId");
  const templateId = url.searchParams.get("templateId");
  if (projectId) qs.set("projectId", projectId);
  if (templateId) qs.set("templateId", templateId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return proxyJson(
    `/runs/${encodeURIComponent(runId)}/plainly/templates${suffix}`,
  );
}
