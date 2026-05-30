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
 * `personUploaded` skips the `person_sheet` generation step. `criticEnabled`
 * (off) drops both Critic inspection steps — and with them the confirm-mode
 * gates, so a critic-off run never pauses.
 */
export function nextStep(
  step: Step,
  personUploaded: boolean,
  criticEnabled: boolean,
): Step | null {
  // What follows the product image: inspection (critic on) or straight to storyboard.
  const afterProduct: Step = criticEnabled ? "product_inspection" : "storyboard";
  switch (step) {
    case "product_sheet":
      return personUploaded ? afterProduct : "person_sheet";
    case "person_sheet":
      return afterProduct;
    case "product_inspection":
      return "storyboard";
    case "storyboard":
      return criticEnabled ? "storyboard_inspection" : "video";
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
