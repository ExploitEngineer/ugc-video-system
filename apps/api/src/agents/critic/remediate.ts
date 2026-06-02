// The inspect → (regen on issue) → re-inspect engine, generic over the regen
// strategy so both inspections reuse it.
//
// Regen budget is run-level (MAX_REGEN_PER_RUN), shared across inspection
// steps: a passing inspection regenerates nothing; a failing one regenerates
// only while the run still has budget left (counting regens already spent on
// earlier steps), then re-inspects; once the run budget is exhausted a further
// failure signals the run as failed (NO more regens).
//
// This engine NEVER mutates `runs.status` — that is F7's job. It writes
// `step_events`, flips artifact status (draft → approved | rejected), and
// returns a `CriticVerdict` whose `outcome` tells F7 what to do next.

import type { Step } from "@ugc/shared";
import { createLogger } from "../../lib/log.js";
import type { SkillContext, SkillResult } from "../types.js";
import { MAX_REGEN_PER_RUN } from "./constants.js";
import { countRegenEvents, writeStepEvent } from "./events.js";
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
  const log = createLogger("critic", { run: ctx.runId, step: cfg.step });
  let current = cfg.initial;
  let attempts = 0;
  // Regens already spent on earlier inspection steps of this run.
  const priorRegens = await countRegenEvents(ctx.runId);

  await writeStepEvent({
    runId: ctx.runId,
    step: cfg.step,
    status: "started",
    payload: { artifactId: current.artifactId },
  });
  log.info("▶ inspecting", { artifactId: current.artifactId, priorRegens });

  for (;;) {
    const verdict = await cfg.inspect(current.assetUrl);
    attempts += 1;
    const regensUsed = attempts - 1;
    log.debug("verdict", {
      pass: verdict.pass,
      issues: verdict.issues.length,
      attempt: regensUsed,
    });

    if (verdict.pass) {
      await approveArtifact(cfg.table, current.artifactId);
      log.info("✓ passed", { regensUsed });
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

    if (priorRegens + regensUsed >= MAX_REGEN_PER_RUN) {
      log.warn("✗ rejected — retry cap reached", {
        regensUsed,
        cap: MAX_REGEN_PER_RUN,
      });
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
    log.info("⟳ regenerating", {
      strategy: localized ? "localized" : "full",
      attempt: regensUsed,
      issues: verdict.issues.length,
    });
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
