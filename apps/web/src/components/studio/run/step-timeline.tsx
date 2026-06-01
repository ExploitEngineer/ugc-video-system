"use client";

import type { AssetKind, RunDetail, Step } from "@ugc/shared";
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
  STEP_LABEL,
  STEP_ORDER,
  STEP_SUBLABEL,
  type StepState,
  stepState,
} from "@/components/studio/run/run-meta";
import { cn } from "@/lib/utils";

const STEP_ASSET_KIND: Partial<Record<Step, AssetKind>> = {
  product_sheet: "product_sheet",
  person_sheet: "person_sheet",
  storyboard: "storyboard_sheet",
  video: "final_video",
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

function StatusPill({ state }: { state: StepState }) {
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
    </span>
  );
}

function Indicator({ state, n }: { state: StepState; n: number }) {
  const base =
    "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors";
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
  return (
    <ol className="relative">
      {STEP_ORDER.map((step, i) => {
        const state = stepState(run, step);
        const assetKind = STEP_ASSET_KIND[step];
        const asset = assetKind
          ? run.assets.find((a) => a.kind === assetKind)
          : undefined;
        const showAsset = asset && (state === "done" || state === "awaiting");
        const last = i === STEP_ORDER.length - 1;
        const dim = state === "pending" || state === "skipped";
        const live =
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

            <Indicator state={state} n={i + 1} />

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
                <StatusPill state={state} />
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {STEP_SUBLABEL[step]}
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
