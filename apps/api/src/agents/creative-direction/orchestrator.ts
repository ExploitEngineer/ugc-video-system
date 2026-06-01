// Creative Direction Agent — the run state machine.
//
// `driveRun(runId)` advances ONE run from wherever it sits to the next stop
// (`awaiting_confirmation` | `completed` | `failed`), calling the F4/F5/F6
// skills in order. The `runs` row is authoritative: every step persists
// `currentStep`/`status` before the next, so a crash/restart resumes cleanly.
//
// State convention (see plan.ts): `currentStep` = the LAST step that completed.
//   queued        → interpret adStyle, set running, currentStep=null
//   running       → execute nextStep(currentStep); advance / gate / complete
//   regenerating  → re-run the generation step owning the gated currentStep
//   awaiting_confirmation / completed / failed → terminal for the driver
//
// This convention keeps the existing confirm/reject routes correct unchanged:
// confirm flips awaiting_confirmation→running (driver advances via nextStep),
// reject flips →regenerating (driver re-runs the stage of currentStep).

import type { Step } from "@ugc/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import {
  createOpenAIProvider,
  type ImageRef,
  type OpenAIProvider,
} from "../../providers/openai/index.js";
import { createVideoProvider } from "../../providers/index.js";
import type { VideoProvider } from "../../providers/video.js";
import { writeStepEvent } from "../events.js";
import { logRun, logRunError } from "../../lib/log.js";
import { criticAgent } from "../critic/index.js";
import type { CriticOutcome } from "../critic/types.js";
import { imageAgent } from "../image/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { videoAgent } from "../video/index.js";
import type { SkillContext } from "../types.js";
import { interpretAdStyle } from "./interpret-style/index.js";
import {
  latestProductSheet,
  latestStoryboardSheet,
  loadUploads,
  resolvePersonRef,
} from "./inputs.js";
import { firstStep, genStepForGate, isGateStep, nextStep } from "./plan.js";

type RunRow = typeof schema.runs.$inferSelect;

const FALLBACK_AD_STYLE = "clean, neutral commercial";

// Shared provider singletons — the adapters are stateless and config-driven.
let openai: OpenAIProvider | null = null;
let video: VideoProvider | null = null;
const providers = () => {
  openai ??= createOpenAIProvider();
  video ??= createVideoProvider();
  return { openai, video };
};

const readRun = (runId: string): Promise<RunRow | undefined> =>
  db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });

async function setRun(runId: string, fields: Partial<RunRow>): Promise<void> {
  await db
    .update(schema.runs)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(schema.runs.id, runId));
}

/** True if a concurrent cancel flipped the run to a terminal status. */
async function isTerminated(runId: string): Promise<boolean> {
  const run = await readRun(runId);
  return !run || run.status === "failed" || run.status === "completed";
}

function buildCtx(run: RunRow): SkillContext {
  const { openai, video } = providers();
  return {
    runId: run.id,
    adStyle: run.adStyle ?? FALLBACK_AD_STYLE,
    openai,
    video,
  };
}

/**
 * Run a single pipeline step against the latest persisted artifacts.
 * Generation steps write their own started/passed events here; the critic and
 * video skills write their own. Returns the Critic outcome for gate steps.
 */
async function executeStep(
  ctx: SkillContext,
  step: Step,
): Promise<{ outcome?: CriticOutcome }> {
  const runId = ctx.runId;
  const { productUpload, personUpload } = await loadUploads(runId);
  const userPrompt = (await readRun(runId))?.prompt ?? "";

  switch (step) {
    case "product_sheet": {
      if (!productUpload) throw new Error("run has no product_upload asset");
      await writeStepEvent({ runId, step, status: "started" });
      const res = await imageAgent.productSheetBuilder(ctx, {
        productUpload,
        userPrompt,
      });
      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { assetId: res.assetId },
      });
      return {};
    }

    case "person_sheet": {
      const product = await latestProductSheet(runId);
      if (!product) throw new Error("no product sheet before person_sheet");
      await writeStepEvent({ runId, step, status: "started" });
      const res = await imageAgent.generatePersonImage(ctx, {
        productSheetRef: { source: product.assetUrl, mime: "image/png" },
        userPrompt,
      });
      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { assetId: res.assetId },
      });
      return {};
    }

    case "product_inspection": {
      const product = await latestProductSheet(runId);
      if (!product) throw new Error("no product sheet to inspect");
      if (!productUpload) throw new Error("run has no product_upload asset");
      const verdict = await criticAgent.inspectAndRemediateProductSheet(ctx, {
        initial: {
          artifactId: product.artifactId,
          assetId: product.assetId,
          assetUrl: product.assetUrl,
        },
        views: product.views,
        userPrompt,
        productUpload,
      });
      return { outcome: verdict.outcome };
    }

    case "storyboard": {
      const product = await latestProductSheet(runId);
      if (!product) throw new Error("no product sheet before storyboard");
      const personSheetRef = await resolvePersonRef(runId, personUpload);
      await writeStepEvent({ runId, step, status: "started" });
      const res = await imageAgent.storyboardGenerator(ctx, {
        productSheetRef: { source: product.assetUrl, mime: "image/png" },
        personSheetRef,
        userPrompt,
      });
      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { assetId: res.assetId },
      });
      return {};
    }

    case "storyboard_inspection": {
      const storyboard = await latestStoryboardSheet(runId);
      if (!storyboard) throw new Error("no storyboard sheet to inspect");
      const product = await latestProductSheet(runId);
      if (!product) throw new Error("no product sheet for storyboard regen");
      const personSheetRef = await resolvePersonRef(runId, personUpload);
      const verdict = await criticAgent.inspectAndRemediateStoryboard(ctx, {
        initial: {
          artifactId: storyboard.artifactId,
          assetId: storyboard.assetId,
          assetUrl: storyboard.assetUrl,
        },
        scenes: storyboard.scenes,
        userPrompt,
        productSheetRef: { source: product.assetUrl, mime: "image/png" },
        personSheetRef,
      });
      return { outcome: verdict.outcome };
    }

    case "video": {
      const storyboard = await latestStoryboardSheet(runId);
      if (!storyboard) throw new Error("no storyboard sheet for video");
      // Person/product reference sheets → Kling input_references (style guidance).
      const product = await latestProductSheet(runId);
      const personSheetRef = await resolvePersonRef(runId, personUpload);
      const referenceImages = [
        product ? ({ source: product.assetUrl } as ImageRef) : null,
        personSheetRef,
      ].filter((r): r is ImageRef => r != null);
      // videoBuilder writes its own video step_events.
      await videoAgent.videoBuilder(ctx, {
        storyboardSheetRef: { source: storyboard.assetUrl } as ImageRef,
        referenceImages,
        scenes: (storyboard.scenes ?? []) as StoryboardScene[],
        userPrompt,
      });
      return {};
    }
  }
}

/**
 * Drive a run to its next stopping point. Safe to call repeatedly and
 * concurrently is guarded by the worker (single-flight per runId).
 */
export async function driveRun(runId: string): Promise<void> {
  let run = await readRun(runId);
  if (!run) return;

  // Phase 0 — interpret the ad style once, when leaving `queued`.
  if (run.status === "queued") {
    const ctx = buildCtx(run);
    logRun(runId, "▶ interpreting ad style …");
    try {
      const { adStyle } = await interpretAdStyle(ctx, { userPrompt: run.prompt });
      await setRun(runId, { adStyle, status: "running", currentStep: null });
      logRun(runId, `ad style: "${adStyle}"`);
    } catch (err) {
      await failRun(runId, null, err);
      return;
    }
  }

  // Uploads are immutable for the life of the run — compute the branch once.
  const { personUpload } = await loadUploads(runId);
  const personUploaded = Boolean(personUpload);

  for (;;) {
    run = await readRun(runId);
    if (!run) return;
    const { status } = run;
    if (
      status === "completed" ||
      status === "failed" ||
      status === "awaiting_confirmation"
    ) {
      return;
    }

    const ctx = buildCtx(run);

    // ── regenerating: re-run the generation step of the rejected stage ──
    if (status === "regenerating") {
      const gate = run.currentStep;
      if (!gate) {
        await failRun(runId, null, new Error("regenerating without a current step"));
        return;
      }
      const genStep = genStepForGate(gate);
      const t0 = Date.now();
      logRun(runId, `▶ ${genStep} (regenerate) …`);
      try {
        await executeStep(ctx, genStep);
      } catch (err) {
        await failRun(runId, genStep, err);
        return;
      }
      logRun(runId, `✓ ${genStep} regenerated (${Date.now() - t0}ms)`);
      if (await isTerminated(runId)) return; // cancelled mid-step
      await setRun(runId, { status: "running", currentStep: genStep });
      continue;
    }

    // ── running: execute the next step ──
    const step = run.currentStep
      ? nextStep(run.currentStep, personUploaded, run.criticEnabled)
      : firstStep();
    if (!step) {
      await setRun(runId, { status: "completed" });
      return;
    }

    let outcome: CriticOutcome | undefined;
    const t0 = Date.now();
    logRun(runId, `▶ ${step} …`);
    try {
      ({ outcome } = await executeStep(ctx, step));
    } catch (err) {
      await failRun(runId, step, err);
      return;
    }
    logRun(
      runId,
      `✓ ${step} (${Date.now() - t0}ms)${outcome ? ` — critic: ${outcome}` : ""}`,
    );
    if (await isTerminated(runId)) return; // cancelled mid-step

    if (outcome === "failed_retry_cap") {
      logRunError(runId, `${step} rejected by critic after the retry cap`);
      await setRun(runId, {
        status: "failed",
        currentStep: step,
        error: `Critic rejected the ${step} stage after the retry cap.`,
      });
      return;
    }

    // Success — advance the checkpoint, then decide the next state.
    if (step === "video") {
      logRun(runId, "✓ run completed — final video ready");
      await setRun(runId, { status: "completed", currentStep: step });
      return;
    }
    if (isGateStep(step) && run.mode === "confirm") {
      await setRun(runId, { status: "awaiting_confirmation", currentStep: step });
      return;
    }
    await setRun(runId, { currentStep: step }); // stay running, loop on
  }
}

/** Mark a run failed and record a `failed` step_event (best effort). */
async function failRun(
  runId: string,
  step: Step | null,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  logRunError(runId, `${step ?? "run"} failed: ${message}`);
  if (step) {
    await writeStepEvent({
      runId,
      step,
      status: "failed",
      payload: { error: message },
    }).catch(() => {});
  }
  await setRun(runId, {
    status: "failed",
    ...(step ? { currentStep: step } : {}),
    error: message,
  }).catch(() => {});
}
