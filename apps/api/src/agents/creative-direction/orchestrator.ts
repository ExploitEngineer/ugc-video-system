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
// This convention keeps the single /feedback gate route correct: an approve
// flips awaiting_confirmation→running (driver advances via nextStep), a revise
// flips →regenerating (driver re-runs the stage of currentStep).

import type { Step } from "@ugc/shared";
import { eq } from "drizzle-orm";
import { env } from "../../config/index.js";
import { db, schema } from "../../db/index.js";
import {
  createOpenAIProvider,
  type ImageRef,
  type OpenAIProvider,
} from "../../providers/openai/index.js";
import { createVideoProvider } from "../../providers/index.js";
import type { VideoProvider } from "../../providers/video.js";
import { writeStepEvent } from "../events.js";
import { persistSheet } from "../persist.js";
import { cropRowsAs2x2 } from "../../lib/image/crop.js";
import { fetchWithRetry } from "../../lib/http.js";
import { logRun, logRunError } from "../../lib/log.js";
import { criticAgent } from "../critic/index.js";
import type { CriticOutcome } from "../critic/types.js";
import { imageAgent } from "../image/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { mergeAgent } from "../merge/index.js";
import { videoAgent } from "../video/index.js";
import type { SkillContext } from "../types.js";
import { interpretAdStyle } from "./interpret-style/index.js";
import { describeProduct } from "./describe-product/index.js";
import { narrativeOutline, SEGMENT_COUNT } from "./narrative-outline/index.js";
import { planPersonBrief } from "./person-brief/index.js";
import { derivePersonBrief } from "./derive-person-brief/index.js";
import {
  planRevision,
  type RevisionDirective,
} from "./plan-revision/index.js";
import {
  latestMasterStoryboard,
  latestProductSheet,
  latestStoryboardSheet,
  loadUploads,
  persistedMasterStoryboard,
  persistedSegmentStoryboardIndices,
  persistedSegmentVideoIndices,
  resolvePersonRef,
  segmentStoryboards,
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
    productBrief: run.productBrief ?? "",
    productUse: (run.productUse as SkillContext["productUse"]) ?? undefined,
    personBrief: run.personBrief ?? "",
    aspectRatio: run.aspectRatio,
    // 60s only — the locked visual-style bible (set once by narrative_outline).
    // Each driveRun loop iteration re-reads the run and rebuilds ctx, so by the
    // time segment_storyboard/segment_video run it is populated.
    visualStyle:
      run.duration === "60s" ? (run.visualStyle ?? undefined) : undefined,
    openai,
    video,
  };
}

/**
 * Run `items` through `worker` with at most `limit` in flight at once. Like a
 * bounded `Promise.allSettled` — every item runs, failures are returned (not
 * thrown) so the caller can surface the first one after all have settled. Used
 * to throttle the parallel segment-video fan-out against BytePlus task limits.
 */
async function runBounded<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
        results[i] = { status: "fulfilled", value: undefined };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Run a single pipeline step against the latest persisted artifacts.
 * Generation steps write their own started/passed events here; the critic and
 * video skills write their own. Returns the Critic outcome for gate steps.
 */
async function executeStep(
  ctx: SkillContext,
  step: Step,
  directive?: RevisionDirective,
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
      // Anchor on a base image (→ image-to-image) in two cases:
      //   - revision "edit": the prior person sheet, so the same person is kept
      //     and only the requested aspects change;
      //   - first generation WITH an uploaded person: the uploaded photo, so the
      //     sheet preserves that real person instead of inventing one.
      // First generation with no upload has no base → invent from the brief.
      const baseRef = directive
        ? directive.scope === "edit"
          ? await resolvePersonRef(runId, personUpload)
          : undefined
        : personUpload;
      await writeStepEvent({ runId, step, status: "started" });
      const res = await imageAgent.generatePersonImage(ctx, {
        personBrief,
        userPrompt,
        directive,
        baseRef,
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
        directive,
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
      // Also pass the PRODUCT sheet as a plain ref (@Image1) so Seedance locks
      // the product's exact identity/finish/markings instead of inheriting the
      // storyboard's drift — same as the 60s segment path does.
      const product = await latestProductSheet(runId);
      const productSheetRef: ImageRef | undefined = product
        ? { source: product.assetUrl, mime: "image/png" }
        : undefined;
      // videoBuilder writes its own video step_events.
      await videoAgent.videoBuilder(ctx, {
        storyboardSheetRef: { source: storyboard.assetUrl } as ImageRef,
        hasPerson: Boolean(personRef),
        personFaceRef: personRef,
        productSheetRef,
        scenes: (storyboard.scenes ?? []) as StoryboardScene[],
        // Pin the presenter's identity in the video prompt. Empty for uploaded
        // persons (no text brief) — the gender-locked scene text carries it then.
        characterAnchor: ctx.personBrief,
        userPrompt,
      });
      return {};
    }

    // ── 60s pipeline ────────────────────────────────────────────────────

    case "narrative_outline": {
      // Plan the whole 60s arc as four segment summaries BEFORE any storyboard,
      // so each storyboard can be handed the others' summaries (continuity).
      await writeStepEvent({ runId, step, status: "started" });
      const outline = await narrativeOutline(ctx, { userPrompt });
      // Persist the arc AND the locked visual-style bible. visual_style is then
      // read back into ctx on the next loop iteration and injected verbatim into
      // every segment storyboard + video prompt.
      await setRun(runId, {
        narrativeOutline: outline,
        visualStyle: outline.visualStyle,
      });
      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { segments: outline.segments.length },
      });
      return {};
    }

    case "segment_storyboard": {
      // 60s ONE-MASTER: generate a SINGLE 16-panel (4×4) storyboard sheet, then
      // crop it into four row strips — one per segment — that the video step
      // animates. Consistency is inherent (it is ONE image), so there is no
      // per-segment image fan-out here. Idempotent / resume:
      //   • plain resume → skip if the master + all four crops already exist;
      //     else reload/regenerate the master and fill only the MISSING crops.
      //   • revise (directive) → rebuild the whole master and re-crop ALL four
      //     (newest-per-index supersedes the old crop rows; no deletes).
      const product = await latestProductSheet(runId);
      if (!product) throw new Error("no product sheet before segment storyboards");
      const personSheetRef = await resolvePersonRef(runId, personUpload);
      const productSheetRef: ImageRef = {
        source: product.assetUrl,
        mime: "image/png",
      };

      const haveMaster = await persistedMasterStoryboard(runId);
      const crops = await persistedSegmentStoryboardIndices(runId);
      const isRevise = Boolean(directive);

      // Plain resume with the master + all four crops already persisted → done.
      if (!isRevise && haveMaster && crops.size >= SEGMENT_COUNT) return {};

      await writeStepEvent({ runId, step, status: "started" });

      // 1. The 16-panel master sheet. Generate fresh on a first run / revise; on a
      //    mid-step resume reload the persisted master's bytes + 16 scenes so the
      //    one paid image gen is never repeated.
      let masterBytes: Uint8Array;
      let masterScenes: StoryboardScene[];
      let masterPrompt: string;
      if (isRevise || !haveMaster) {
        const master = await imageAgent.generateMaster(ctx, {
          productSheetRef,
          personSheetRef,
          userPrompt,
          directive,
        });
        masterBytes = master.bytes;
        masterScenes = master.scenes;
        masterPrompt = master.imagePrompt;
        await persistSheet({
          runId,
          kind: "storyboard_master",
          bytes: master.bytes,
          mime: master.mime,
          artifactInsert: async (tx, assetId) => {
            const [row] = await tx
              .insert(schema.storyboardSheets)
              .values({
                runId,
                assetId,
                scenes: master.scenes,
                segmentIndex: null,
                promptUsed: master.imagePrompt,
                status: "draft",
              })
              .returning();
            return row;
          },
        });
      } else {
        const existing = await latestMasterStoryboard(runId);
        if (!existing) throw new Error("master storyboard missing on resume");
        masterScenes = (existing.scenes ?? []) as StoryboardScene[];
        masterPrompt = "segment crop of master";
        const res = await fetchWithRetry(existing.assetUrl, undefined, {
          label: "master-storyboard-download",
        });
        if (!res.ok) {
          throw new Error(`master storyboard download failed: ${res.status}`);
        }
        masterBytes = new Uint8Array(await res.arrayBuffer());
      }

      // 2. Crop the master into four per-segment guides — each row re-tiled into a
      //    2×2 block (BytePlus rejects the ~7:1 row strip) — and persist any missing
      //    crop as a `storyboard_sheet` (segment_index 0..3) carrying that row's 4
      //    scenes — exactly the shape segment_video reads via segmentStoryboards().
      const strips = await cropRowsAs2x2(masterBytes, SEGMENT_COUNT);
      for (let i = 0; i < SEGMENT_COUNT; i++) {
        if (!isRevise && crops.has(i)) continue;
        const stripScenes = masterScenes.slice(i * 4, i * 4 + 4);
        await persistSheet({
          runId,
          kind: "storyboard_sheet",
          bytes: strips[i],
          mime: "image/png",
          artifactInsert: async (tx, assetId) => {
            const [row] = await tx
              .insert(schema.storyboardSheets)
              .values({
                runId,
                assetId,
                scenes: stripScenes,
                segmentIndex: i,
                promptUsed: masterPrompt,
                status: "draft",
              })
              .returning();
            return row;
          },
        });
      }

      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { segments: SEGMENT_COUNT },
      });
      return {};
    }

    case "segment_video": {
      // Fan out the four 15s clips, one per row strip, throttled to
      // SEGMENT_VIDEO_CONCURRENCY against BytePlus task limits. videoBuilder writes
      // its own per-segment step events. Idempotent: skip segments already built.
      const sheets = await segmentStoryboards(runId);
      if (sheets.length < SEGMENT_COUNT) {
        throw new Error(
          `segment_video: expected ${SEGMENT_COUNT} storyboards, found ${sheets.length}`,
        );
      }
      const done = await persistedSegmentVideoIndices(runId);
      const todo = sheets.filter((s) => !done.has(s.segmentIndex));
      const personRef = await resolvePersonRef(runId, personUpload);
      // Shared PRODUCT reference sheet — sent to every segment as a plain
      // `@Image 1` ref so Seedance locks the product's identity identically
      // across all four clips (the per-segment storyboard alone drifts).
      const product = await latestProductSheet(runId);
      const productSheetRef: ImageRef | undefined = product
        ? { source: product.assetUrl, mime: "image/png" }
        : undefined;

      const results = await runBounded(
        todo,
        env.SEGMENT_VIDEO_CONCURRENCY,
        async (sheet) => {
          await videoAgent.videoBuilder(ctx, {
            storyboardSheetRef: { source: sheet.assetUrl } as ImageRef,
            hasPerson: Boolean(personRef),
            personFaceRef: personRef,
            productSheetRef,
            scenes: (sheet.scenes ?? []) as StoryboardScene[],
            characterAnchor: ctx.personBrief,
            userPrompt,
            segmentIndex: sheet.segmentIndex,
          });
        },
      );
      const failed = results.find((r) => r.status === "rejected");
      if (failed) throw (failed as PromiseRejectedResult).reason;
      return {};
    }

    case "merge": {
      // Concatenate the four clips into the final 60s video. Writes its own
      // started/passed/failed events and persists the merged final_video.
      await mergeAgent.mergeSegments(ctx);
      return {};
    }
  }
}

/**
 * Reference phase — generate the product sheet and the person sheet
 * CONCURRENTLY. The product sheet runs immediately; the person sheet is built
 * from the uploaded photo when one exists, else invented from a product-derived
 * TEXT brief planned HERE (vision over the uploaded product image). Planning the
 * brief inside the person branch — instead of serially before the phase — keeps
 * the product sheet, which needs neither, off the brief's critical path. Each
 * step writes its own started/passed events. Returns the first failing step.
 */
async function runReferencePhase(
  ctx: SkillContext,
  tag?: string,
): Promise<{ failedStep?: Step; err?: unknown }> {
  const runId = ctx.runId;
  const { productUpload, personUpload } = await loadUploads(runId);
  const userPrompt = (await readRun(runId))?.prompt ?? "";

  // Person branch: when inventing a person (a product but no uploaded person),
  // plan + persist the brief FIRST, then generate the sheet — `executeStep`
  // reads `runs.personBrief` back from the DB, so this ordering is required.
  // With an uploaded person the brief is skipped (the sheet is built from the
  // photo). The product branch runs alongside and never waits on the brief.
  const personBranch = async (): Promise<void> => {
    if (productUpload && !personUpload) {
      // Invent the person from the product — the sheet skill READS this brief,
      // so it must be persisted BEFORE the person_sheet step.
      const { personBrief } = await planPersonBrief(ctx, {
        userPrompt,
        productUpload,
      });
      await setRun(runId, { personBrief });
      logRun(runId, `person brief: "${personBrief}"`, tag);
      await executeStep(ctx, "person_sheet");
      return;
    }
    if (personUpload) {
      // Uploaded person — the sheet is built straight from the photo and does
      // NOT need the brief, so derive the gender/age/hair anchor CONCURRENTLY.
      // It only has to land before the (much later) storyboard step, which reads
      // runs.person_brief for its CHARACTER ANCHOR. Without this anchor a
      // gendered product brief (e.g. a "men's" watch) flips an uploaded woman to
      // a man. Best-effort: a vision hiccup must NOT fail the run — it falls back
      // to the prior empty-brief behaviour.
      const deriveBrief = (async () => {
        try {
          const { personBrief } = await derivePersonBrief(ctx, {
            userPrompt,
            personUpload,
          });
          if (personBrief) {
            await setRun(runId, { personBrief });
            logRun(runId, `person brief (from upload): "${personBrief}"`, tag);
          }
        } catch (err) {
          logRunError(
            runId,
            `person brief (from upload) failed (continuing without anchor): ${err instanceof Error ? err.message : String(err)}`,
            tag,
          );
        }
      })();
      await Promise.all([deriveBrief, executeStep(ctx, "person_sheet")]);
      return;
    }
    await executeStep(ctx, "person_sheet");
  };

  // Product-identity branch — vision over the upload → a factual product brief,
  // persisted to runs.product_brief as the canonical TEXT anchor for downstream
  // steps (storyboard, critic). Best-effort: a brief hiccup must NOT fail the
  // run, so it's caught here — the pipeline simply falls back to image-only
  // grounding (the prior behavior) when the brief is empty. Runs alongside the
  // product sheet, off its critical path (the sheet doesn't read the brief).
  const productBriefBranch = async (): Promise<void> => {
    if (!productUpload) return;
    try {
      const { productBrief, productUse } = await describeProduct(ctx, {
        userPrompt,
        productUpload,
      });
      // Persist both in one write. productUse rides into the storyboard still as
      // the authoritative causal use-sequence; productBrief stays the identity
      // anchor. Only write fields we actually got (keep prior values otherwise).
      const fields: Partial<RunRow> = {};
      if (productBrief) fields.productBrief = productBrief;
      if (productUse?.useVerb) fields.productUse = productUse;
      if (Object.keys(fields).length) {
        await setRun(runId, fields);
        logRun(
          runId,
          `product brief: "${productBrief}"${productUse?.useVerb ? ` · use: ${productUse.accessVerb ? `${productUse.accessVerb} → ` : ""}${productUse.useVerb} (${productUse.functionSignal})` : ""}`,
          tag,
        );
      }
    } catch (err) {
      logRunError(
        runId,
        `product brief failed (continuing without anchor): ${err instanceof Error ? err.message : String(err)}`,
        tag,
      );
    }
  };

  const [product, person] = await Promise.allSettled([
    executeStep(ctx, "product_sheet"),
    personBranch(),
    productBriefBranch(),
  ]);
  if (product.status === "rejected")
    return { failedStep: "product_sheet", err: product.reason };
  if (person.status === "rejected")
    return { failedStep: "person_sheet", err: person.reason };
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

  // Phase 0 — interpret the ad style once, when leaving `queued`. The
  // product-derived person brief is NOT planned here: it's deferred into the
  // parallel reference phase (concurrent with the product sheet), so the product
  // sheet — which needs neither the brief nor its vision call — starts at once.
  if (run.status === "queued") {
    const ctx = buildCtx(run);
    logRun(runId, "▶ interpreting ad style …", tag);
    try {
      const { adStyle, adType } = await interpretAdStyle(ctx, {
        userPrompt: run.prompt,
      });
      await setRun(runId, {
        adStyle,
        adType,
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
      // storyboard gate re-runs the storyboard (15s) / segment storyboards (60s).
      const genStep = genStepForRevise(gate, "person", run.duration);
      const message = run.feedback?.trim() ?? "";
      const t0 = Date.now();

      // Break the user's free-text feedback down into a concrete directive by
      // INSPECTING the artifact they rejected against the product (vision). This
      // is what turns vague feedback ("doesn't match the product") into specific
      // changes the image agent can actually execute — instead of appending the
      // raw text and regenerating a near-identical result.
      let directive: RevisionDirective | undefined;
      if (message) {
        const productSheet = await latestProductSheet(runId);
        const productRef = productSheet
          ? ({ source: productSheet.assetUrl, mime: "image/png" } as ImageRef)
          : undefined;
        let currentArtifact: ImageRef | undefined;
        if (gate === "storyboard") {
          // Ground the revise on the WHOLE current storyboard the user rejected:
          // the 60s 16-panel master sheet (one image now, no per-segment target),
          // else the 15s single sheet.
          const master =
            run.duration === "60s"
              ? await latestMasterStoryboard(runId)
              : undefined;
          const sb = master ?? (await latestStoryboardSheet(runId));
          if (sb) currentArtifact = { source: sb.assetUrl, mime: "image/png" };
        } else {
          currentArtifact = await resolvePersonRef(runId, personUpload);
        }
        if (currentArtifact) {
          directive = await planRevision(ctx.openai, {
            stage: gate,
            message,
            adStyle: ctx.adStyle,
            personBrief: run.personBrief ?? undefined,
            currentArtifact,
            productRef,
          });
          logRun(
            runId,
            `⟳ revise gate=${gate} scope=${directive.scope} changes=${directive.changes.length} keep=${directive.keep.length}`,
            tag,
          );
          // Reference gate: persist the rewritten brief so the change lives in the
          // dominant text (not a footnote) and stacks across repeated revises.
          if (gate === "reference" && directive.revisedBrief) {
            await setRun(runId, { personBrief: directive.revisedBrief });
          }
          // Record the directive for the audit trail (no `strategy` key → does
          // not count against the Critic auto-regen budget).
          await writeStepEvent({
            runId,
            step: genStep,
            status: "regenerated",
            payload: { directive, source: "user_feedback" },
          });
        }
      }
      if (!directive) {
        logRun(runId, `⟳ revise gate=${gate} genStep=${genStep} (no directive)`, tag);
      }
      logRun(runId, `▶ ${genStep} (revise) …`, tag);
      try {
        await executeStep(ctx, genStep, directive);
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
      // First generation: product + person sheets run CONCURRENTLY. `person_sheet`
      // is always the checkpoint the phase advances to — the gate/advance block
      // below treats it exactly like a single completed reference step.
      step = "person_sheet";
      logRun(runId, "▶ product_sheet + person_sheet (parallel) …", tag);
      const { failedStep, err } = await runReferencePhase(ctx, tag);
      if (failedStep) {
        await failRun(runId, failedStep, err);
        return;
      }
    } else {
      step = nextStep(
        run.currentStep,
        personUploaded,
        run.criticEnabled,
        run.duration,
      );
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

    // Success — advance the checkpoint, then decide the next state. The pipeline
    // terminates at `video` (15s) or `merge` (60s).
    if (step === "video" || step === "merge") {
      logRun(runId, "✓ run completed — final video ready", tag);
      await setRun(runId, { status: "completed", currentStep: step });
      return;
    }
    // Step-by-step gate: pause if completing this step lands us at a gate
    // boundary (next step is storyboard/outline or video/segment_video).
    // Independent of the Critic — gateForNext works whether or not inspection
    // steps run.
    const next = nextStep(step, personUploaded, run.criticEnabled, run.duration);
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
