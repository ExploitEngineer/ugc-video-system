"use client";

// "Try another template" — composite this ad's EXISTING video into a different
// template. The reference sheets, the storyboard and the 15s master clip are
// template-independent and get reused; only the plan, the on-screen copy, the
// template's stills and the composite are re-derived for the new slots.
//
// Only templates with the run's own aspect ratio are offered. The master clip
// was shot in the original template's shape, and slicing a 9:16 master into a
// 16:9 slot centre-crops it to a third of the frame.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AspectRatio, RunDetail, TemplateSummary } from "@ugc/shared";
import { CheckIcon, LayoutTemplateIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { retemplateAction } from "@/app/studio/actions";
import { optimisticRegen } from "@/components/studio/run/run-meta";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTemplates } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "4 video · 5 text" — never a zero. */
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

function TemplateOption({
  t,
  selected,
  current,
  onSelect,
}: {
  t: TemplateSummary;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const portrait = t.aspectRatio === "9:16";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "focus-visible:ring-ring/50 group rounded-xl border p-2 text-left transition-colors outline-none focus-visible:ring-[3px]",
        selected
          ? "border-brand bg-brand/5"
          : "border-border/70 hover:border-brand/50",
      )}
    >
      <div
        className={cn(
          "bg-media relative overflow-hidden rounded-lg",
          portrait ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        {/* A CSS background rather than <img>: the poster is a remote Supabase
            URL, and next/image would need a per-host allowlist for a thumbnail. */}
        {t.previewPosterUrl ? (
          <div
            aria-hidden
            className="size-full bg-cover bg-center"
            style={{ backgroundImage: `url(${t.previewPosterUrl})` }}
          />
        ) : (
          <div className="text-muted-foreground/40 grid size-full place-items-center">
            <LayoutTemplateIcon className="size-5" />
          </div>
        )}
        {selected && (
          <span className="bg-brand text-brand-foreground absolute top-2 right-2 grid size-5 place-items-center rounded-full">
            <CheckIcon className="size-3" />
          </span>
        )}
      </div>
      <p className="text-foreground mt-2 flex items-center gap-1.5 text-sm font-medium">
        <span className="truncate">{t.displayName}</span>
        {current && (
          <span className="border-border/60 text-muted-foreground shrink-0 rounded-full border px-1.5 py-px text-[10px] font-normal">
            current
          </span>
        )}
      </p>
      <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
        {t.durationSec ? `${t.durationSec.toFixed(1)}s` : "-"} ·{" "}
        {slotSummary(t)}
      </p>
    </button>
  );
}

export function RetemplateDialog({
  runId,
  aspectRatio,
  currentTemplateId,
  currentTemplateName,
  allowCurrent = false,
}: {
  runId: string;
  aspectRatio: AspectRatio;
  currentTemplateId: string | null;
  currentTemplateName: string | null;
  /**
   * Offer the template this ad already uses. Only for a FAILED run: re-picking
   * it re-resolves the snapshot from the library, which is how a template fixed
   * on the admin side reaches an ad that was built before the fix.
   */
  allowCurrent?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["run", runId] as const;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
    enabled: open, // never fetch the library until they ask for it
    staleTime: 30_000,
  });

  // Same shape, and not the one this ad already uses — unless the ad failed, in
  // which case re-picking it is the way to pull in a fixed template.
  const options = (data ?? []).filter(
    (t) =>
      t.aspectRatio === aspectRatio &&
      (allowCurrent || t.id !== currentTemplateId),
  );

  const mutation = useMutation({
    mutationFn: (templateId: string) => retemplateAction(runId, templateId),
    // Show the amber "Rebuilding" loader on the CLICK. The new template name is
    // known from the picked card, so the optimistic banner names it correctly.
    onMutate: async (templateId: string) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<RunDetail>(queryKey);
      if (prev) {
        const name =
          options.find((t) => t.id === templateId)?.displayName ??
          prev.templateName;
        queryClient.setQueryData(
          queryKey,
          optimisticRegen(prev, "template_plan", {
            retemplate: { templateId, templateName: name },
          }),
        );
      }
      setOpen(false);
      setPicked(null);
      return { prev };
    },
    onSuccess: (result, _vars, ctx) => {
      // The action RESOLVES on a business rejection (`{ ok: false }`) — an
      // aspect-ratio mismatch, a same-template pick — so `onError` never fires
      // for it. Roll the optimistic state back here instead.
      if (!result.ok) {
        if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
        toast.error(result.error);
        return;
      }
      queryClient.setQueryData(queryKey, result.run);
      toast.message("Rebuilding your ad in the new template…");
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast.error("Couldn't start — try again");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutTemplateIcon className="size-4" />
          Try another template
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogTitle>Try another template</DialogTitle>
        <p className="text-muted-foreground text-sm">
          Keeps the video you already generated. Rewrites the on-screen copy,
          regenerates the template's stills, and renders again.
          {currentTemplateName && (
            <>
              {" "}
              This ad currently uses{" "}
              <span className="text-foreground font-medium">
                {currentTemplateName}
              </span>
              .
            </>
          )}
        </p>

        <div className="scroll-slim -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-video rounded-xl" />
              ))}
            </div>
          ) : options.length === 0 ? (
            <div className="border-border/60 rounded-xl border border-dashed px-6 py-10 text-center">
              <LayoutTemplateIcon className="text-muted-foreground/40 mx-auto size-6" />
              <p className="text-foreground mt-3 text-sm font-medium">
                No other {aspectRatio} template yet
              </p>
              <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm">
                Your video is {aspectRatio}, so only templates of that shape can
                take it without cropping. Add one in the template admin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {options.map((t) => (
                <TemplateOption
                  key={t.id}
                  t={t}
                  selected={picked === t.id}
                  current={t.id === currentTemplateId}
                  onSelect={() => setPicked(t.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={() => picked && mutation.mutate(picked)}
            disabled={!picked || mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <LayoutTemplateIcon className="size-4" />
            )}
            Rebuild in this template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
