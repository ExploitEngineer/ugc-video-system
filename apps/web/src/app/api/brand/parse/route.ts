// Proxy for brand-file parsing (POST /brand/parse). Streams the multipart file
// through Next's server to the API, which extracts + condenses it into a brief.

import { proxyUpload } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxyUpload("/brand/parse", req);
}
