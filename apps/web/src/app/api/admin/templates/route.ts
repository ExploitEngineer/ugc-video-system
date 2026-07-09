// Admin: list every template (any status), and upload a new one.
//
// The .aep streams straight through to the API, which registers it with
// Nexrender and PUTs the bytes to Nexrender's own store. They never touch this
// process's memory, and they never touch Supabase.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return proxyAdmin("/admin/templates", req);
}

export async function POST(req: Request) {
  return proxyAdmin("/admin/templates", req, { stream: true });
}
