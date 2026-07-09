// Proxy: register + upload a template project (.aep/.zip/.mogrt). Streams the
// multipart body to POST /templates/register — run-independent, since this is
// the FIRST action of the template pipeline, before any run/brief exists.
// Registers the template with Nexrender and PUTs the bytes to Nexrender's own
// store. Response: { nexrenderTemplateId }. Same-origin Route Handler (not a
// Server Action, whose ~1MB body cap rejects a real .aep) keeps the browser
// same-origin.

import { proxyUpload } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxyUpload("/templates/register", req);
}
