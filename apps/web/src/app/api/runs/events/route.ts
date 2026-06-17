// SSE passthrough proxy for the run LIST stream. Keeps the browser same-origin
// (no CORS) while streaming the Hono API's `GET /runs/events` through
// unbuffered. Forwarding `req.signal` is essential — when the browser closes
// its EventSource, the abort flows web→api and the API tears down its bus
// listener. The sidebar consumes this instead of polling the list.

import { proxyStream } from "@/lib/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  return proxyStream("/runs/events", req);
}
