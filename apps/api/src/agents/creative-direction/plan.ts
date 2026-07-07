// Deterministic pipeline sequencing for the Creative Direction Agent.
//
// The agent order is fixed; the only branch is whether `person_sheet` runs
// (skipped when a person image was uploaded). The Critic stages run in BOTH
// modes; confirm-mode gating pauses after each VALIDATED stage — i.e. after
// `product_inspection` and after `storyboard_inspection` (SPEC §4 mermaid).

import { type Duration, isMultiSegment, type Step } from "@ugc/shared";

/**
 * Ground-truth asset signals for a run (Chunk G): the registry asset policy for
 * the resolved ad type + whether each asset was actually uploaded. Drives which
 * reference steps run. The reference phase is parallel in the orchestrator, so
 * these predicates also describe what `runReferencePhase` will generate.
 */
export interface AssetCtx {
  productRequired: boolean;
  personRequired: boolean;
  hasProductUpload: boolean;
  hasPersonUpload: boolean;
  /**
   * Chunk 4 — the run's Character On/Off toggle. THIS, not `personRequired`,
   * decides whether a main on-screen character is generated: On → one person
   * sheet (uploaded if provided, else synthesized); Off → none. Defaulted from
   * the ad-type's `characterDefault` at run creation.
   */
  characterEnabled: boolean;
}

/**
 * Will a product reference sheet be generated? A product can ONLY come from an
 * upload (it is never synthesized), so this is exactly "a product was uploaded".
 */
export function willGenerateProduct(a: AssetCtx): boolean {
  return a.hasProductUpload;
}

/**
 * Will a person reference sheet be generated? Driven by the Character toggle
 * (Chunk 4), NOT the ad type: yes when a person was uploaded, OR when the
 * character toggle is On (then the main character is synthesized — from the
 * product if one was uploaded, else from the prompt). Toggle Off + no upload →
 * skipped, so the ad is product/scene-only.
 */
export function willGeneratePerson(a: AssetCtx): boolean {
  return a.hasPersonUpload || a.characterEnabled;
}

/** Whether the reference gate has ANY artifact to show (else it collapses). */
export function hasAnyReference(a: AssetCtx): boolean {
  return willGenerateProduct(a) || willGeneratePerson(a);
}

/**
 * The first step of a run. With no asset context (legacy callers) it is always
 * `product_sheet`. Asset-aware: skip straight to `person_sheet` when no product
 * is generated, or to `storyboard` when neither reference sheet is generated.
 */
export function firstStep(asset?: AssetCtx): Step {
  if (!asset || willGenerateProduct(asset)) return "product_sheet";
  if (willGeneratePerson(asset)) return "person_sheet";
  return "storyboard";
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
  const multi = isMultiSegment(duration);
  // What follows the reference phase: inspection (critic on), else the
  // multi-segment N×4-panel master storyboard (30/45/60s) or the 15s single
  // storyboard. (The `narrative_outline` step is retired — the master is
  // authored as ONE coherent scene from the prompt, so there are no per-segment
  // summaries to plan.)
  const afterReference: Step = criticEnabled
    ? "product_inspection"
    : multi
      ? "segment_storyboard"
      : "storyboard";
  const afterProductInspection: Step = multi
    ? "segment_storyboard"
    : "storyboard";
  switch (step) {
    // Service path: the creative brief feeds straight into the storyboard
    // (no product/person reference sheets).
    case "creative_brief":
      return multi ? "segment_storyboard" : "storyboard";
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
    // Multi-segment pipeline: master storyboard (+ row crops) → N videos → merge.
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
 *     15s `storyboard`, multi `segment_storyboard` (the first post-reference step).
 *   - storyboard gate → right before the video work (storyboard ready):
 *     15s `video`, multi `segment_video` (after the master + its row crops).
 */
export function gateForNext(
  next: Step | null,
  hasReference = true,
): Gate | null {
  // Reference gate collapses when no reference sheet exists (both skipped — e.g.
  // a neither-asset type with no uploads); there is nothing to confirm.
  if (next === "storyboard" || next === "segment_storyboard")
    return hasReference ? "reference" : null;
  if (next === "video" || next === "segment_video") return "storyboard";
  return null;
}

/**
 * Recover the gate of a paused run from its `currentStep` (= last completed
 * step). Mirrors `gateForNext` for every step that can sit at a gate. For
 * multi-segment the storyboard gate is sat at `segment_storyboard` (all N sheets done).
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
 * The `currentStep` to set when regenerating ONLY the video clip(s) of a
 * finished/parked run (the regenerate-on-failure path), so the driver's next
 * `nextStep(currentStep)` lands directly on the video work WITHOUT re-running
 * the storyboard, the Critic, or pausing at a confirm gate:
 *   - 15s   → `storyboard_inspection` (its `nextStep` is unconditionally `video`,
 *             independent of `criticEnabled`; the storyboard gate is already
 *             passed so no gate re-fires and the video-completion path returns
 *             before any gate check).
 *   - multi → `segment_storyboard` (`nextStep` → `segment_video` → `merge`; the
 *             re-entrant fan-out regenerates only the deleted segment(s), then
 *             re-merges).
 * The caller must first DELETE the target clip's `videos` row(s) so the video
 * step's idempotency guards (`persistedFinalVideo` / the segment `done` set) no
 * longer short-circuit it.
 */
export function resumeStepForVideoRegen(duration: Duration = "15s"): Step {
  return isMultiSegment(duration) ? "segment_storyboard" : "storyboard_inspection";
}

/**
 * The generation step to re-run when the user revises a gated artifact
 * (status `regenerating`). The reference gate always re-runs `person_sheet`
 * (the product sheet is hidden from the user, so `target` "product" is ignored).
 * The storyboard gate re-runs the single `storyboard` (15s) or the segment
 * storyboards (multi — narrowed to the targeted segment in the orchestrator).
 */
export function genStepForRevise(
  gate: Gate,
  _target: "product" | "person" | null,
  duration: Duration = "15s",
  asset?: AssetCtx,
): Step {
  if (gate === "storyboard")
    return isMultiSegment(duration) ? "segment_storyboard" : "storyboard";
  // Reference gate: re-run the person sheet (the product sheet is normally
  // hidden). But on a person-SKIPPED run the only reference artifact is the
  // product sheet, so a revise must target it instead.
  if (asset && !willGeneratePerson(asset) && willGenerateProduct(asset))
    return "product_sheet";
  return "person_sheet";
}
