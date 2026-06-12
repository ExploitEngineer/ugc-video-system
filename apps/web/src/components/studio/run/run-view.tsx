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

import { cancelRunAction, submitFeedbackAction } from "@/app/studio/actions";
import { CreateRunForm } from "@/components/studio/create-run-form";
import { ArtifactCard } from "@/components/studio/run/artifact-card";
import { FeedbackBar } from "@/components/studio/run/feedback-bar";
import { NowRunning } from "@/components/studio/run/now-running";
import { RunHeader } from "@/components/studio/run/run-header";
import {
  GATE_NEXT_LABEL,
  gateOf,
  isTerminal,
} from "@/components/studio/run/run-meta";
import { ScriptPanel } from "@/components/studio/run/script-panel";
import { StepTimeline } from "@/components/studio/run/step-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRun } from "@/lib/api";
import { addRun, removeRun } from "@/lib/run-history";

const POLL_MS = 1500;

// Stable module-level poller — poll while active; stop at terminal states
// and while awaiting the user's gate feedback (a mutation resumes it by
// writing fresh data). Hoisted so its identity is stable across renders
// (React Compiler does not memoize query-option closures).
function runPollInterval(query: {
  state: { data?: RunDetail; status?: string };
}): number | false {
  // Missing/failed fetch (e.g. a 404'd run) — stop, don't hammer the endpoint.
  if (query.state.status === "error") return false;
  const data = query.state.data;
  const status = data?.status;
  if (!status) return POLL_MS;
  // Keep polling if the run reports completed but the final video asset hasn't
  // surfaced in this response yet — otherwise the clip would only appear on a
  // manual refresh. Stops as soon as the asset lands.
  if (status === "completed") {
    const hasVideo = data?.assets.some((a) => a.kind === "final_video");
    return hasVideo ? false : POLL_MS;
  }
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
    // Retry up to 2× on ANY error — including a transient/stale 404 — so one bad
    // poll doesn't instantly show "Chat not found"; a genuinely missing run still
    // 404s on every attempt and surfaces after the retries.
    retry: (count) => count < 2,
  });

  const mutation = useMutation({
    mutationFn: (_action: "cancel") => cancelRunAction(runId),
    onSuccess: (detail) => {
      if (detail) queryClient.setQueryData(queryKey, detail);
      toast.error("Run cancelled");
    },
    onError: () => toast.error("Action failed — try again"),
  });

  const feedbackMutation = useMutation({
    mutationFn: (message: string) => submitFeedbackAction(runId, message),
    onSuccess: (detail) => {
      if (detail) queryClient.setQueryData(queryKey, detail);
      toast.message(
        detail?.status === "regenerating"
          ? "Applying your changes…"
          : "Continuing…",
      );
    },
    onError: () => toast.error("Couldn’t send feedback — try again"),
  });

  // Record this run in the sidebar history — covers both freshly-created runs
  // and ones opened directly by URL. addRun is idempotent per id. If the run is
  // confirmed missing (404), drop it from history so the ghost entry can't keep
  // reappearing in the sidebar.
  useEffect(() => {
    if (run) {
      addRun({ id: run.id, prompt: run.prompt, createdAt: run.createdAt });
    } else if (isError && (error as Error).message === "not-found") {
      removeRun(runId);
    }
  }, [run, isError, error, runId]);

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
  // 60s: the four 15s segment clips + the four segment storyboard sheets. Segments
  // finish in parallel (random order), so order by the `segmentIndex` stamped on
  // each asset's meta — 1,2 / 3,4 — falling back to original order if absent.
  const is60s = run.duration === "60s";
  const segmentClips = is60s
    ? run.assets
        .filter((a) => a.kind === "segment_video")
        .sort(
          (a, b) =>
            Number(a.meta?.segmentIndex ?? Number.POSITIVE_INFINITY) -
            Number(b.meta?.segmentIndex ?? Number.POSITIVE_INFINITY),
        )
    : [];
  // 60s: the ONE 16-panel master storyboard (all four segments × four panels in a
  // single 4×4 sheet). The four cropped row strips (`storyboard_sheet`) are an
  // internal step input — the master is what's shown.
  const masterSheet = is60s
    ? run.assets.find((a) => a.kind === "storyboard_master")
    : undefined;
  const pending = mutation.isPending || feedbackMutation.isPending;
  // The gate a paused run sits at — names the agent its approval will start.
  const awaitingGate =
    run.status === "awaiting_confirmation" ? gateOf(run.currentStep) : null;

  return (
    <div className="flex flex-col gap-8">
      <RunHeader run={run} />

      <NowRunning run={run} />

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

      {is60s && (segmentClips.length > 0 || masterSheet) && (
        <Card>
          <CardContent className="flex flex-col gap-6 py-6">
            {masterSheet && (
              <div>
                <h2 className="mb-3 text-sm font-semibold">
                  Storyboard{" "}
                  <span className="text-muted-foreground font-normal">
                    — 16 panels (4 segments × 4)
                  </span>
                </h2>
                <ArtifactCard
                  asset={masterSheet}
                  title="Storyboard (16 panels)"
                />
              </div>
            )}
            {segmentClips.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold">
                  15-second segments{" "}
                  <span className="text-muted-foreground font-normal">
                    — {segmentClips.length} of 4
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {segmentClips.map((asset, i) => (
                    <ArtifactCard
                      key={asset.id}
                      asset={asset}
                      title={`Segment ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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

      <ScriptPanel run={run} />

      {run.status === "awaiting_confirmation" && (
        <div className="border-brand/40 bg-brand/10 text-brand flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 shrink-0" />
            {awaitingGate
              ? `Paused — review below, then approve to start the ${GATE_NEXT_LABEL[awaitingGate]} agent.`
              : "Paused — awaiting your feedback before the next step."}
          </div>
          {is60s && awaitingGate === "storyboard" && (
            <p className="text-brand/80 pl-6 text-xs font-normal">
              Spot an issue? Describe what to change — e.g.{" "}
              <span className="font-medium">“make the lighting warmer”</span> —
              and we’ll regenerate the whole 16-panel storyboard. Or say{" "}
              <span className="font-medium">“looks good”</span> to continue.
            </p>
          )}
        </div>
      )}

      {run.mode === "confirm" && !isTerminal(run.status) && (
        <FeedbackBar
          run={run}
          pending={pending}
          onSubmitFeedback={(message) => feedbackMutation.mutate(message)}
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
