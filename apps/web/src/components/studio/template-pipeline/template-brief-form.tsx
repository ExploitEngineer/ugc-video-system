"use client";

// Phase 2 of the template pipeline: once a template is registered +
// introspected (Phase 1, `TemplateUploadView`), reuse the EXACT same ad-brief
// composer as the normal pipeline (`CreateRunForm`) — same controls, same
// submit-gating logic — with the template info wired in via its optional
// `template` prop. Only this thin wrapper is pipeline-specific: fetching the
// template's structure (defensively — a deep-linked/refreshed templateId
// might be stale or never finished; Phase 1 already validated it once) and
// showing a loading/not-ready state until it's confirmed `"ready"`.

import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { CreateRunForm } from "@/components/studio/create-run-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchTemplateStructure } from "@/lib/api";

export function TemplateBriefForm({ templateId }: { templateId: string }) {
  const structureQuery = useQuery({
    queryKey: ["tmpl-structure", templateId],
    queryFn: () => fetchTemplateStructure(templateId),
  });
  const structure = structureQuery.data;
  const structureReady = structure?.status === "ready";

  if (structureQuery.isPending) {
    return (
      <Card className="ring-glow">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
          <p className="text-muted-foreground text-sm">
            Loading your template…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!structureReady) {
    return (
      <Card className="ring-glow">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircleIcon className="text-destructive size-6" />
          <div>
            <h2 className="font-semibold">This template isn't ready</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {structure?.error ??
                "It may still be processing, or the link is stale."}
            </p>
          </div>
          <Button asChild variant="brand">
            <Link href="/studio/template-new">Upload a template</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const textCount = structure.slots.filter((s) => s.asset === "TEXT").length;
  const videoCount = structure.slots.filter((s) => s.asset === "VIDEO").length;

  return (
    <CreateRunForm
      autoFocus
      template={{
        templateId,
        suggestedAspectRatio: structure.suggestedAspectRatio,
        infoLabel: `${textCount} text field${textCount === 1 ? "" : "s"} · ${videoCount} video slot${videoCount === 1 ? "" : "s"}`,
      }}
    />
  );
}
