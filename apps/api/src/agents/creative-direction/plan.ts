// Deterministic pipeline sequencing for the Creative Direction Agent.
//
// The agent order is fixed; the only branch is whether `person_sheet` runs
// (skipped when a person image was uploaded). The Critic stages run in BOTH
// modes; confirm-mode gating pauses after each VALIDATED stage — i.e. after
// `product_inspection` and after `storyboard_inspection` (SPEC §4 mermaid).

import {
  type Duration,
  isMultiSegment,
  type Pipeline,
  type Step,
} from "@ugc/shared";

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
 *
 * A `pipeline: "template"` run always opens with `template_plan` — one cheap
 * LLM call that reads the template's slots and the ad brief, before any image
 * or video spend. Everything downstream reads its output.
 */
export function firstStep(asset?: AssetCtx, pipeline: Pipeline = "video"): Step {
  if (pipeline === "template") return "template_plan";
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
  pipeline: Pipeline = "video",
  retemplating = false,
): Step | null {
  const multi = isMultiSegment(duration);
  // `retemplating` only ever means anything on a template run. Bind it to the
  // pipeline here so no other chain can be steered by a stale flag.
  const reTemplate = pipeline === "template" && retemplating;
  // What follows the reference phase: inspection (critic on), else the
  // multi-segment N×4-panel master storyboard (30/45/60s) or the 15s single
  // storyboard. (The `narrative_outline` step is retired — the master is
  // authored as ONE coherent scene from the prompt, so there are no per-segment
  // summaries to plan.)
  // A template run has its OWN authoring chain after the reference phase — the
  // clean look-still + per-slot script — never the shared 2×2 storyboard.
  const afterReference: Step =
    pipeline === "template"
      ? "template_keyframe"
      : criticEnabled
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
    // The shared storyboard belongs to the video pipeline only; a template run
    // never reaches it (it uses `template_keyframe` instead).
    case "storyboard":
      return criticEnabled ? "storyboard_inspection" : "video";
    case "storyboard_inspection":
      return "video";
    // `template_plan` runs FIRST (see `firstStep`), before any image or video
    // spend, because it analyzes the template and shapes every downstream agent.
    // The reference phase follows it: `driveRun` treats a forward `person_sheet`
    // as the parallel product ∥ person phase, then `template_keyframe`.
    //
    // RE-TEMPLATING short-circuits straight to the copywriter. The user swapped
    // the template on a finished ad, so the reference sheets and the keyframe
    // already exist and are template-independent. Re-running the keyframe would
    // rewrite the script the kept master clip never spoke.
    case "template_plan":
      return reTemplate ? "template_fill" : "person_sheet";
    // The clean look-still + per-slot script, then the copywriter (which reads
    // that script), then the image slots.
    case "template_keyframe":
      return "template_fill";
    case "template_fill":
      return "template_images";
    // Images before the clip: Seedance is the most expensive call, so everything
    // that can fail cheaply fails before it. Re-templating skips the clip
    // OUTRIGHT — the master already exists and is template-independent.
    case "template_images":
      return reTemplate ? "template_render" : "template_video";
    // Once the clip exists, composite it (plus the AI copy + images) into the
    // template picked at run creation — never gated (the template was validated
    // before the run existed).
    case "template_video":
      return "template_render";
    case "template_render":
      return null;
    // A normal `video`-pipeline run is complete after the clip.
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
    // The template pipeline is 15s-only in v1 — a multi-segment run is always
    // complete at `merge` regardless of `pipeline`.
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
export function resumeStepForVideoRegen(
  duration: Duration = "15s",
  pipeline: Pipeline = "video",
): Step {
  // A template run's chain puts the copywriter and the image agent BEFORE the
  // clip. Rewinding to the keyframe would re-run both — re-paying gpt-image-2
  // for every slot — when all the user asked for is a new clip. `template_images`
  // is the checkpoint whose next step is `template_video`.
  if (pipeline === "template") return "template_images";
  return isMultiSegment(duration) ? "segment_storyboard" : "storyboard_inspection";
}

/**
 * Where a failed template run rewinds to, by the step that failed. Returns the
 * checkpoint to write into `runs.current_step` (`null` = start over), or
 * `undefined` when the failure is not a template-step failure.
 *
 * Getting this wrong is silent and expensive in both directions: rewind too far
 * and the run re-pays for images it already has; rewind too little and the
 * template renders with no copy and no stills in it.
 */
export function rewindStepForTemplateRegen(
  errorCode: string | null,
): Step | null | undefined {
  switch (errorCode) {
    // Nothing downstream ran, so restarting is cheap. `currentStep = null` sends
    // the driver back through `template_plan`.
    case "TEMPLATE_PLAN_FAILED":
      return null;
    // The reference sheets exist; re-run only the keyframe.
    // `nextStep("person_sheet")` for a template run is `template_keyframe`.
    case "TEMPLATE_KEYFRAME_FAILED":
      return "person_sheet";
    // The copy failed, so the images and the clip had not run yet.
    // `nextStep("template_keyframe")` is `template_fill`.
    case "TEMPLATE_FILL_FAILED":
      return "template_keyframe";
    // Images exist; re-run only the clip.
    // `nextStep("template_images")` is `template_video`.
    case "TEMPLATE_VIDEO_FAILED":
      return "template_images";
    // Everything generated fine; only the composite failed.
    // `nextStep("template_video")` is `template_render` — the clip is kept.
    case "TEMPLATE_RENDER_FAILED":
      return "template_video";
    default:
      return undefined;
  }
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
