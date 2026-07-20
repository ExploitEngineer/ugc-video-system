// Admin: list every template (any status), and upload a new one.
//
// The project streams straight through to the API as a RAW body — its metadata
// rides in the query string, so nothing here has to parse (and therefore buffer)
// a multipart envelope. The API spools it to a temp file and PUTs it to
// Nexrender's own store. The bytes never touch this process's memory, and they
// never touch Supabase.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return proxyAdmin("/admin/templates", req);
}

export async function POST(req: Request) {
  const { search } = new URL(req.url);
  return proxyAdmin(`/admin/templates${search}`, req, { stream: true });
}
