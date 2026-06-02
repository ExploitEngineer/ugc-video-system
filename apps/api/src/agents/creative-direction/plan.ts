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

/**
 * Step-by-step pause points. Decoupled from the Critic: instead of keying off
 * inspection steps (which vanish when the Critic is off), we gate on WHAT THE
 * NEXT STEP WOULD BE. `nextStep` already collapses inspection steps, so this
 * fires whether or not they run:
 *   - reference gate  → right before `storyboard` (both reference sheets ready)
 *   - storyboard gate → right before `video`
 */
export type Gate = "reference" | "storyboard";

/** The gate we land at by completing the step whose next step is `next`. */
export function gateForNext(next: Step | null): Gate | null {
  if (next === "storyboard") return "reference";
  if (next === "video") return "storyboard";
  return null;
}

/**
 * Recover the gate of a paused run from its `currentStep` (= last completed
 * step). Mirrors `gateForNext` for every step that can sit at a gate.
 */
export function gateForCurrentStep(step: Step): Gate | null {
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

/**
 * The generation step to re-run when the user revises a gated artifact
 * (status `regenerating`). The reference gate always re-runs `person_sheet`
 * (the product sheet is hidden from the user, so `target` "product" is ignored).
 */
export function genStepForRevise(gate: Gate, _target: "product" | "person" | null): Step {
  return gate === "storyboard" ? "storyboard" : "person_sheet";
}
