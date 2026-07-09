// Admin: advance the preview render by one step (POST), or throw it away and
// re-render (DELETE). The preview is a `preview: true` Nexrender job of the
// template's own placeholder content — the only way to show a user what they are
// picking, since Nexrender exposes no thumbnail endpoint.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ templateId: string }> };
const base = async (ctx: Ctx) =>
  `/admin/templates/${encodeURIComponent((await ctx.params).templateId)}/preview`;

export async function POST(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}

export async function DELETE(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}
