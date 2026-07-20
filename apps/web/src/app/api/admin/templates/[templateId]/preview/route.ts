// Admin: advance the preview render by one step (POST), replace it with a clip
// the admin supplies (PUT), or throw it away and re-render it (DELETE).
//
// The preview is an ordinary Nexrender render of the template's own placeholder
// content, submitted with an empty asset list — the only way to show a user what
// they are picking, since Nexrender exposes no thumbnail endpoint. It is
// deliberately a FULL render: Nexrender's own `preview` flag truncates the
// output, so the card would misreport how long the template runs.

import { proxyAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ templateId: string }> };
const base = async (ctx: Ctx) =>
  `/admin/templates/${encodeURIComponent((await ctx.params).templateId)}/preview`;

export async function POST(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}

/** The admin's own demo clip, for a template whose placeholder art is ugly. */
export async function PUT(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req, { stream: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return proxyAdmin(await base(ctx), req);
}
