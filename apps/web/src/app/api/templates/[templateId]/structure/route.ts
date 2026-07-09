// Proxy: poll a registered template's introspected structure (status +
// classified slots + suggested aspect ratio). GET /templates/:id/structure —
// run-independent (registration happens before any run exists).

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return proxyJson(`/templates/${encodeURIComponent(templateId)}/structure`);
}
