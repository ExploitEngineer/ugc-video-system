// The public template picker's list. Same-origin proxy, no admin key needed —
// only `ready`, unarchived templates come back, and the DTO exposes no Nexrender
// ids or storage paths.

import { proxyJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return proxyJson("/templates");
}
