"use client";

import type { RunDetail } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon } from "lucide-react";

import {
  STEP_AGENT,
  stepOrderFor,
  stepState,
} from "@/components/studio/run/run-meta";

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
  // are never named in the banner.
  const steps = stepOrderFor(run.duration, run.pipeline).filter((step) => {
    const state = stepState(run, step);
    return state === "active" || state === "regenerating";
  });
  const regenerating = run.status === "regenerating";

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.div
            key={step}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="ring-glow border-brand/30 bg-card/70 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur"
          >
            <span className="relative flex size-8 shrink-0 items-center justify-center">
              <span className="bg-brand/30 absolute inset-0 -z-10 rounded-full blur-md" />
              <Loader2Icon className="text-brand size-5 animate-spin" />
            </span>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {regenerating ? "Regenerating" : "Running"}
              </p>
              <p className="truncate text-sm font-semibold">
                <span className="text-brand">{STEP_AGENT[step].skill}</span>
                <span className="text-muted-foreground"> skill</span>
                <span className="text-muted-foreground/60"> · </span>
                <span>{STEP_AGENT[step].agent}</span>
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
