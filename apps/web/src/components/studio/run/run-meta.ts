// Shared display metadata for run steps + statuses. Pure data/helpers, no JSX.

import {
  isMultiSegment,
  type RunDetail,
  type RunStatus,
  type Step,
  segmentCountFor,
} from "@ugc/shared";

// Critic inspection steps (product_inspection / storyboard_inspection) are
// intentionally omitted — the Critic is parked (off by default), so they never
// run and must not render in the timeline. They remain in the shared `Step`
// enum (and so in STEP_LABEL/STEP_AGENT below) for when the Critic is restored.
export const STEP_ORDER: Step[] = [
  "product_sheet",
  "person_sheet",
  "storyboard",
  "video",
];

/** The multi-segment pipeline timeline — master storyboard → N clips → merge. */
export const STEP_ORDER_MULTI: Step[] = [
  "product_sheet",
  "person_sheet",
  "segment_storyboard",
  "segment_video",
  "merge",
];

/** The timeline steps for a run, by its duration. */
export function stepOrderFor(duration: RunDetail["duration"]): Step[] {
  return isMultiSegment(duration) ? STEP_ORDER_MULTI : STEP_ORDER;
}

/**
 * The two reference sheets the backend generates IN PARALLEL as a single phase.
 * The backend holds `runs.currentStep` at `null` for the whole phase and only
 * advances once BOTH finish, so the UI presents them as one synchronized unit
 * (both "Generating", then both "Passed") rather than letting the faster one
 * (usually the product sheet) flip to "Passed" while the other is still running.
 */
const REFERENCE_STEPS: Step[] = ["product_sheet", "person_sheet"];

export const STEP_LABEL: Record<Step, string> = {
  product_sheet: "Product reference sheet",
  person_sheet: "Person reference sheet",
  product_inspection: "Product inspection",
  storyboard: "Storyboard sheet",
  storyboard_inspection: "Storyboard inspection",
  video: "Final ad video",
  // 60s pipeline steps
  narrative_outline: "Story outline",
  segment_storyboard: "Storyboard sheets",
  segment_video: "Segment videos",
  merge: "Final merged video",
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
  // 60s pipeline steps
  narrative_outline: {
    skill: "Narrative Outline",
    agent: "Creative Direction Agent",
  },
  segment_storyboard: { skill: "Storyboard", agent: "Image Agent" },
  segment_video: { skill: "Video Builder", agent: "Video Agent" },
  merge: { skill: "Merge", agent: "Video Agent" },
};

/** `"<skill> · <agent>"` — the timeline sublabel for a step. */
export function stepSublabel(step: Step): string {
  const { skill, agent } = STEP_AGENT[step];
  return `${skill} · ${agent}`;
}

/**
 * Step-by-step pause points, mirroring the API's `gateForCurrentStep`. A paused
 * run sits at one of two gates, named for the artifact just produced:
 *   - reference  → after the product/person sheets, BEFORE the storyboard agent
 *   - storyboard → after the storyboard sheet, BEFORE the video agent
 */
export type Gate = "reference" | "storyboard";

/** The gate a paused run sits at, derived from its `currentStep` (last completed). */
export function gateOf(step: Step | null): Gate | null {
  switch (step) {
    case "product_sheet":
    case "person_sheet":
    case "product_inspection":
      return "reference";
    case "storyboard":
    case "storyboard_inspection":
      return "storyboard";
    default:
      return null;
  }
}

/** The agent step that approving a gate will START next. */
export function gateStartsStep(
  gate: Gate,
  duration: RunDetail["duration"] = "15s",
): Step {
  if (isMultiSegment(duration)) {
    return gate === "reference" ? "segment_storyboard" : "segment_video";
  }
  return gate === "reference" ? "storyboard" : "video";
}

/** Short label for the artifact under review at each gate. */
export const GATE_READY_LABEL: Record<Gate, string> = {
  reference: "Reference sheets",
  storyboard: "Storyboard",
};

/** Short label for the agent each gate's approval kicks off. */
export const GATE_NEXT_LABEL: Record<Gate, string> = {
  reference: "Storyboard",
  storyboard: "Video",
};

export type StepState =
  | "pending"
  | "active"
  | "awaiting"
  | "regenerating"
  | "done"
  | "failed"
  | "skipped";

/**
 * The steps currently executing — each with a `started` event but no terminal
 * (`passed`/`failed`) event yet. `currentStep` on the run is the LAST COMPLETED
 * step, so it can't tell us what's running; step events can. Returns MULTIPLE
 * steps when they run concurrently (the product + person reference sheets are
 * generated in parallel). Empty when the run isn't actively working a step.
 */
export function activeSteps(run: RunDetail): Step[] {
  if (run.status !== "running" && run.status !== "regenerating") return [];
  const segCount = segmentCountFor(run.duration);
  const active: Step[] = [];
  for (const step of stepOrderFor(run.duration)) {
    const events = run.stepEvents.filter((e) => e.step === step);
    if (events.length === 0) continue;
    const started = events.some((e) => e.status === "started");
    if (step === "segment_video") {
      // Parallel fan-out: N segment clips render concurrently, each writing its
      // own started→passed/failed pair under this same step. The step is in
      // flight until ALL N have settled — NOT the moment the first one does
      // (the bug that flipped the pill back to "Pending" mid-render). A failed
      // segment fails the whole run only after runBounded waits for every
      // segment, so we keep showing "Generating" while the rest finish; the
      // run-status flip then resolves it to Failed.
      const settled = events.filter(
        (e) => e.status === "passed" || e.status === "failed",
      ).length;
      if (started && settled < segCount) active.push(step);
    } else {
      const ended = events.some(
        (e) => e.status === "passed" || e.status === "failed",
      );
      if (started && !ended) active.push(step);
    }
  }
  return active;
}

/** Resolve the display state of a single step from the run detail. */
export function stepState(run: RunDetail, step: Step): StepState {
  const order = stepOrderFor(run.duration);
  const idx = order.indexOf(step);
  // `currentStep` is null before the first step completes (and during the
  // parallel reference phase) → -1, so no step reads as "behind currentStep".
  const currentIdx = run.currentStep ? order.indexOf(run.currentStep) : -1;
  const events = run.stepEvents.filter((e) => e.step === step);
  const hasPassed = events.some((e) => e.status === "passed");

  // Skipped reference steps are known up front from the run's asset plan (the
  // backend resolves them from the ad type's asset policy + uploads). Render
  // "Skipped" immediately, never flashing "Generating" during the parallel phase.
  if (run.skippedSteps.includes(step)) return "skipped";

  // Parallel reference phase: while it's in flight (the backend keeps
  // `currentStep` null until BOTH the product and person sheets finish), every
  // reference step that has started reads as "Generating" — so the pair stays
  // synchronized instead of the faster sheet flipping to "Passed" early. Once
  // the backend advances `currentStep`, the checkpoint logic below flips both
  // to "done" together.
  if (
    REFERENCE_STEPS.includes(step) &&
    run.status === "running" &&
    run.currentStep === null
  ) {
    if (events.some((e) => e.status === "failed")) return "failed";
    // Synchronize the START of the parallel reference phase: as soon as EITHER
    // participating sheet has begun, show every participating sheet as
    // "Generating". Otherwise the sheet whose `started` event lands in the
    // earlier poll flips to active ~1 poll ahead of the other, which reads as a
    // glitch (one spinning, one still pending). A step participates iff it is
    // actually generated — a skipped reference step already returned "skipped"
    // above, so it is never pulled into the running pair.
    const participates = !run.skippedSteps.includes(step);
    if (participates) {
      const anyReferenceStarted = run.stepEvents.some(
        (e) => REFERENCE_STEPS.includes(e.step) && e.status === "started",
      );
      if (anyReferenceStarted) return "active";
    }
    // Not started yet — fall through to the generic pending handling.
  }

  // The genuinely in-flight step (derived from step events, not currentStep)
  // shows live — this is what makes the long-running video step read as
  // "Generating" instead of jumping straight to done.
  if (activeSteps(run).includes(step)) {
    return run.status === "regenerating" ? "regenerating" : "active";
  }

  // Event-authoritative terminal status. Step events are the source of truth and
  // OVERRIDE the run-level status (which describes the run as a whole). This is
  // the cancel-bug fix: a PASSED step (e.g. a finished storyboard) stays "done"
  // with its artifact even after the run is later cancelled/failed; a step closed
  // out as failed (a genuine failure, or an in-flight step a cancel terminated)
  // reads "failed" — never inheriting a neighbour's run-level state.
  const hasFailed = events.some((e) => e.status === "failed");
  // At a confirm-mode gate the current (passed) step carries the gate state.
  if (idx === currentIdx && run.status === "awaiting_confirmation")
    return "awaiting";
  if (idx === currentIdx && run.status === "regenerating")
    return "regenerating";
  if (hasFailed) return "failed";
  if (hasPassed) return "done";

  // No terminal event for this step → fall back to run-level position/status.
  // `currentStep` is the LAST COMPLETED step, so the checkpoint reads done while
  // running; the next step only goes "active" once it writes its own `started`.
  if (idx === currentIdx) {
    if (run.status === "completed") return "done";
    if (run.status === "failed") return "failed";
    return "done";
  }
  if (idx < currentIdx) return "done";
  return "pending";
}

export function isTerminal(status: RunStatus) {
  return status === "completed" || status === "failed";
}
