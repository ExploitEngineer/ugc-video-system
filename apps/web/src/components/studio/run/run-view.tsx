"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { motion } from "framer-motion";
import {
  CheckCircle2Icon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  cancelRunAction,
  confirmStepAction,
  rejectStepAction,
} from "@/app/studio/actions";
import { CreateRunForm } from "@/components/studio/create-run-form";
import { ArtifactCard } from "@/components/studio/run/artifact-card";
import { ConfirmBar } from "@/components/studio/run/confirm-bar";
import { RunHeader } from "@/components/studio/run/run-header";
import { isTerminal } from "@/components/studio/run/run-meta";
import { StepTimeline } from "@/components/studio/run/step-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRun } from "@/lib/api";
import { addRun } from "@/lib/run-history";

const POLL_MS = 1500;

// Stable module-level poller — poll while active; stop at terminal states
// and while awaiting the user's confirm/reject (a mutation resumes it by
// writing fresh data). Hoisted so its identity is stable across renders
// (React Compiler does not memoize query-option closures).
function runPollInterval(query: {
  state: { data?: RunDetail };
}): number | false {
  const status = query.state.data?.status;
  if (!status) return POLL_MS;
  if (isTerminal(status)) return false;
  if (status === "awaiting_confirmation") return false;
  return POLL_MS;
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
    refetchInterval: runPollInterval,
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

  // Record this run in the sidebar history — covers both freshly-created runs
  // and ones opened directly by URL. addRun is idempotent per id.
  useEffect(() => {
    if (run) {
      addRun({ id: run.id, prompt: run.prompt, createdAt: run.createdAt });
    }
  }, [run]);

  if (isError && (error as Error).message === "not-found") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <TriangleAlertIcon className="text-muted-foreground size-8" />
          <div>
            <h2 className="font-semibold">Chat not found</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              This chat doesn’t exist or has been removed.
            </p>
          </div>
          <Button asChild variant="brand">
            <Link href="/studio">Start a new chat</Link>
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
            {["a", "b", "c", "d"].map((k) => (
              <div key={k} className="flex gap-4">
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
              <CheckCircle2Icon className="size-4 text-success" />
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
          <CardContent className="flex items-center gap-3 py-5">
            <TriangleAlertIcon className="text-destructive size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Run ended</p>
              <p className="text-muted-foreground text-sm">
                {run.error ?? "The run was stopped."}
              </p>
            </div>
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

      {isTerminal(run.status) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="border-border/60 bg-card/40 rounded-2xl border p-4 backdrop-blur sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <SparklesIcon className="text-brand size-4 shrink-0" />
            <span className="font-medium">Start a new chat</span>
            <span className="text-muted-foreground">
              — tweak your prompt or try a new idea. Each run makes one video.
            </span>
          </div>
          <CreateRunForm />
        </motion.div>
      )}
    </div>
  );
}
