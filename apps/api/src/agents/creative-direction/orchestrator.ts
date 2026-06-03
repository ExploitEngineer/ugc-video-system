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
import { planPersonBrief } from "./person-brief/index.js";
import {
  latestProductSheet,
  latestStoryboardSheet,
  loadUploads,
  resolvePersonRef,
} from "./inputs.js";
import {
  gateForCurrentStep,
  gateForNext,
  genStepForRevise,
  nextStep,
} from "./plan.js";

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

/** Shared OpenAI singleton for callers outside the worker (e.g. the /feedback route). */
export const getOpenAI = (): OpenAIProvider => (openai ??= createOpenAIProvider());

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

/**
 * Fencing check: does THIS worker still own the run's lock? If another worker
 * reclaimed it (stale takeover, restart overlap), the losing driver must abort
 * BEFORE writing so it can never overwrite the winner's state (e.g. a pause).
 * `myId` undefined (direct/test calls, no worker) ⇒ treated as owned.
 */
async function ownsRun(runId: string, myId?: string): Promise<boolean> {
  if (!myId) return true;
  const run = await readRun(runId);
  return run?.lockedBy === myId;
}

function buildCtx(run: RunRow): SkillContext {
  const { openai, video } = providers();
  return {
    runId: run.id,
    adStyle: run.adStyle ?? FALLBACK_AD_STYLE,
    adType: run.adType ?? "ugc",
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
  feedback?: string,
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
      // No product-sheet dependency: the person sheet is driven by the upstream
      // product-derived TEXT brief (runs.personBrief), so it can generate in
      // parallel with the product sheet.
      const personBrief = (await readRun(runId))?.personBrief ?? "";
      await writeStepEvent({ runId, step, status: "started" });
      const res = await imageAgent.generatePersonImage(ctx, {
        personBrief,
        userPrompt,
        feedback,
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
        critique: feedback,
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
      // The video model receives the clean storyboard image (shot order/layout)
      // + the scene descriptions and transcripts (text). When the ad has a
      // person, also pass the person's IDENTITY image — the uploaded face, or
      // the generated person sheet — as the primary face reference so the
      // rendered person matches it exactly; videoBuilder routes both through the
      // face-asset path so Seedance's face filter accepts them.
      const personRef = await resolvePersonRef(runId, personUpload);
      // videoBuilder writes its own video step_events.
      await videoAgent.videoBuilder(ctx, {
        storyboardSheetRef: { source: storyboard.assetUrl } as ImageRef,
        hasPerson: Boolean(personRef),
        personFaceRef: personRef,
        scenes: (storyboard.scenes ?? []) as StoryboardScene[],
        userPrompt,
      });
      return {};
    }
  }
}

/**
 * Reference phase — generate the product sheet and (when no person was
 * uploaded) the person sheet CONCURRENTLY. The person sheet reads the upstream
 * `runs.personBrief` text rather than the product sheet image, so the two have
 * no ordering dependency. Each step writes its own started/passed events.
 * Returns the first failing step (if any) so the caller can fail the run.
 */
async function runReferencePhase(
  ctx: SkillContext,
  personUploaded: boolean,
): Promise<{ failedStep?: Step; err?: unknown }> {
  const steps: Step[] = personUploaded
    ? ["product_sheet"]
    : ["product_sheet", "person_sheet"];
  const results = await Promise.allSettled(
    steps.map((s) => executeStep(ctx, s)),
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") return { failedStep: steps[i], err: r.reason };
  }
  return {};
}

/**
 * Drive a run to its next stopping point. Safe to call repeatedly and
 * concurrently is guarded by the worker (single-flight per runId).
 */
export async function driveRun(runId: string, workerId?: string): Promise<void> {
  const tag = workerId ? `wid=${workerId}` : undefined;
  let run = await readRun(runId);
  if (!run) return;

  logRun(
    runId,
    `↪ driveRun entry status=${run.status} currentStep=${run.currentStep ?? "—"} mode=${run.mode} critic=${run.criticEnabled}`,
    tag,
  );

  // Phase 0 — interpret the ad style once, when leaving `queued`. Also plan the
  // product-derived person brief here (vision over the UPLOADED product image)
  // so the product and person sheets can generate in parallel afterwards — the
  // person sheet reads only this TEXT brief, never the product sheet image.
  if (run.status === "queued") {
    const ctx = buildCtx(run);
    logRun(runId, "▶ interpreting ad style …", tag);
    try {
      const { adStyle, adType } = await interpretAdStyle(ctx, {
        userPrompt: run.prompt,
      });
      // adStyle is needed by the person-brief prompt, so refresh ctx with it.
      const briefCtx: SkillContext = { ...ctx, adStyle, adType };
      const { productUpload } = await loadUploads(runId);
      let personBrief: string | null = null;
      if (productUpload) {
        personBrief = (
          await planPersonBrief(briefCtx, { userPrompt: run.prompt, productUpload })
        ).personBrief;
        logRun(runId, `person brief: "${personBrief}"`, tag);
      }
      await setRun(runId, {
        adStyle,
        adType,
        personBrief,
        status: "running",
        currentStep: null,
      });
      logRun(runId, `ad style: "${adStyle}" · ad type: ${adType}`, tag);
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
    // Fencing: bail if another worker took over this run (e.g. restart overlap).
    if (!(await ownsRun(runId, workerId))) {
      logRun(runId, "⚠ lost ownership — aborting driver", tag);
      return;
    }

    const ctx = buildCtx(run);

    // ── regenerating: re-run the generation step of the revised gate, with
    // the user's feedback threaded into the agent prompt ──
    if (status === "regenerating") {
      const gateStep = run.currentStep;
      const gate = gateStep ? gateForCurrentStep(gateStep) : null;
      if (!gate) {
        await failRun(runId, null, new Error("regenerating without a gate step"));
        return;
      }
      // Reference gate always re-runs person_sheet (product is hidden); the
      // storyboard gate re-runs storyboard. Thread the stored feedback in.
      const genStep = genStepForRevise(gate, "person");
      const feedback = run.feedback ?? undefined;
      const t0 = Date.now();
      logRun(
        runId,
        `⟳ revise gate=${gate} genStep=${genStep} feedback=${feedback ? "yes" : "none"}`,
        tag,
      );
      logRun(runId, `▶ ${genStep} (revise) …`, tag);
      try {
        await executeStep(ctx, genStep, feedback);
      } catch (err) {
        await failRun(runId, genStep, err);
        return;
      }
      logRun(runId, `✓ ${genStep} revised (${Date.now() - t0}ms)`, tag);
      if (await isTerminated(runId)) return; // cancelled mid-step
      if (!(await ownsRun(runId, workerId))) {
        logRun(runId, "⚠ lost ownership — aborting driver", tag);
        return;
      }
      // Re-pause at the SAME gate so the user reviews the regenerated artifact
      // and can approve or revise again (loop until approve). Clear feedback to
      // avoid bleed. `gate` is the regenerated step's gate — genStepForRevise
      // keeps us on the same gate (person_sheet→reference, storyboard→storyboard).
      if (run.mode === "confirm" && gate) {
        await setRun(runId, {
          status: "awaiting_confirmation",
          currentStep: genStep,
          feedback: null,
        });
        logRun(runId, `⏸ PAUSED — review revised ${genStep} (${gate} gate)`, tag);
        return;
      }
      // No gate (automatic mode safety net): advance via the loop.
      await setRun(runId, {
        status: "running",
        currentStep: genStep,
        feedback: null,
      });
      continue;
    }

    // ── running: execute the next step (or the parallel reference phase) ──
    let step: Step | null;
    let outcome: CriticOutcome | undefined;
    const t0 = Date.now();

    if (run.currentStep === null) {
      // First generation: product + person sheets run CONCURRENTLY. `step` is
      // the checkpoint the phase advances to — the person sheet when one is
      // generated, else the product sheet — which the gate/advance block below
      // treats exactly like a single completed reference step.
      step = personUploaded ? "product_sheet" : "person_sheet";
      logRun(
        runId,
        personUploaded
          ? "▶ product_sheet …"
          : "▶ product_sheet + person_sheet (parallel) …",
        tag,
      );
      const { failedStep, err } = await runReferencePhase(ctx, personUploaded);
      if (failedStep) {
        await failRun(runId, failedStep, err);
        return;
      }
    } else {
      step = nextStep(run.currentStep, personUploaded, run.criticEnabled);
      if (!step) {
        await setRun(runId, { status: "completed" });
        return;
      }
      logRun(runId, `▶ ${step} …`, tag);
      try {
        ({ outcome } = await executeStep(ctx, step));
      } catch (err) {
        await failRun(runId, step, err);
        return;
      }
    }
    logRun(
      runId,
      `✓ ${step} (${Date.now() - t0}ms)${outcome ? ` — critic: ${outcome}` : ""}`,
      tag,
    );
    if (await isTerminated(runId)) return; // cancelled mid-step
    // Fencing: a step can take minutes; if another worker reclaimed the run
    // meanwhile, abort BEFORE writing so we never overwrite its pause/state.
    if (!(await ownsRun(runId, workerId))) {
      logRun(runId, "⚠ lost ownership — aborting driver", tag);
      return;
    }

    if (outcome === "failed_retry_cap") {
      logRunError(runId, `${step} rejected by critic after the retry cap`, tag);
      await setRun(runId, {
        status: "failed",
        currentStep: step,
        error: `Critic rejected the ${step} stage after the retry cap.`,
      });
      return;
    }

    // Success — advance the checkpoint, then decide the next state.
    if (step === "video") {
      logRun(runId, "✓ run completed — final video ready", tag);
      await setRun(runId, { status: "completed", currentStep: step });
      return;
    }
    // Step-by-step gate: pause if completing this step lands us at a gate
    // boundary (next step is storyboard or video). Independent of the Critic
    // — gateForNext works whether or not inspection steps run.
    const next = nextStep(step, personUploaded, run.criticEnabled);
    const gate = gateForNext(next);
    if (run.mode === "confirm" && gate) {
      logRun(
        runId,
        `✓ ${step} → next=${next ?? "—"} gate=${gate} mode=${run.mode} ⇒ PAUSE`,
        tag,
      );
      await setRun(runId, { status: "awaiting_confirmation", currentStep: step });
      logRun(runId, `⏸ PAUSED — awaiting feedback (${gate} gate)`, tag);
      return;
    }
    logRun(
      runId,
      `✓ ${step} → next=${next ?? "—"} gate=${gate ?? "none"} mode=${run.mode} ⇒ ADVANCE`,
      tag,
    );
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
    }).catch((e) =>
      logRunError(
        runId,
        `could not record failed step_event: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }
  await setRun(runId, {
    status: "failed",
    ...(step ? { currentStep: step } : {}),
    error: message,
  }).catch((e) =>
    logRunError(
      runId,
      `could not mark run failed: ${e instanceof Error ? e.message : String(e)}`,
    ),
  );
}
