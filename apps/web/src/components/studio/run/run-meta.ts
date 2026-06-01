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

export const STEP_SUBLABEL: Record<Step, string> = {
  product_sheet: "Image agent · GPT Image 2",
  person_sheet: "Image agent · GPT Image 2",
  product_inspection: "Critic agent · vision",
  storyboard: "Image agent · storyboard",
  storyboard_inspection: "Critic agent · vision",
  video: "Video agent · Kling 3.0",
};

export type StepState =
  | "pending"
  | "active"
  | "awaiting"
  | "regenerating"
  | "done"
  | "failed"
  | "skipped";

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
  awaiting_confirmation: "bg-amber-500",
  regenerating: "bg-amber-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
};

export function isTerminal(status: RunStatus) {
  return status === "completed" || status === "failed";
}
