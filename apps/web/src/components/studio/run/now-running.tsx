"use client";

import type { RunDetail } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon } from "lucide-react";

import {
  STEP_AGENT,
  type StepState,
  stepOrderFor,
  stepState,
} from "@/components/studio/run/run-meta";
import { cn } from "@/lib/utils";

/** The in-flight states this banner renders, and how each reads. Amber for work
 *  being redone (a regen or a re-template), brand for a first-time run. Matches
 *  the timeline pill vocabulary so the two never disagree. */
const ROW: Record<
  "active" | "regenerating" | "rebuilding",
  { label: string; amber: boolean }
> = {
  active: { label: "Running", amber: false },
  regenerating: { label: "Regenerating", amber: true },
  rebuilding: { label: "Rebuilding", amber: true },
};

const isRowState = (s: StepState): s is keyof typeof ROW => s in ROW;

/**
 * Live "what's running right now" banner — names the currently-executing skills
 * and the agents driving them. Derived from `stepState` (the same source the
 * timeline uses) so the banner and timeline never disagree: the parallel
 * product + person reference sheets appear and clear together as one phase.
 * Hidden when no step is actively in flight.
 */
export function NowRunning({ run }: { run: RunDetail }) {
  // Use the run's REAL step order (15s vs multi-segment, + the template
  // pipeline's template_fill/template_render) — otherwise those in-flight steps
  // are never named in the banner. Each row is coloured by its OWN state, so a
  // regenerated clip reads amber even though the run status is still `running`.
  const rows = stepOrderFor(run.duration, run.pipeline)
    .map((step) => ({ step, state: stepState(run, step) }))
    .filter((r) => isRowState(r.state));

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {rows.map(({ step, state }) => {
          const { label, amber } = ROW[state as keyof typeof ROW];
          return (
            <motion.div
              key={step}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "bg-card/70 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur",
                amber ? "border-warning/40" : "ring-glow border-brand/30",
              )}
            >
              <span className="relative flex size-8 shrink-0 items-center justify-center">
                <span
                  className={cn(
                    "absolute inset-0 -z-10 rounded-full blur-md",
                    amber ? "bg-warning/25" : "bg-brand/30",
                  )}
                />
                <Loader2Icon
                  className={cn(
                    "size-5 animate-spin motion-reduce:animate-none",
                    amber ? "text-warning" : "text-brand",
                  )}
                />
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  {label}
                </p>
                <p className="truncate text-sm font-semibold">
                  <span className={amber ? "text-warning" : "text-brand"}>
                    {STEP_AGENT[step].skill}
                  </span>
                  <span className="text-muted-foreground"> skill</span>
                  <span className="text-muted-foreground/60"> · </span>
                  <span>{STEP_AGENT[step].agent}</span>
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
