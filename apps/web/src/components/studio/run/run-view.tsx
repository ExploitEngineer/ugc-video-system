"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isMultiSegment, segmentCountFor } from "@ugc/shared";
import { motion } from "framer-motion";
import {
  BotIcon,
  CheckCircle2Icon,
  ClapperboardIcon,
  ClockIcon,
  ExpandIcon,
  FilmIcon,
  GaugeIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  PencilIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SparklesIcon,
  TagIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  cancelRunAction,
  regenerateTemplateAction,
  submitFeedbackAction,
} from "@/app/studio/actions";
import { CreateRunForm } from "@/components/studio/create-run-form";
import { ArtifactCard } from "@/components/studio/run/artifact-card";
import { FeedbackBar } from "@/components/studio/run/feedback-bar";
import { AgentMessage, UserMessage } from "@/components/studio/run/message";
import { NowRunning } from "@/components/studio/run/now-running";
import { RegenerateClip } from "@/components/studio/run/regenerate-clip";
import {
  GATE_NEXT_LABEL,
  gateOf,
  isTerminal,
} from "@/components/studio/run/run-meta";
import { ScriptPanel } from "@/components/studio/run/script-panel";
import { StepTimeline } from "@/components/studio/run/step-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRun } from "@/lib/api";
import { addRun, removeRun } from "@/lib/run-history";
import { useRunStream } from "@/lib/use-run-stream";

/** Kebab hook id → a readable label, e.g. "problem-solution" → "Problem Solution". */
function prettyHook(id: string): string {
  return id
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** A small option/creative pill (user options + the AI's creative-direction tags). */
function Chip({
  icon: Icon,
  children,
}: {
  icon: typeof ClockIcon;
  children: ReactNode;
}) {
  return (
    <span className="border-border/60 bg-background/50 text-foreground/80 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
      <Icon className="size-3" />
      {children}
    </span>
  );
}

/** Thumbnail of an uploaded image in the user's message bubble. Click opens a
 *  full-size lightbox — the same panel used to view generated artifacts. */
function Thumb({ url, label }: { url: string; label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${label}`}
          className="group border-border/60 relative block size-12 overflow-hidden rounded-lg border"
        >
          {/* biome-ignore lint/performance/noImgElement: small upload preview, not a remote CDN asset */}
          <img src={url} alt={label} className="size-full object-cover" />
          <span className="bg-background/0 group-hover:bg-background/40 absolute inset-0 flex items-center justify-center transition-colors">
            <ExpandIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {/* biome-ignore lint/performance/noImgElement: upload preview, not a remote CDN asset */}
        <img
          src={url}
          alt={label}
          className="max-h-[75vh] w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
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
    // No polling — live updates arrive over SSE (useRunStream below), which
    // writes each pushed RunDetail straight into this query's cache. The
    // one-shot fetch here is the initial load + the not-found path.
    retry: (count) => count < 2,
  });

  // Confirmed-missing run → stop the SSE stream so it can't reconnect-loop on a
  // 404 (the not-found UI is driven by the query error below).
  const notFound = isError && (error as Error).message === "not-found";
  // The run's OWN settled-ness (failed/completed) — reflects the same cache a
  // regenerate mutation writes to, so the stream reopens the instant one flips
  // a settled run back to running (see use-run-stream.ts for why this matters).
  const settled = run?.status === "failed" || run?.status === "completed";
  useRunStream(runId, !notFound, settled);

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

  const regenerateTemplateMutation = useMutation({
    mutationFn: () => regenerateTemplateAction(runId),
    onSuccess: (detail) => {
      if (detail) queryClient.setQueryData(queryKey, detail);
      toast.message("Retrying the template…");
    },
    onError: () => toast.error("Couldn’t retry — try again"),
  });

  // Record this run in the sidebar history — covers both freshly-created runs
  // and ones opened directly by URL. addRun is idempotent per id. If the run is
  // confirmed missing (404), drop it from history so the ghost entry can't keep
  // reappearing in the sidebar.
  //
  // Depend on the PRIMITIVE fields addRun uses, not the `run` object: SSE writes
  // a new RunDetail into the cache on every frame, so `run`'s identity changes
  // each push and depending on it would re-run this (findIndex + localStorage)
  // every frame for the whole run.
  const historyId = run?.id;
  const historyPrompt = run?.prompt;
  const historyCreatedAt = run?.createdAt;
  const historyPipeline = run?.pipeline;
  const fetchErrorMessage = isError ? (error as Error).message : null;
  useEffect(() => {
    if (historyId && historyPrompt && historyCreatedAt) {
      addRun({
        id: historyId,
        prompt: historyPrompt,
        createdAt: historyCreatedAt,
        pipeline: historyPipeline,
      });
    } else if (fetchErrorMessage === "not-found") {
      removeRun(runId);
    }
  }, [
    historyId,
    historyPrompt,
    historyCreatedAt,
    historyPipeline,
    fetchErrorMessage,
    runId,
  ]);

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

  // The deliverable shown depends on the pipeline: a `template` run's ONLY
  // deliverable is its Nexrender-rendered `templated_video` (it never gets a
  // CE.SDK edit); a normal `video` run keeps today's precedence — the user's
  // CE.SDK edit (`edited_video`) over the originally generated `final_video`.
  // The original is always kept alongside, never replaced.
  const isTemplateRun = run.pipeline === "template";
  const templatedVideo = run.assets
    .filter((a) => a.kind === "templated_video")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const editedVideo = isTemplateRun
    ? undefined
    : run.assets
        .filter((a) => a.kind === "edited_video")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const finalVideo = isTemplateRun
    ? templatedVideo
    : (editedVideo ?? run.assets.find((a) => a.kind === "final_video"));
  // Multi-segment: the N 15s segment clips + the N segment storyboard rows.
  // Segments finish in parallel (random order), so order by the `segmentIndex`
  // stamped on each asset's meta, falling back to original order if absent.
  const isMulti = isMultiSegment(run.duration);
  const segCount = segmentCountFor(run.duration);
  const masterPanels = segCount * 4;
  const segmentClips = isMulti
    ? run.assets
        .filter((a) => a.kind === "segment_video")
        .sort(
          (a, b) =>
            Number(a.meta?.segmentIndex ?? Number.POSITIVE_INFINITY) -
            Number(b.meta?.segmentIndex ?? Number.POSITIVE_INFINITY),
        )
    : [];
  // Multi-segment: the ONE N×4-panel master storyboard (all N segments × four
  // panels in a single sheet). The N cropped row strips (`storyboard_sheet`) are
  // an internal step input — the master is what's shown.
  const masterSheet = isMulti
    ? run.assets.find((a) => a.kind === "storyboard_master")
    : undefined;
  const pending = mutation.isPending || feedbackMutation.isPending;
  // The gate a paused run sits at — names the agent its approval will start.
  const awaitingGate =
    run.status === "awaiting_confirmation" ? gateOf(run.currentStep) : null;
  // Uploaded inputs (shown as thumbnails in the user's message bubble).
  const productUpload = run.assets.find((a) => a.kind === "product_upload");
  const personUpload = run.assets.find((a) => a.kind === "person_upload");
  // A person sheet with no uploaded person photo ⇒ the person was synthesized.
  const synthPerson =
    !personUpload && run.assets.some((a) => a.kind === "person_sheet");
  const hasScript =
    (run.segmentScenes?.length ?? 0) > 0 || (run.scenes?.length ?? 0) > 0;
  const running = run.status === "running" || run.status === "regenerating";

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* The user's "message" — their prompt plus every option they picked. */}
      <UserMessage>
        <p className="leading-relaxed text-pretty">{run.prompt}</p>
        {(productUpload || personUpload) && (
          <div className="mt-3 flex gap-2">
            {productUpload && (
              <Thumb url={productUpload.url} label="Product image" />
            )}
            {personUpload && (
              <Thumb url={personUpload.url} label="Person image" />
            )}
          </div>
        )}
        {/* Only the options the USER picked live in the user's bubble. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip icon={isMulti ? FilmIcon : ClockIcon}>
            {isMulti ? `${run.duration} · ${segCount}×15s` : run.duration}
          </Chip>
          <Chip
            icon={
              run.aspectRatio === "16:9"
                ? RectangleHorizontalIcon
                : RectangleVerticalIcon
            }
          >
            {run.aspectRatio}
          </Chip>
          <Chip icon={run.mode === "automatic" ? GaugeIcon : ListChecksIcon}>
            {run.mode === "automatic" ? "Automatic" : "Step-by-step"}
          </Chip>
          {isTemplateRun && <Chip icon={LayoutTemplateIcon}>Template</Chip>}
        </div>
      </UserMessage>

      {/* Creative Direction agent — the AI's reading of the brief (the adStyle
          summary + the resolved ad type / hook / cast). Rendered as the agent's
          OWN output, not inside the user's bubble where it read as if the user
          wrote it. Appears once detection has set `adStyle`. */}
      {run.adStyle && (
        <AgentMessage label="Creative direction">
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <ClapperboardIcon className="text-brand mt-0.5 size-4 shrink-0" />
              <p className="text-foreground/90 text-sm leading-relaxed text-pretty">
                {run.adStyle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip icon={TagIcon}>
                {run.adTypeDisplayName}
                {run.adTypeSource === "user" ? (
                  <span className="text-muted-foreground/70 ml-1">
                    · you chose
                  </span>
                ) : run.adTypeSource === "auto" ? (
                  <span className="text-muted-foreground/70 ml-1">
                    · detected
                  </span>
                ) : null}
              </Chip>
              {run.hooks && (
                <>
                  <Chip icon={ZapIcon}>
                    Hook: {prettyHook(run.hooks.visualLead.id)}
                  </Chip>
                  {run.hooks.overlay && (
                    <Chip icon={ZapIcon}>
                      + {prettyHook(run.hooks.overlay.id)}
                    </Chip>
                  )}
                </>
              )}
              {synthPerson && <Chip icon={BotIcon}>AI character</Chip>}
            </div>
          </div>
        </AgentMessage>
      )}

      {/* Agent — live progress + the pipeline timeline. */}
      <AgentMessage label="Pipeline">
        {running && <NowRunning run={run} />}
        <Card>
          <CardContent className="py-6">
            <StepTimeline run={run} />
          </CardContent>
        </Card>
      </AgentMessage>

      {/* Agent — the generated scene script, once it exists. */}
      {hasScript && (
        <AgentMessage label="Scene script">
          <ScriptPanel run={run} />
        </AgentMessage>
      )}

      {/* Agent — multi-segment storyboard master + the segment clips. */}
      {isMulti && (segmentClips.length > 0 || masterSheet) && (
        <AgentMessage label="Storyboard & segments">
          {masterSheet && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                Storyboard{" "}
                <span className="text-muted-foreground font-normal">
                  — {masterPanels} panels ({segCount} segments × 4)
                </span>
              </h3>
              <ArtifactCard
                asset={masterSheet}
                title={`Storyboard (${masterPanels} panels)`}
              />
            </div>
          )}
          {segmentClips.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                15-second segments{" "}
                <span className="text-muted-foreground font-normal">
                  — {segmentClips.length} of {segCount}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {segmentClips.map((asset, i) => {
                  const segIdx = Number(asset.meta?.segmentIndex ?? i);
                  return (
                    <div key={asset.id} className="flex flex-col gap-2">
                      <ArtifactCard asset={asset} title={`Segment ${i + 1}`} />
                      {(run.status === "completed" ||
                        run.status === "awaiting_regen") && (
                        <div className="flex justify-end">
                          <RegenerateClip
                            runId={run.id}
                            segmentIndex={segIdx}
                            variant="ghost"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </AgentMessage>
      )}

      {/* Agent — paused, waiting for the user's go-ahead. */}
      {run.status === "awaiting_confirmation" && (
        <AgentMessage label="Waiting for you">
          <div className="border-brand/40 bg-brand/10 text-brand flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-sm font-medium">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 shrink-0" />
              {awaitingGate
                ? `Paused — review above, then approve to start the ${GATE_NEXT_LABEL[awaitingGate]} agent.`
                : "Paused — awaiting your feedback before the next step."}
            </div>
            {isMulti && awaitingGate === "storyboard" && (
              <p className="text-brand/80 pl-6 text-xs font-normal">
                Spot an issue? Describe what to change — e.g.{" "}
                <span className="font-medium">“make the lighting warmer”</span>{" "}
                — and we’ll regenerate the whole {masterPanels}-panel
                storyboard. Or say{" "}
                <span className="font-medium">“looks good”</span> to continue.
              </p>
            )}
          </div>
        </AgentMessage>
      )}

      {/* Agent — the run failed. A template-pipeline run that failed on the
          automatic text-fill/render step gets a Retry button — cheap and
          self-healing (POST /runs/:id/regenerate-template). */}
      {run.status === "failed" && (
        <AgentMessage label="Run ended">
          <div className="border-destructive/40 bg-destructive/5 flex items-center gap-3 rounded-xl border px-4 py-3">
            <TriangleAlertIcon className="text-destructive size-5 shrink-0" />
            <div className="flex flex-1 flex-col gap-0.5">
              <p className="text-muted-foreground text-sm">
                {run.error ?? "The run was stopped."}
              </p>
              {run.errorCode && run.errorCode !== "RUN_CANCELLED" && (
                <p className="text-muted-foreground/60 text-xs">
                  Error code: {run.errorCode}
                </p>
              )}
            </div>
            {isTemplateRun &&
              (run.errorCode === "TEMPLATE_RENDER_FAILED" ||
                run.errorCode === "TEMPLATE_FILL_FAILED") && (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => regenerateTemplateMutation.mutate()}
                  disabled={regenerateTemplateMutation.isPending}
                >
                  Retry
                </Button>
              )}
          </div>
        </AgentMessage>
      )}

      {/* Agent — soft-failed video (recoverable): offer a retry/tweak. */}
      {run.status === "awaiting_regen" && (
        <AgentMessage label="Clip needs a retry">
          <div className="border-warning/40 bg-warning/5 flex flex-col gap-3 rounded-xl border px-4 py-3">
            <div className="flex items-start gap-3">
              <TriangleAlertIcon className="text-warning size-5 shrink-0" />
              <p className="text-muted-foreground text-sm">
                {run.error ??
                  "The video couldn't be generated after several tries. You can regenerate it — optionally with a small tweak."}
              </p>
            </div>
            <div className="flex justify-end pl-8">
              <RegenerateClip
                runId={run.id}
                variant="brand"
                label="Regenerate"
              />
            </div>
          </div>
        </AgentMessage>
      )}

      {/* Agent — the finished video, the closing reply of the thread. A
          template-pipeline run's ONLY deliverable is its templated_video — no
          "Edit video" CE.SDK link (that flow doesn't apply to this pipeline). */}
      {run.status === "completed" && finalVideo && (
        <AgentMessage label={isTemplateRun ? "Your ad" : "Your ad video"}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="ring-glow bg-card overflow-hidden rounded-2xl border"
          >
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2Icon className="size-4 text-success" />
                {isTemplateRun
                  ? "Your ad is ready"
                  : editedVideo
                    ? "Your edited ad video"
                    : "Your ad video is ready"}
              </div>
              <div className="flex items-center gap-2">
                {/* Regenerate the whole clip (no segmentIndex → 15s final, or
                    all segments of a multi run) reusing the same sheets. */}
                <RegenerateClip runId={run.id} />
                {!isTemplateRun && (
                  <Button asChild variant="brand" size="sm">
                    <Link href={`/studio/${run.id}/edit`}>
                      <PencilIcon className="size-4" />
                      Edit video
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            <div className="p-4">
              <ArtifactCard
                asset={finalVideo}
                title={
                  isTemplateRun
                    ? "Your ad"
                    : editedVideo
                      ? "Edited ad video"
                      : "Final ad video"
                }
              />
            </div>
          </motion.div>
        </AgentMessage>
      )}

      {/* Reply composer (step-by-step) / cancel (automatic) / new chat. */}
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
        <AgentMessage label="Start a new chat">
          <div className="border-border/60 bg-card/40 rounded-2xl border p-4 backdrop-blur sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <SparklesIcon className="text-brand size-4 shrink-0" />
              <span className="font-medium">
                Tweak your prompt or try a new idea
              </span>
              <span className="text-muted-foreground">
                — each run makes one video.
              </span>
            </div>
            <CreateRunForm />
          </div>
        </AgentMessage>
      )}
    </div>
  );
}
