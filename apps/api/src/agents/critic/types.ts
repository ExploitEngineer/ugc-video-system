// Result types for the Critic Agent.
//
// A producer skill (F4 Image Agent) returns `SkillResult<T>` — it always makes
// a new asset. The critic VALIDATES an existing artifact and only sometimes
// produces a new one (on regen), so it has its own result shape. These types
// live with the critic, not in the generic `agents/types.ts`.

import type { Step } from "@ugc/shared";

/** A single defect the vision model found in a sheet. */
export interface CriticIssue {
  severity: "minor" | "major" | "blocking";
  /** Product sheet: which view cell. Storyboard: `scene_N`. `global`: whole sheet. */
  region?:
    | "front"
    | "threeQuarter"
    | "side"
    | "rear"
    | `scene_${number}`
    | "global";
  problem: string;
  /** What a regeneration should change to fix this issue. */
  fixHint?: string;
}

/** Strict-JSON shape the inspection LLM must return (parsed by `parseJsonObject`). */
export interface InspectionVerdict {
  pass: boolean;
  /** True only when every issue is confined to named region(s); rest is good. */
  localizedRegen: boolean;
  issues: CriticIssue[];
  /** One-line rationale, stored in the `step_events` payload. */
  summary: string;
}

/** Outcome of one inspect-and-remediate cycle, returned to F7 (orchestrator). */
export type CriticOutcome =
  | "approved" // passed first inspection, no regen
  | "regenerated_approved" // failed, regenerated once, then passed
  | "failed_retry_cap"; // still failing after the allowed regen → F7 fails the run

/** The artifact the run should carry forward after the critic ran. */
export interface CriticFinalArtifact {
  artifactId: string;
  assetId: string;
  assetUrl: string;
  status: "approved" | "rejected";
}

export interface CriticVerdict {
  step: Step; // product_inspection | storyboard_inspection
  outcome: CriticOutcome;
  /** Inspections performed (1 when it passes first try, 2 after one regen). */
  attempts: number;
  finalArtifact: CriticFinalArtifact;
  /** Verdict of the LAST inspection — diagnostics for F7 / the UI. */
  lastVerdict: InspectionVerdict;
}
