"use client";

// The template picker. A user cannot judge a template from its name, so every
// card leads with the preview render of the template's own placeholder content —
// Nexrender exposes no thumbnail endpoint, so we render one ourselves.

import type { TemplateSummary } from "@ugc/shared";
import { LayoutTemplateIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchTemplates } from "@/lib/api";

function slotSummary(t: TemplateSummary): string {
  const c = t.slotCounts;
  if (!c) return "";
  return (
    [
      c.video && `${c.video} video`,
      c.image && `${c.image} image${c.image > 1 ? "s" : ""}`,
      c.text && `${c.text} text`,
    ]
      .filter(Boolean)
      .join(" · ") || "no slots"
  );
}

function Card({ t }: { t: TemplateSummary }) {
  const portrait = t.aspectRatio === "9:16";
  return (
    <Link
      href={`/studio/templates/${t.id}/brief`}
      className="border-border/70 bg-card/40 hover:border-brand/60 group rounded-xl border p-3 backdrop-blur transition-colors"
    >
      <div
        className={`bg-media overflow-hidden rounded-lg ${portrait ? "aspect-[9/16]" : "aspect-video"}`}
      >
        {t.previewVideoUrl ? (
          // Muted + playsInline so hover-play is allowed by the browser at all.
          // `relative z-10`: the card's `backdrop-blur` opens a backdrop root,
          // and Brave will not hit-test a <video> inside one — without this the
          // pointer never enters the element and the hover preview never plays.
          <video
            src={t.previewVideoUrl}
            poster={t.previewPosterUrl ?? undefined}
            muted
            loop
            playsInline
            preload="none"
            className="relative z-10 size-full object-cover"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
        ) : (
          <div className="text-muted-foreground/50 grid size-full place-items-center">
            <LayoutTemplateIcon className="size-6" />
          </div>
        )}
      </div>
      <p className="text-foreground group-hover:text-brand mt-3 truncate text-sm font-medium">
        {t.displayName}
      </p>
      <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
        {t.durationSec ? `${Math.round(t.durationSec)}s` : "—"} ·{" "}
        {t.aspectRatio ?? "—"} · {slotSummary(t)}
      </p>
    </Link>
  );
}

export function TemplatePicker() {
  const [rows, setRows] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (rows === null)
    return <p className="text-muted-foreground text-sm">Loading templates…</p>;

  if (rows.length === 0) {
    return (
      <div className="border-border/70 bg-card/40 text-muted-foreground mx-auto max-w-md rounded-xl border p-8 text-center text-sm backdrop-blur">
        <LayoutTemplateIcon className="text-muted-foreground/60 mx-auto mb-3 size-6" />
        <p className="text-foreground mb-1 font-medium">No templates yet</p>
        <p>
          An admin adds them at{" "}
          <Link href="/studio/admin/templates" className="underline">
            /studio/admin/templates
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((t) => (
        <Card key={t.id} t={t} />
      ))}
    </div>
  );
}
