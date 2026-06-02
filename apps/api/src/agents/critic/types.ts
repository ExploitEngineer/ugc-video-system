// Result types for the Critic Agent.
//
// A producer skill (F4 Image Agent) returns `SkillResult<T>` — it always makes
// a new asset. The critic VALIDATES an existing artifact and only sometimes
// produces a new one (on regen), so it has its own result shape. These types
// live with the critic, not in the generic `agents/types.ts`.

import type { Step } from "@ugc/shared";
import { z } from "zod";

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

/**
 * Tolerant validator for the inspection verdict. Field-level `.catch()` keeps a
 * slightly-off LLM reply from corrupting the regen decision: a missing/odd
 * `pass` normalizes to `false` (= "regenerate", the safe direction), and bad
 * issue entries degrade gracefully. A structurally non-object reply still fails
 * `safeParse`, so `parseJsonObject` throws a clear error rather than feeding the
 * engine garbage. `region` is kept loose (string) — the strict union lives on
 * the `CriticIssue` type and the localized-regen mapper tolerates unknowns.
 */
const criticIssueSchema = z.object({
  severity: z.enum(["minor", "major", "blocking"]).catch("major"),
  region: z.string().optional(),
  problem: z.string().catch(""),
  fixHint: z.string().optional(),
});

export const inspectionVerdictSchema = z.object({
  pass: z.boolean().catch(false),
  localizedRegen: z.boolean().catch(false),
  issues: z.array(criticIssueSchema).catch([]),
  summary: z.string().catch(""),
});

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
