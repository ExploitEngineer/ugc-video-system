"use client";

// "Regenerate clip" action — re-renders a finished/soft-failed run's video
// clip(s) (optionally ONE segment) reusing the existing storyboard + reference
// sheets. Opens a small dialog for an optional one-line steer, POSTs to
// /runs/:id/regenerate-video, and primes the ["run", id] cache with the fresh
// RunDetail (the run flips to `running`; SSE takes over from there).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { regenerateVideoAction } from "@/app/studio/actions";
import {
  optimisticRegen,
  videoRegenTarget,
} from "@/components/studio/run/run-meta";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function RegenerateClip({
  runId,
  segmentIndex,
  label = "Regenerate clip",
  variant = "outline",
  size = "sm",
}: {
  runId: string;
  /** One segment of a multi-segment run; omit for the 15s clip / whole run. */
  segmentIndex?: number;
  label?: string;
  variant?: "outline" | "brand" | "ghost";
  size?: "sm" | "default";
}) {
  const queryClient = useQueryClient();
  const queryKey = ["run", runId] as const;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => regenerateVideoAction(runId, { segmentIndex, note }),
    // Light the amber loader on the CLICK, before the round trip. The dialog
    // closes immediately, so the user sees the pipeline react instantly.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<RunDetail>(queryKey);
      if (prev) {
        queryClient.setQueryData(
          queryKey,
          optimisticRegen(prev, videoRegenTarget(prev), { segmentIndex }),
        );
      }
      setOpen(false);
      setNote("");
      return { prev };
    },
    onSuccess: (detail) => {
      if (!detail) {
        toast.error("Couldn't start regeneration — try again");
        return;
      }
      queryClient.setQueryData(queryKey, detail);
      toast.message(
        segmentIndex != null
          ? `Regenerating segment ${segmentIndex + 1}…`
          : "Regenerating your clip…",
      );
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast.error("Couldn't start regeneration — try again");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <RefreshCwIcon className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex flex-col gap-4">
        <DialogTitle>
          {segmentIndex != null
            ? `Regenerate segment ${segmentIndex + 1}`
            : "Regenerate the video"}
        </DialogTitle>
        <p className="text-muted-foreground text-sm">
          Re-renders the {segmentIndex != null ? "segment" : "video"} from the
          same storyboard and reference sheets. Add an optional steer below.
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: e.g. less movement, slower, brighter…"
          disabled={mutation.isPending}
          className="min-h-20 resize-none"
        />
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Regenerate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
