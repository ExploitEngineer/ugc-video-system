// Admin: re-read a registered template's structure with the CURRENT classifier.
//
// For when our slot detection improves, not the template. GETs against Nexrender
// only: no upload, no render, no cost. The existing preview is kept.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return proxyAdmin(
    `/admin/templates/${encodeURIComponent(templateId)}/reintrospect`,
    req,
  );
}
