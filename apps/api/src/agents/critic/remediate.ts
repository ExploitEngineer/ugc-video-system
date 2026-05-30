// The inspect → (regen on issue) → re-inspect engine, generic over the regen
// strategy so both inspections reuse it.
//
// Retry cap = 1 (CRITIC_RETRY_CAP): a passing first inspection regenerates
// nothing; a failing one regenerates exactly once, then re-inspects; if it
// still fails, the run is signalled as failed (NO second regen).
//
// This engine NEVER mutates `runs.status` — that is F7's job. It writes
// `step_events`, flips artifact status (draft → approved | rejected), and
// returns a `CriticVerdict` whose `outcome` tells F7 what to do next.

import type { Step } from "@ugc/shared";
import type { SkillContext, SkillResult } from "../types.js";
import { CRITIC_RETRY_CAP } from "./constants.js";
import { writeStepEvent } from "./events.js";
import {
  approveArtifact,
  type InspectableSheetTable,
  rejectArtifact,
} from "./status.js";
import type { CriticIssue, CriticVerdict, InspectionVerdict } from "./types.js";

/** The minimum a sheet needs to be inspected, approved/rejected, and carried on. */
export interface SheetRef {
  artifactId: string;
  assetId: string;
  assetUrl: string;
}

/** Adapt a producer skill's `SkillResult` into the `SheetRef` the engine tracks. */
export function toSheetRef<T extends { id: string }>(
  result: SkillResult<T>,
): SheetRef {
  return {
    artifactId: result.artifact.id,
    assetId: result.assetId,
    assetUrl: result.assetUrl,
  };
}

export interface RemediateConfig {
  step: Step;
  table: InspectableSheetTable;
  /** The sheet the F4 image skill already produced. */
  initial: SheetRef;
  /** Run one vision inspection against the given (possibly regenerated) sheet URL. */
  inspect: (sheetUrl: string) => Promise<InspectionVerdict>;
  /** Full regen: re-invoke the F4 producer skill, steered by critic feedback. */
  regenFull: (critique: string) => Promise<SheetRef>;
  /** Localized regen (product sheet only). Omit ⇒ always full regen. */
  regenLocalized?: (
    issues: CriticIssue[],
    current: SheetRef,
  ) => Promise<SheetRef>;
}

/** Should this verdict be fixed with a localized edit rather than a full redraw? */
function isLocalized(verdict: InspectionVerdict): boolean {
  return (
    verdict.localizedRegen &&
    verdict.issues.length > 0 &&
    verdict.issues.every(
      (i) => i.region && i.region !== "global" && i.severity !== "blocking",
    )
  );
}

/** Serialize failing issues into a feedback block the producer skill can act on. */
function critiqueFrom(verdict: InspectionVerdict): string {
  const lines = verdict.issues.map((i) => {
    const where = i.region ? `[${i.region}] ` : "";
    const fix = i.fixHint ? ` Fix: ${i.fixHint}` : "";
    return `- ${where}(${i.severity}) ${i.problem}${fix}`;
  });
  return [verdict.summary, ...lines].filter(Boolean).join("\n");
}

export async function inspectAndRemediate(
  ctx: SkillContext,
  cfg: RemediateConfig,
): Promise<CriticVerdict> {
  let current = cfg.initial;
  let attempts = 0;

  await writeStepEvent({
    runId: ctx.runId,
    step: cfg.step,
    status: "started",
    payload: { artifactId: current.artifactId },
  });

  for (;;) {
    const verdict = await cfg.inspect(current.assetUrl);
    attempts += 1;
    const regensUsed = attempts - 1;

    if (verdict.pass) {
      await approveArtifact(cfg.table, current.artifactId);
      await writeStepEvent({
        runId: ctx.runId,
        step: cfg.step,
        status: "passed",
        payload: { attempt: regensUsed, verdict },
      });
      return {
        step: cfg.step,
        outcome: regensUsed === 0 ? "approved" : "regenerated_approved",
        attempts,
        finalArtifact: { ...current, status: "approved" },
        lastVerdict: verdict,
      };
    }

    // Failed. The current (rejected) sheet is replaced or the run fails.
    await rejectArtifact(cfg.table, current.artifactId);

    if (regensUsed >= CRITIC_RETRY_CAP) {
      await writeStepEvent({
        runId: ctx.runId,
        step: cfg.step,
        status: "failed",
        payload: { attempt: regensUsed, verdict, reason: "retry_cap" },
      });
      return {
        step: cfg.step,
        outcome: "failed_retry_cap",
        attempts,
        finalArtifact: { ...current, status: "rejected" },
        lastVerdict: verdict,
      };
    }

    const localized = isLocalized(verdict) && Boolean(cfg.regenLocalized);
    const next =
      localized && cfg.regenLocalized
        ? await cfg.regenLocalized(verdict.issues, current)
        : await cfg.regenFull(critiqueFrom(verdict));

    await writeStepEvent({
      runId: ctx.runId,
      step: cfg.step,
      status: "regenerated",
      payload: {
        attempt: regensUsed,
        strategy: localized ? "localized" : "full",
        verdict,
        newArtifactId: next.artifactId,
        newAssetId: next.assetId,
      },
    });

    current = next;
  }
}
