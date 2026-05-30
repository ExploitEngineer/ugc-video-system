"use client";

import type { AssetKind, RunDetail, Step } from "@ugc/shared";
import { motion } from "framer-motion";
import {
  CheckIcon,
  CircleDashedIcon,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STEP_ASSET_KIND: Partial<Record<Step, AssetKind>> = {
  product_sheet: "product_sheet",
  person_sheet: "person_sheet",
  storyboard: "storyboard_sheet",
  video: "final_video",
};

const STATE_BADGE: Record<
  StepState,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "brand" | "destructive";
  }
> = {
  pending: { label: "Pending", variant: "outline" },
  active: { label: "Generating", variant: "brand" },
  awaiting: { label: "Ready to confirm", variant: "default" },
  regenerating: { label: "Regenerating", variant: "secondary" },
  done: { label: "Passed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Skipped", variant: "outline" },
};

function Indicator({ state, n }: { state: StepState; n: number }) {
  const base =
    "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold";
  switch (state) {
    case "done":
      return (
        <span
          className={cn(
            base,
            "bg-brand-gradient text-brand-foreground border-transparent",
          )}
        >
          <CheckIcon className="size-4" />
        </span>
      );
    case "active":
      return (
        <span className={cn(base, "border-brand text-brand")}>
          <span className="bg-brand/25 absolute inset-0 animate-ping rounded-full" />
          <Loader2Icon className="size-4 animate-spin" />
        </span>
      );
    case "regenerating":
      return (
        <span className={cn(base, "border-amber-500 text-amber-500")}>
          <Loader2Icon className="size-4 animate-spin" />
        </span>
      );
    case "awaiting":
      return (
        <span className={cn(base, "border-brand text-brand")}>
          <PauseIcon className="size-4" />
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "border-destructive text-destructive")}>
          <XIcon className="size-4" />
        </span>
      );
    case "skipped":
      return (
        <span className={cn(base, "text-muted-foreground border-dashed")}>
          <MinusIcon className="size-4" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "text-muted-foreground")}>
          <span className="flex items-center gap-0.5">
            <CircleDashedIcon className="text-muted-foreground/40 absolute size-9" />
            {n}
          </span>
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

        return (
          <motion.li
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.03 }}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-9 left-[17px] -bottom-0 w-px",
                  state === "done" ? "bg-brand/50" : "bg-border",
                )}
              />
            )}

            <Indicator state={state} n={i + 1} />

            <div className={cn("min-w-0 flex-1", dim && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold">{STEP_LABEL[step]}</h3>
                <Badge
                  variant={STATE_BADGE[state].variant}
                  className="text-[10px]"
                >
                  {STATE_BADGE[state].label}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
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
