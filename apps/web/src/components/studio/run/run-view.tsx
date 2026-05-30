"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import {
  cancelRunAction,
  confirmStepAction,
  rejectStepAction,
} from "@/app/studio/actions";
import { ArtifactCard } from "@/components/studio/run/artifact-card";
import { ConfirmBar } from "@/components/studio/run/confirm-bar";
import { RunHeader } from "@/components/studio/run/run-header";
import { isTerminal } from "@/components/studio/run/run-meta";
import { StepTimeline } from "@/components/studio/run/step-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const POLL_MS = 1500;

async function fetchRun(runId: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error("Failed to load run");
  return res.json();
}

export function RunView({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["run", runId] as const;

  const {
    data: run,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => fetchRun(runId),
    // Poll while active; stop at terminal states and while awaiting the
    // user's confirm/reject (a mutation resumes it by writing fresh data).
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return POLL_MS;
      if (isTerminal(status)) return false;
      if (status === "awaiting_confirmation") return false;
      return POLL_MS;
    },
    retry: (count, err) => err.message !== "not-found" && count < 2,
  });

  const mutation = useMutation({
    mutationFn: (action: "confirm" | "reject" | "cancel") => {
      if (action === "confirm") return confirmStepAction(runId);
      if (action === "reject") return rejectStepAction(runId);
      return cancelRunAction(runId);
    },
    onSuccess: (detail, action) => {
      if (detail) queryClient.setQueryData(queryKey, detail);
      if (action === "confirm") toast.success("Step confirmed");
      if (action === "reject") toast.message("Regenerating step…");
      if (action === "cancel") toast.error("Run cancelled");
    },
    onError: () => toast.error("Action failed — try again"),
  });

  if (isError && (error as Error).message === "not-found") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <TriangleAlertIcon className="text-muted-foreground size-8" />
          <div>
            <h2 className="font-semibold">Run not found</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              This run doesn’t exist. Mock runs reset when the dev server
              restarts.
            </p>
          </div>
          <Button asChild variant="brand">
            <Link href="/studio">Start a new run</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isPending || !run) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-7 w-72" />
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const finalVideo = run.assets.find((a) => a.kind === "final_video");
  const pending = mutation.isPending;

  return (
    <div className="flex flex-col gap-8">
      <RunHeader run={run} />

      {run.status === "completed" && finalVideo && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="ring-glow bg-card overflow-hidden rounded-2xl border"
        >
          <div className="border-b p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2Icon className="size-4 text-emerald-500" />
              Your ad video is ready
            </div>
          </div>
          <div className="p-4">
            <ArtifactCard asset={finalVideo} title="Final ad video" />
          </div>
        </motion.div>
      )}

      {run.status === "failed" && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <TriangleAlertIcon className="text-destructive size-5" />
              <div>
                <p className="text-sm font-medium">Run ended</p>
                <p className="text-muted-foreground text-sm">
                  {run.error ?? "The run was stopped."}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/studio">Start again</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-6">
          <StepTimeline run={run} />
        </CardContent>
      </Card>

      {run.mode === "confirm" && !isTerminal(run.status) && (
        <ConfirmBar
          run={run}
          pending={pending}
          onConfirm={() => mutation.mutate("confirm")}
          onReject={() => mutation.mutate("reject")}
          onCancel={() => mutation.mutate("cancel")}
        />
      )}

      {run.mode === "automatic" && !isTerminal(run.status) && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutation.mutate("cancel")}
            disabled={pending}
          >
            Cancel run
          </Button>
        </div>
      )}

      {run.status === "completed" && (
        <div className="flex justify-center">
          <Button asChild variant="brand">
            <Link href="/studio">
              Create another
              <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
