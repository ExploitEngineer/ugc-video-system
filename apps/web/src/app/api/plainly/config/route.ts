// Proxy for the Plainly capability probe (GET /plainly/config) — lets the
// create-form decide whether to offer the "Customize with Plainly" toggle.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson("/plainly/config");
}
