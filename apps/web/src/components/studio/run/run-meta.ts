// Shared display metadata for run steps + statuses. Pure data/helpers, no JSX.

import type { RunDetail, RunStatus, Step } from "@ugc/shared";

export const STEP_ORDER: Step[] = [
  "product_sheet",
  "person_sheet",
  "product_inspection",
  "storyboard",
  "storyboard_inspection",
  "video",
];

export const STEP_LABEL: Record<Step, string> = {
  product_sheet: "Product reference sheet",
  person_sheet: "Person reference sheet",
  product_inspection: "Product inspection",
  storyboard: "Storyboard sheet",
  storyboard_inspection: "Storyboard inspection",
  video: "Final ad video",
};

/** The skill + agent responsible for each step — surfaced live in the UI. */
export interface StepAgent {
  skill: string;
  agent: string;
}

export const STEP_AGENT: Record<Step, StepAgent> = {
  product_sheet: { skill: "Product Sheet Builder", agent: "Image Agent" },
  person_sheet: { skill: "Person Sheet Builder", agent: "Image Agent" },
  product_inspection: { skill: "Product Inspection", agent: "Critic Agent" },
  storyboard: { skill: "Storyboard", agent: "Image Agent" },
  storyboard_inspection: {
    skill: "Storyboard Inspection",
    agent: "Critic Agent",
  },
  video: { skill: "Video Builder", agent: "Video Agent" },
};

/** `"<skill> · <agent>"` — the timeline sublabel for a step. */
export function stepSublabel(step: Step): string {
  const { skill, agent } = STEP_AGENT[step];
  return `${skill} · ${agent}`;
}

export type StepState =
  | "pending"
  | "active"
  | "awaiting"
  | "regenerating"
  | "done"
  | "failed"
  | "skipped";

/**
 * The step currently executing — the one with a `started` event but no
 * terminal (`passed`/`failed`) event yet. `currentStep` on the run is the LAST
 * COMPLETED step, so it can't tell us what's running; step events can.
 * Returns null when the run isn't actively working a step.
 */
export function activeStep(run: RunDetail): Step | null {
  if (run.status !== "running" && run.status !== "regenerating") return null;
  for (const step of STEP_ORDER) {
    const events = run.stepEvents.filter((e) => e.step === step);
    if (events.length === 0) continue;
    const started = events.some((e) => e.status === "started");
    const ended = events.some(
      (e) => e.status === "passed" || e.status === "failed",
    );
    if (started && !ended) return step;
  }
  return null;
}

/** Resolve the display state of a single step from the run detail. */
export function stepState(run: RunDetail, step: Step): StepState {
  const idx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(run.currentStep);
  const events = run.stepEvents.filter((e) => e.step === step);
  const hasPassed = events.some((e) => e.status === "passed");

  // Person sheet is skipped when no person image was provided (the run
  // advances past it without ever emitting an event).
  if (
    step === "person_sheet" &&
    events.length === 0 &&
    currentIdx > STEP_ORDER.indexOf("person_sheet")
  ) {
    return "skipped";
  }

  // Critic inspections are dropped entirely when the critic is disabled.
  if (
    run.criticEnabled === false &&
    (step === "product_inspection" || step === "storyboard_inspection")
  ) {
    return "skipped";
  }

  // The genuinely in-flight step (derived from step events, not currentStep)
  // shows live — this is what makes the long-running video step read as
  // "Generating" instead of jumping straight to done.
  if (step === activeStep(run)) {
    return run.status === "regenerating" ? "regenerating" : "active";
  }

  if (idx === currentIdx) {
    if (run.status === "completed") return "done";
    if (run.status === "failed") return "failed";
    if (run.status === "awaiting_confirmation") return "awaiting";
    if (run.status === "regenerating") return "regenerating";
    return "active";
  }

  if (idx < currentIdx || (hasPassed && run.status === "completed")) {
    return "done";
  }

  // Steps already passed but not yet behind currentStep (e.g. while a later
  // step is in flight) should read as done, not pending.
  if (hasPassed) return "done";

  return "pending";
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  awaiting_confirmation: "Awaiting confirmation",
  regenerating: "Regenerating",
  completed: "Completed",
  failed: "Failed",
};

/** Tailwind classes for the colored status dot, shared by header + sidebar. */
export const STATUS_DOT: Record<RunStatus, string> = {
  queued: "bg-muted-foreground",
  running: "bg-brand animate-pulse",
  awaiting_confirmation: "bg-warning",
  regenerating: "bg-warning animate-pulse",
  completed: "bg-success",
  failed: "bg-destructive",
};

export function isTerminal(status: RunStatus) {
  return status === "completed" || status === "failed";
}
