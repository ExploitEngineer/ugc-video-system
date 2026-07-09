// Admin: one template — read, rename/retag, archive.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ templateId: string }> };
const base = async (ctx: Ctx) =>
  `/admin/templates/${encodeURIComponent((await ctx.params).templateId)}`;

export async function GET(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}

export async function PATCH(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req, { body: await req.text() });
}

/** Soft archive. Answers 204, which `proxyAdmin` passes through bodiless. */
export async function DELETE(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}
