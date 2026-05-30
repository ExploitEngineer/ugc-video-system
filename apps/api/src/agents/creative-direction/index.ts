// Creative Direction Agent (orchestrator) — F7.
//
// Holds the workflow logic: interprets the ad style, sequences the image →
// storyboard → video pipeline, runs the Critic auto-checks in both modes,
// applies confirm-mode gating, and drives the run state machine. The worker is
// the in-process loop that feeds runs to the orchestrator.

import { interpretAdStyle } from "./interpret-style/index.js";

export const creativeDirectionAgent = {
  interpretAdStyle,
};

export type CreativeDirectionAgent = typeof creativeDirectionAgent;

export { interpretAdStyle } from "./interpret-style/index.js";
export { driveRun } from "./orchestrator.js";
export { startWorker } from "./worker.js";
export { firstStep, nextStep, isGateStep, genStepForGate } from "./plan.js";
