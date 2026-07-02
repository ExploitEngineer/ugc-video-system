// Proxy for the curated Plainly design list (GET /plainly/designs) — feeds the
// editor's template picker so users never type project/template ids.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson("/plainly/designs");
}
