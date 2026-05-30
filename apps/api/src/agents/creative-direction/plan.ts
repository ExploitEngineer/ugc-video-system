// Deterministic pipeline sequencing for the Creative Direction Agent.
//
// The agent order is fixed; the only branch is whether `person_sheet` runs
// (skipped when a person image was uploaded). The Critic stages run in BOTH
// modes; confirm-mode gating pauses after each VALIDATED stage — i.e. after
// `product_inspection` and after `storyboard_inspection` (SPEC §4 mermaid).

import type { Step } from "@ugc/shared";

/** The first step of every run. */
export function firstStep(): Step {
  return "product_sheet";
}

/**
 * The step that follows `step`, or `null` when the pipeline is complete.
 * `personUploaded` skips the `person_sheet` generation step.
 */
export function nextStep(step: Step, personUploaded: boolean): Step | null {
  switch (step) {
    case "product_sheet":
      return personUploaded ? "product_inspection" : "person_sheet";
    case "person_sheet":
      return "product_inspection";
    case "product_inspection":
      return "storyboard";
    case "storyboard":
      return "storyboard_inspection";
    case "storyboard_inspection":
      return "video";
    case "video":
      return null;
  }
}

/** Confirm-mode pause points: after a Critic stage validates an artifact. */
export function isGateStep(step: Step): boolean {
  return step === "product_inspection" || step === "storyboard_inspection";
}

/**
 * The generation step to re-run when the user rejects a gated artifact
 * (status `regenerating`). Maps a gate (inspection) step back to the producer
 * step that owns its stage.
 */
export function genStepForGate(step: Step): Step {
  return step === "storyboard_inspection" ? "storyboard" : "product_sheet";
}
