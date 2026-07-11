// Shared display metadata for run steps + statuses. Pure data/helpers, no JSX.

import {
  isMultiSegment,
  type RunDetail,
  type RunStatus,
  type Step,
  type StepEventStatus,
  segmentCountFor,
} from "@ugc/shared";

// Critic inspection steps (product_inspection / storyboard_inspection) are
// intentionally omitted — the Critic is parked (off by default), so they never
// run and must not render in the timeline. They remain in the shared `Step`
// enum (and so in STEP_LABEL/STEP_AGENT below) for when the Critic is restored.
export const STEP_ORDER: Step[] = [
  "creative_brief",
  "product_sheet",
  "person_sheet",
  "storyboard",
  "video",
];

/** The multi-segment pipeline timeline — master storyboard → N clips → merge. */
export const STEP_ORDER_MULTI: Step[] = [
  "creative_brief",
  "product_sheet",
  "person_sheet",
  "segment_storyboard",
  "segment_video",
  "merge",
];

/**
 * The `template` pipeline timeline. NOT the base order with steps appended —
 * `template_plan` runs FIRST (before any image or video spend), and the copy +
 * images are written between the storyboard and the clip. Single-clip only, so
 * there is no multi-segment variant.
 */
export const STEP_ORDER_TEMPLATE: Step[] = [
  "template_plan",
  "product_sheet",
  "person_sheet",
  "storyboard",
  "template_fill",
  "template_images",
  "video",
  "template_render",
];

/** The timeline steps for a run, by its duration + pipeline. */
export function stepOrderFor(
  duration: RunDetail["duration"],
  pipeline: RunDetail["pipeline"] = "video",
): Step[] {
  if (pipeline === "template") return STEP_ORDER_TEMPLATE;
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

/**
 * What a re-template re-runs, and what it carries over. Exactly the two halves
 * of `nextStep(..., retemplating: true)` on the API: the plan, the copy, the
 * stills and the composite are keyed to the template's slots; the reference
 * sheets, the storyboard and the 15s master clip say nothing about which After
 * Effects project they end up inside.
 */
const REUSED_ON_RETEMPLATE: Step[] = [
  "creative_brief",
  "product_sheet",
  "person_sheet",
  "storyboard",
  "video",
];

/**
 * When the run's CURRENT template pass began — the newest `template_plan`
 * `started` event. Null for a run that has never planned a template.
 *
 * `template_plan` opens every template pass, on a fresh run and on a
 * re-template alike, so it is the boundary itself. No extra state needed.
 */
function passStartedAt(run: RunDetail): string | null {
  for (let i = run.stepEvents.length - 1; i >= 0; i--) {
    const e = run.stepEvents[i];
    if (e.step === "template_plan" && e.status === "started")
      return e.createdAt;
  }
  return null;
}

/**
 * A step's events WITHIN the current pass.
 *
 * Step events are append-only: nothing deletes them, so after a re-template the
 * run still carries pass 1's `template_fill: passed`. Read naively, that makes a
 * step that has not started yet read as "Passed". Scoping to the pass fixes it,
 * and is a no-op everywhere else:
 *
 *  - a fresh template run — `template_plan` is its first step, so every later
 *    event is in-pass;
 *  - `regenerate-video` — `template_plan` does not re-run, the boundary holds;
 *  - `regenerate-template` rewinding to the start — `template_plan` DOES re-run,
 *    and there the sheets genuinely re-run too, so dropping their stale events
 *    is exactly right.
 */
function eventsInPass(run: RunDetail, step: Step) {
  const events = run.stepEvents.filter((e) => e.step === step);
  const since = passStartedAt(run);
  if (!since) return events;
  return events.filter((e) => e.createdAt >= since);
}

/**
 * An optimistic RunDetail for the instant a regenerate/re-template button is
 * clicked — BEFORE the server responds. Flips the run to `running` and appends
 * a synthetic `regenerated` event on the target step, so the timeline lights the
 * amber loader on the click rather than after the round trip. The server's
 * authoritative response (which carries the REAL seeded event) then overwrites
 * this with an identical-looking state, so the spinner never flickers.
 *
 * `onError` rolls back to the pre-click snapshot the caller captured.
 */
export function optimisticRegen(
  run: RunDetail,
  target: Step,
  opts: {
    segmentIndex?: number;
    /** The re-template case: also flip `retemplating` and the template identity. */
    retemplate?: { templateId: string; templateName: string | null };
  } = {},
): RunDetail {
  const now = new Date().toISOString();
  return {
    ...run,
    status: "running",
    retemplating: opts.retemplate ? true : run.retemplating,
    ...(opts.retemplate
      ? {
          templateId: opts.retemplate.templateId,
          templateName: opts.retemplate.templateName,
        }
      : {}),
    stepEvents: [
      ...run.stepEvents,
      {
        id: `optimistic-${target}-${now}`,
        runId: run.id,
        step: target,
        status: "regenerated" as const,
        payload:
          opts.segmentIndex != null
            ? { source: "user_regen", segmentIndex: opts.segmentIndex }
            : { source: "user_regen" },
        createdAt: now,
      },
    ],
  };
}

/** The video step a `regenerate-video` click re-runs, by run shape. */
export function videoRegenTarget(run: RunDetail): Step {
  return isMultiSegment(run.duration) ? "segment_video" : "video";
}

export const STEP_LABEL: Record<Step, string> = {
  creative_brief: "Creative brief",
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
  // pipeline:"template" only — automatic, never gated (see plan.ts)
  template_plan: "Planning your template ad",
  // "fill" in the step id is ambiguous — it reads as if it fills everything.
  // It only writes the TEXT layers; the images and the clip are separate steps.
  template_fill: "Writing the template's text",
  template_images: "Designing your template images",
  template_render: "Assembling your template ad",
};

/** The skill + agent responsible for each step — surfaced live in the UI. */
export interface StepAgent {
  skill: string;
  agent: string;
}

export const STEP_AGENT: Record<Step, StepAgent> = {
  creative_brief: {
    skill: "Creative Brief Builder",
    agent: "Creative Direction Agent",
  },
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
  // pipeline:"template" only — automatic, never gated (see plan.ts)
  template_plan: { skill: "Template Planner", agent: "Template Agent" },
  template_fill: { skill: "Template Copywriter", agent: "Template Agent" },
  template_images: { skill: "Template Image Designer", agent: "Image Agent" },
  template_render: { skill: "Template Compositor", agent: "Template Agent" },
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
  /** Re-running against a NEW template, on a run that already has its video. */
  | "rebuilding"
  | "awaiting"
  | "regenerating"
  | "done"
  /** Ran in an EARLIER pass and is being carried over, not re-run. */
  | "reused"
  | "failed"
  | "skipped";

/**
 * The latest status of each segment of the `segment_video` fan-out, keyed by
 * `segmentIndex`. All N clips write their events under the SAME `step:
 * "segment_video"`, discriminated only by `payload.segmentIndex`. Step events
 * are append-only and ordered oldest→newest, so walking them and letting the
 * later write win yields each segment's CURRENT status — which is what a regen
 * (that appends a fresh `started` after an old terminal event) needs.
 */
function latestPerSegment(run: RunDetail): Map<number, StepEventStatus> {
  const per = new Map<number, StepEventStatus>();
  for (const e of run.stepEvents) {
    if (e.step !== "segment_video") continue;
    const idx = Number(
      (e.payload as { segmentIndex?: number } | null)?.segmentIndex,
    );
    if (Number.isNaN(idx)) continue;
    per.set(idx, e.status); // oldest→newest ⇒ last write wins = newest
  }
  return per;
}

/** How many segments of a multi-segment run are currently done (latest = passed),
 *  counting each segment ONCE by its newest event (not raw passed events, which a
 *  regen would double-count). */
export function passedSegmentCount(run: RunDetail): number {
  return [...latestPerSegment(run).values()].filter((s) => s === "passed")
    .length;
}

/**
 * The steps currently executing — those whose LATEST event is non-terminal
 * (`started`, or `regenerated` between in-clip retry-ladder attempts).
 * `currentStep` on the run is the LAST COMPLETED step, so it can't tell us
 * what's running; step events can. Returns MULTIPLE steps when they run
 * concurrently (the product + person reference sheets are generated in
 * parallel). Empty when the run isn't actively working a step.
 *
 * Step events are APPEND-ONLY, so a regenerate appends a fresh `started` AFTER
 * the prior attempt's `failed`/`passed`. We therefore key off the LATEST event,
 * never `.some(passed||failed)` — the stale terminal event would otherwise mark
 * a genuinely-re-running step as finished forever (the regenerate bug: no
 * spinner, stuck "Failed").
 */
export function activeSteps(run: RunDetail): Step[] {
  if (run.status !== "running" && run.status !== "regenerating") return [];
  const segCount = segmentCountFor(run.duration);
  const active: Step[] = [];
  for (const step of stepOrderFor(run.duration, run.pipeline)) {
    // Pass-scoped, so active-detection agrees with `stepState`'s terminal logic
    // (which also reads `eventsInPass`). During a re-template a prior pass's
    // `started`/`passed` would otherwise leak in and flip a step's state. A no-op
    // for non-template runs — `passStartedAt` is null, so this is all events.
    const events = eventsInPass(run, step);
    if (events.length === 0) continue;
    if (step === "segment_video") {
      // Parallel fan-out: in flight until all N segments have a TERMINAL latest
      // status. A re-run of one segment appends a fresh `started`, dropping it
      // back out of the settled count so the pill returns to "Generating".
      const per = latestPerSegment(run);
      const settled = [...per.values()].filter(
        (s) => s === "passed" || s === "failed",
      ).length;
      if (per.size > 0 && settled < segCount) active.push(step);
    } else {
      const last = events[events.length - 1];
      if (last.status === "started" || last.status === "regenerated") {
        active.push(step);
      }
    }
  }
  return active;
}

/** Resolve the display state of a single step from the run detail. */
export function stepState(run: RunDetail, step: Step): StepState {
  const order = stepOrderFor(run.duration, run.pipeline);
  const idx = order.indexOf(step);
  // `currentStep` is null before the first step completes (and during the
  // parallel reference phase) → -1, so no step reads as "behind currentStep".
  const currentIdx = run.currentStep ? order.indexOf(run.currentStep) : -1;
  // Scoped to the CURRENT pass: a re-template leaves the previous pass's
  // terminal events behind, and they would otherwise mark a step "Passed"
  // before it has run.
  const events = eventsInPass(run, step);

  // Skipped reference steps are known up front from the run's asset plan (the
  // backend resolves them from the ad type's asset policy + uploads). Render
  // "Skipped" immediately, never flashing "Generating" during the parallel phase.
  if (run.skippedSteps.includes(step)) return "skipped";

  // A re-template reuses everything that is not keyed to the template's slots.
  // This must come BEFORE the reference-phase branch below: that branch keys off
  // `currentStep === null`, which a re-template also sets, and would then find
  // the PREVIOUS pass's `started` events and report both sheets as "Generating"
  // while nothing at all is running.
  if (run.retemplating && REUSED_ON_RETEMPLATE.includes(step)) return "reused";

  // Parallel reference phase: while it's in flight (the backend keeps
  // `currentStep` null until BOTH the product and person sheets finish), every
  // reference step that has started reads as "Generating" — so the pair stays
  // synchronized instead of the faster sheet flipping to "Passed" early. Once
  // the backend advances `currentStep`, the checkpoint logic below flips both
  // to "done" together.
  if (
    REFERENCE_STEPS.includes(step) &&
    run.status === "running" &&
    run.currentStep === null &&
    !run.retemplating
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
  // Amber for work being REDONE, brand for work being done the first time. Three
  // things count as redone: a re-template (`rebuilding`), the confirm-mode revise
  // loop (`status: regenerating`), and a step whose latest event is `regenerated`
  // — which is what a user "Regenerate clip" / "Try another template" click seeds,
  // and what the video retry-ladder writes mid-render. Driving off the EVENT, not
  // just the run status, is what lets `regenerate-video` (which stays
  // `status: running`) still read amber.
  if (activeSteps(run).includes(step)) {
    if (run.retemplating) return "rebuilding";
    const latest = eventsInPass(run, step).at(-1)?.status;
    if (run.status === "regenerating" || latest === "regenerated")
      return "regenerating";
    return "active";
  }

  // Event-authoritative terminal status. Step events are the source of truth and
  // OVERRIDE the run-level status (which describes the run as a whole). This is
  // the cancel-bug fix: a PASSED step (e.g. a finished storyboard) stays "done"
  // with its artifact even after the run is later cancelled/failed; a step closed
  // out as failed (a genuine failure, or an in-flight step a cancel terminated)
  // reads "failed" — never inheriting a neighbour's run-level state.
  //
  // Use the LATEST terminal event, not `.some()`: step events are append-only,
  // so a regenerate leaves the prior attempt's `failed` in history behind the
  // new attempt's `passed`. `.some(failed)` would pin the step to "Failed"
  // forever (the regenerate bug — including after a SUCCESSFUL regen). A
  // genuinely re-running step is already caught by `activeSteps` above, so by
  // here the latest terminal event is the real resting state.
  const lastTerminal = [...events]
    .reverse()
    .find((e) => e.status === "passed" || e.status === "failed");
  // At a confirm-mode gate the current (passed) step carries the gate state.
  if (idx === currentIdx && run.status === "awaiting_confirmation")
    return "awaiting";
  if (idx === currentIdx && run.status === "regenerating")
    return "regenerating";
  if (lastTerminal?.status === "failed") return "failed";
  if (lastTerminal?.status === "passed") return "done";

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

/**
 * A resting state for the reply composer: no step is actively advancing, so the
 * step-by-step FeedbackBar / cancel bar are hidden and the "new chat" footer
 * shows. `awaiting_regen` is recoverable (the user regenerates via the clip
 * banner), but for composer purposes it rests exactly like `completed`/`failed`.
 */
export function isTerminal(status: RunStatus) {
  return (
    status === "completed" || status === "failed" || status === "awaiting_regen"
  );
}
