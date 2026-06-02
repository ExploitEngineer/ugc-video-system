"use client";

import type { RunDetail } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2Icon } from "lucide-react";

import { activeStep, STEP_AGENT } from "@/components/studio/run/run-meta";

/**
 * Live "what's running right now" banner — names the currently-executing skill
 * and the agent driving it, derived from step events (not `currentStep`, which
 * lags one step behind). Hidden when no step is actively in flight.
 */
export function NowRunning({ run }: { run: RunDetail }) {
  const step = activeStep(run);
  const regenerating = run.status === "regenerating";

  return (
    <AnimatePresence mode="wait">
      {step && (
        <motion.div
          key={step}
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
      )}
    </AnimatePresence>
  );
}
