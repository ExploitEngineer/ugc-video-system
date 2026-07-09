// One pickable template. 404s unless it is `ready` and unarchived.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return proxyJson(`/templates/${encodeURIComponent(templateId)}`);
}
