// Deterministic pipeline sequencing for the Creative Direction Agent.
//
// The agent order is fixed; the only branch is whether `person_sheet` runs
// (skipped when a person image was uploaded). The Critic stages run in BOTH
// modes; confirm-mode gating pauses after each VALIDATED stage — i.e. after
// `product_inspection` and after `storyboard_inspection` (SPEC §4 mermaid).

import type { Duration, Step } from "@ugc/shared";

/** The first step of every run. */
export function firstStep(): Step {
  return "product_sheet";
}

/**
 * The step that follows `step`, or `null` when the pipeline is complete.
 * `person_sheet` ALWAYS runs — when a person is uploaded it is built from that
 * photo (identity-locked), otherwise it is invented from the product brief — so
 * the storyboard always consumes a generated reference sheet, never the raw
 * upload. `personUploaded` is retained for the caller's parallel-phase bookkeeping.
 * `criticEnabled` (off) drops both Critic inspection steps — and with them the
 * confirm-mode gates, so a critic-off run never pauses.
 */
export function nextStep(
  step: Step,
  _personUploaded: boolean,
  criticEnabled: boolean,
  duration: Duration = "15s",
): Step | null {
  const sixty = duration === "60s";
  // What follows the reference phase: inspection (critic on), else the 60s
  // single 16-panel master storyboard or the 15s single storyboard. (The 60s
  // `narrative_outline` step is retired — the master is authored as ONE coherent
  // scene from the prompt, so there are no per-segment summaries to plan.)
  const afterReference: Step = criticEnabled
    ? "product_inspection"
    : sixty
      ? "segment_storyboard"
      : "storyboard";
  const afterProductInspection: Step = sixty
    ? "segment_storyboard"
    : "storyboard";
  switch (step) {
    case "product_sheet":
      return "person_sheet";
    case "person_sheet":
      return afterReference;
    case "product_inspection":
      return afterProductInspection;
    case "storyboard":
      return criticEnabled ? "storyboard_inspection" : "video";
    case "storyboard_inspection":
      return "video";
    case "video":
      return null;
    // 60s pipeline: master storyboard (+ row crops) → four videos → merge.
    // `narrative_outline` is dormant (never sequenced) but kept in the enum.
    case "narrative_outline":
      return "segment_storyboard";
    case "segment_storyboard":
      return "segment_video";
    case "segment_video":
      return "merge";
    case "merge":
      return null;
  }
}

/**
 * Step-by-step pause points. Decoupled from the Critic: instead of keying off
 * inspection steps (which vanish when the Critic is off), we gate on WHAT THE
 * NEXT STEP WOULD BE. `nextStep` already collapses inspection steps, so this
 * fires whether or not they run:
 *   - reference gate  → right before `storyboard` (both reference sheets ready)
 *   - storyboard gate → right before `video`
 */
export type Gate = "reference" | "storyboard";

/**
 * The gate we land at by completing the step whose next step is `next`.
 *   - reference gate  → right before the storyboard work (both ref sheets ready):
 *     15s `storyboard`, 60s `segment_storyboard` (the first post-reference step).
 *   - storyboard gate → right before the video work (storyboard ready):
 *     15s `video`, 60s `segment_video` (after the master + its row crops).
 */
export function gateForNext(next: Step | null): Gate | null {
  if (next === "storyboard" || next === "segment_storyboard") return "reference";
  if (next === "video" || next === "segment_video") return "storyboard";
  return null;
}

/**
 * Recover the gate of a paused run from its `currentStep` (= last completed
 * step). Mirrors `gateForNext` for every step that can sit at a gate. For 60s
 * the storyboard gate is sat at `segment_storyboard` (all four sheets done).
 */
export function gateForCurrentStep(step: Step): Gate | null {
  switch (step) {
    case "product_sheet":
    case "person_sheet":
    case "product_inspection":
      return "reference";
    case "storyboard":
    case "storyboard_inspection":
    case "segment_storyboard":
      return "storyboard";
    default:
      return null;
  }
}

/**
 * The generation step to re-run when the user revises a gated artifact
 * (status `regenerating`). The reference gate always re-runs `person_sheet`
 * (the product sheet is hidden from the user, so `target` "product" is ignored).
 * The storyboard gate re-runs the single `storyboard` (15s) or the segment
 * storyboards (60s — narrowed to the targeted segment in the orchestrator).
 */
export function genStepForRevise(
  gate: Gate,
  _target: "product" | "person" | null,
  duration: Duration = "15s",
): Step {
  if (gate !== "storyboard") return "person_sheet";
  return duration === "60s" ? "segment_storyboard" : "storyboard";
}
