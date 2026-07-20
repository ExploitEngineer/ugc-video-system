// Admin: poll Nexrender's introspection once. Idempotent, safe on a timer —
// Nexrender parses the project asynchronously and offers no webhook.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return proxyAdmin(
    `/admin/templates/${encodeURIComponent(templateId)}/introspect`,
    req,
  );
}
