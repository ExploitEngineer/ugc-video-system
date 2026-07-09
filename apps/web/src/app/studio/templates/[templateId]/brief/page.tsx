// The ad brief for a chosen template.
//
// A Server Component reading `templateId` from the URL path, so the selection
// survives a refresh and an SSR pass with no localStorage hydration flash. The
// composer itself is the SAME `create-run-form` the normal pipeline uses; only
// the `template` prop differs.

import type { TemplateSummary } from "@ugc/shared";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateRunForm } from "@/components/studio/create-run-form";
import { apiUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

async function loadTemplate(id: string): Promise<TemplateSummary | null> {
  try {
    const res = await fetch(apiUrl(`/templates/${encodeURIComponent(id)}`), {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TemplateSummary;
  } catch {
    return null;
  }
}

export default async function TemplateBriefPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const template = await loadTemplate(templateId);
  if (!template) notFound();

  const runtime = template.durationSec
    ? `${Math.round(template.durationSec)}s`
    : "—";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="border-border/70 bg-card/40 mb-6 flex items-center gap-4 rounded-xl border p-3 backdrop-blur">
        {/* A CSS background rather than <img>: the poster is a remote Supabase
            URL, and next/image would need a per-host allowlist for a thumbnail. */}
        <div
          aria-hidden
          className="bg-media h-14 w-24 shrink-0 rounded-lg bg-cover bg-center"
          style={
            template.previewPosterUrl
              ? { backgroundImage: `url(${template.previewPosterUrl})` }
              : undefined
          }
        />
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">
            {template.displayName}
          </p>
          <p className="text-muted-foreground font-mono text-[11px]">
            {runtime} · {template.aspectRatio ?? "—"} · aspect ratio from the
            template
          </p>
        </div>
        <Link
          href="/studio/templates"
          className="text-muted-foreground hover:text-foreground ml-auto text-xs underline"
        >
          Change template
        </Link>
      </div>

      <CreateRunForm
        autoFocus
        template={{
          templateId: template.id,
          suggestedAspectRatio: template.aspectRatio,
          infoLabel: template.displayName,
        }}
      />
    </div>
  );
}
