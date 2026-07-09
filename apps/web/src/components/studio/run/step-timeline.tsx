"use client";

import {
  type AssetKind,
  isMultiSegment,
  type RunDetail,
  type Step,
  segmentCountFor,
} from "@ugc/shared";
import { motion } from "framer-motion";
import {
  CheckIcon,
  Loader2Icon,
  MinusIcon,
  PauseIcon,
  XIcon,
} from "lucide-react";

import { ArtifactCard } from "@/components/studio/run/artifact-card";
import {
  gateOf,
  gateStartsStep,
  passedSegmentCount,
  STEP_LABEL,
  type StepState,
  stepOrderFor,
  stepState,
  stepSublabel,
} from "@/components/studio/run/run-meta";
import { cn } from "@/lib/utils";

const STEP_ASSET_KIND: Partial<Record<Step, AssetKind>> = {
  // product_sheet intentionally omitted — the product reference sheet is a
  // private internal artifact and must not be shown to the user.
  person_sheet: "person_sheet",
  storyboard: "storyboard_sheet",
  video: "final_video",
  // Multi-segment: segment_storyboard's artifact is the single N×4-panel master
  // sheet; the merge step's is the final merged clip. The N segment clips are
  // shown in their own gallery in the run view.
  segment_storyboard: "storyboard_master",
  merge: "final_video",
  // The Nexrender template output (optional final step).
  template_render: "templated_video",
};

/** Compact status pill — a colored dot + label, far lighter than a chip. */
const PILL: Record<StepState, { label: string; cls: string; dot: string }> = {
  pending: {
    label: "Pending",
    cls: "border-border/60 text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  active: {
    label: "Generating",
    cls: "border-brand/40 bg-brand/10 text-brand",
    dot: "bg-brand animate-pulse",
  },
  awaiting: {
    label: "Ready to confirm",
    cls: "border-brand/40 bg-brand/10 text-brand",
    dot: "bg-brand",
  },
  regenerating: {
    label: "Regenerating",
    cls: "border-warning/40 bg-warning/10 text-warning",
    dot: "bg-warning animate-pulse",
  },
  done: {
    label: "Passed",
    cls: "border-success/30 bg-success/10 text-success",
    dot: "bg-success",
  },
  failed: {
    label: "Failed",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  skipped: {
    label: "Skipped",
    cls: "border-dashed border-border/60 text-muted-foreground/60",
    dot: "bg-muted-foreground/25",
  },
};

function StatusPill({ state, note }: { state: StepState; note?: string }) {
  const p = PILL[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        p.cls,
      )}
    >
      <span className={cn("size-1.5 rounded-full", p.dot)} />
      {p.label}
      {note && <span className="tabular-nums opacity-70">· {note}</span>}
    </span>
  );
}

/**
 * Pill for the step a paused run is held BEFORE — makes the "pause before the
 * next agent" explicit instead of leaving the gated step reading as a plain
 * "Pending". Purely presentational; `stepState` still returns "pending".
 */
function UpNextPill() {
  return (
    <span className="border-brand/40 bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium">
      <span className="bg-brand size-1.5 rounded-full" />
      Up next — approve to start
    </span>
  );
}

function Indicator({
  state,
  n,
  upNext,
}: {
  state: StepState;
  n: number;
  upNext?: boolean;
}) {
  const base =
    "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors";
  if (upNext) {
    return (
      <span
        className={cn(
          base,
          "border-brand/60 text-brand bg-brand/5 tabular-nums",
        )}
      >
        <span className="border-brand/40 absolute inset-0 animate-pulse rounded-full border" />
        {n}
      </span>
    );
  }
  switch (state) {
    case "done":
      return (
        <span
          className={cn(
            base,
            "bg-brand-gradient text-brand-foreground border-transparent shadow-sm",
          )}
        >
          <CheckIcon className="size-4" />
        </span>
      );
    case "active":
      return (
        <span className={cn(base, "border-brand text-brand bg-brand/10")}>
          <span className="bg-brand/40 absolute -inset-1 -z-10 rounded-full blur-md" />
          <span className="border-brand/50 absolute inset-0 animate-ping rounded-full border" />
          <Loader2Icon className="size-4 animate-spin" />
        </span>
      );
    case "regenerating":
      return (
        <span className={cn(base, "border-warning text-warning bg-warning/10")}>
          <Loader2Icon className="size-4 animate-spin" />
        </span>
      );
    case "awaiting":
      return (
        <span className={cn(base, "border-brand text-brand bg-brand/10")}>
          <span className="bg-brand/30 absolute -inset-1 -z-10 rounded-full blur-md" />
          <PauseIcon className="size-4" />
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(
            base,
            "border-destructive text-destructive bg-destructive/10",
          )}
        >
          <XIcon className="size-4" />
        </span>
      );
    case "skipped":
      return (
        <span
          className={cn(
            base,
            "text-muted-foreground/60 border-dashed bg-transparent",
          )}
        >
          <MinusIcon className="size-4" />
        </span>
      );
    default:
      return (
        <span
          className={cn(
            base,
            "border-border/70 bg-muted/40 text-muted-foreground/70 tabular-nums",
          )}
        >
          {n}
        </span>
      );
  }
}

export function StepTimeline({ run }: { run: RunDetail }) {
  // The step a paused run is held BEFORE (storyboard at the reference gate,
  // video at the storyboard gate) — surfaced as an explicit "Up next" cue.
  const awaitingGate =
    run.status === "awaiting_confirmation" ? gateOf(run.currentStep) : null;
  const upNextStep = awaitingGate
    ? gateStartsStep(awaitingGate, run.duration)
    : null;
  // `creative_brief` belongs only to the service path; drop it from the timeline
  // for the product types (where it's skipped) so they don't show a confusing
  // "Skipped" row for a step that isn't part of their pipeline at all.
  // `stepOrderFor` already appends template_fill/template_render only for
  // pipeline:"template" runs.
  const order = stepOrderFor(run.duration, run.pipeline).filter(
    (s) =>
      s !== "creative_brief" || !run.skippedSteps.includes("creative_brief"),
  );

  return (
    <ol className="relative">
      {order.map((step, i) => {
        const state = stepState(run, step);
        const upNext = step === upNextStep && state === "pending";
        const assetKind = STEP_ASSET_KIND[step];
        // Assets arrive oldest-first; a revise appends a NEW sheet of the same
        // kind, so pick the LAST match (newest) — otherwise the gate keeps
        // showing the pre-revise sheet.
        const asset = assetKind
          ? run.assets.findLast((a) => a.kind === assetKind)
          : undefined;
        // Show the artifact whenever it EXISTS — not only on done/awaiting. A
        // run cancelled/failed after a step produced its sheet still has that
        // artifact in the DB, and it must stay visible (the cancel-bug fix).
        // Only hide while the step is actively generating its first output
        // (nothing persisted yet anyway).
        const showAsset = Boolean(asset) && state !== "active";
        // Multi-segment video fan-out: surface live "done/total" progress while
        // the N clips render in parallel, so a minutes-long "Generating" visibly
        // advances as each segment lands (every passed event pushes a snapshot).
        const segNote =
          step === "segment_video" &&
          isMultiSegment(run.duration) &&
          (state === "active" || state === "regenerating")
            ? `${passedSegmentCount(run)}/${segmentCountFor(run.duration)}`
            : undefined;
        const last = i === order.length - 1;
        const dim = (state === "pending" || state === "skipped") && !upNext;
        const live =
          upNext ||
          state === "active" ||
          state === "awaiting" ||
          state === "regenerating";

        return (
          <motion.li
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.03 }}
            className="relative flex gap-4 pb-7 last:pb-0"
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-9 bottom-1 left-[17px] w-px",
                  state === "done"
                    ? "bg-gradient-to-b from-brand/60 to-brand/15"
                    : "bg-border",
                )}
              />
            )}

            <Indicator state={state} n={i + 1} upNext={upNext} />

            <div
              className={cn(
                "relative min-w-0 flex-1",
                dim && "opacity-55",
                // Glow box behind the live step — pseudo, so no layout shift.
                live &&
                  "before:bg-accent/40 before:ring-brand/20 before:absolute before:-inset-x-3 before:-inset-y-2.5 before:-z-10 before:rounded-2xl before:ring-1",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3
                  className={cn(
                    "text-sm font-semibold",
                    live ? "text-foreground" : "text-foreground/90",
                  )}
                >
                  {STEP_LABEL[step]}
                </h3>
                {upNext ? (
                  <UpNextPill />
                ) : (
                  <StatusPill state={state} note={segNote} />
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {stepSublabel(step)}
              </p>

              {showAsset && asset && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35 }}
                  className="mt-3 max-w-md"
                >
                  <ArtifactCard asset={asset} title={STEP_LABEL[step]} />
                </motion.div>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
