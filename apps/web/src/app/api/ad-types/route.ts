// Proxy for the create-form ad-type dropdown (Chunk J). Same-origin passthrough
// to the API's GET /ad-types so the browser never calls the API directly.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson("/ad-types");
}
