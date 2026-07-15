// Template Agent — the `pipeline: "template"` run's `template_render` step.
//
// Feeds the run's finished 15s clip into the After Effects template the user
// uploaded BEFORE the run was created (registered + introspected up front —
// see `POST /templates/register` — so a bad template file never wastes AI
// cost), via Nexrender, and persists the rendered result as a `templated_video`
// asset ALONGSIDE the original `final_video` (never replacing it).
//
// Async, like the Video Builder: submit a render → poll the job id → download
// the output mp4 → re-host to Supabase (Nexrender Cloud retains outputs ~14d).

import { and, eq } from "drizzle-orm";
import { runTemplateSchema, type TemplateTextFillEntry } from "@ugc/shared";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { classifyRunError, RunFailure } from "../../lib/run-failure.js";
import { capVideoDuration, muxVoiceover } from "../../lib/video/merge.js";
import { createTemplateRenderProvider } from "../../providers/index.js";
import type {
  TemplateRenderResult,
  TemplateRenderTask,
} from "../../providers/template-render.js";
import { latestFinalVideoUrl } from "../creative-direction/inputs.js";
import { writeStepEvent } from "../events.js";
import { persistAsset, persistSheet } from "../persist.js";
import type { SkillContext } from "../types.js";
import { prepareTemplateClips } from "./clips.js";
import { fillTemplateText } from "./fill-text/index.js";
import { templateTotalSeconds } from "./geometry.js";
import { buildTemplateKeyframe } from "./keyframe/index.js";
import { dropAssetsByLayerName, parseMissingLayerName } from "./self-heal.js";
import { generateTemplateImages } from "./images/index.js";
import { planTemplate } from "./plan/index.js";
import { buildRenderInput } from "./render-input.js";
import { buildTemplateVideo } from "./video/index.js";

type Video = typeof schema.videos.$inferSelect;

/**
 * How many times a single `template_render` submits to Nexrender before giving
 * up: one real attempt plus up to three self-heal retries, each dropping one
 * unresolvable layer. Bounds the paid-render cost of a pathological template
 * while still clearing the common one-or-two-bad-layer case.
 */
const MAX_TEMPLATE_RENDER_ATTEMPTS = 4;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The stills `template_images` generated, keyed by the slot they belong to.
 * A slot with no entry keeps the template's own artwork.
 */
async function generatedImageUrls(runId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ url: schema.assets.url, meta: schema.assets.meta })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.runId, runId),
        eq(schema.assets.kind, "template_image"),
      ),
    );
  const out = new Map<string, string>();
  for (const r of rows) {
    const name = (r.meta as { jobLayerName?: string } | null)?.jobLayerName;
    if (name && r.url) out.set(name, r.url);
  }
  return out;
}

/**
 * Composite everything the pipeline generated — the clip, the written copy and
 * the generated stills — into the template picked at run creation. Idempotent on
 * resume: if a Nexrender job id is already persisted (crash mid-render) we poll
 * THAT job instead of submitting a second paid render.
 */
export async function applyTemplate(ctx: SkillContext): Promise<void> {
  const runId = ctx.runId;
  const log = createLogger("template", { run: runId });

  await writeStepEvent({ runId, step: "template_render", status: "started" });
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, runId),
    });
    if (!run) throw new Error(`template_render: run ${runId} not found`);

    const clipUrl = await latestFinalVideoUrl(runId);
    if (!clipUrl) {
      throw new Error("template_render: no final_video to feed the template");
    }

    const template = runTemplateSchema.parse(run.template);
    const imageUrls = await generatedImageUrls(runId);
    // Cut the 15s master into a slice per video slot, and pull out its voiceover.
    // Idempotent: a rewind into this step reuses the slices already cut rather
    // than paying for ffmpeg twice.
    const { clipUrls, audioUrl, audioLayerName } = await prepareTemplateClips(
      runId,
      template,
      clipUrl,
    );

    const input = buildRenderInput({
      runId,
      template,
      textFill: (run.templateTextFill as TemplateTextFillEntry[] | null) ?? [],
      imageUrls,
      clipUrls,
      masterClipUrl: clipUrl,
      audioUrl,
      audioLayerName,
    });
    const { mainComposition: composition, nexrenderTemplateId } = template;
    log.info("render job assembled", {
      assets: input.assets.length,
      images: imageUrls.size,
      clips: clipUrls.size,
      voiceover: audioLayerName ?? "muxed over the render",
    });

    const provider = createTemplateRenderProvider();

    // Render with self-healing. Nexrender aborts the WHOLE job on the first layer
    // it cannot resolve (this template duplicates the layer name "dynamic", which
    // its text function then can't find) and offers no per-asset skip. So on a
    // "couldn't find any layers by provided name (X)" failure we drop every asset
    // targeting X and re-render, bounded: the ad renders with the layers that DO
    // resolve, and the rest keep the template's own artwork. The single
    // `template_render: started` event above keeps the amber spinner alive across
    // every attempt, so the timeline reads as continuous work.
    let assets = input.assets;
    const skippedLayers: string[] = [];
    let result: TemplateRenderResult = { state: "processing" };
    let task: TemplateRenderTask | undefined;

    for (let attempt = 1; attempt <= MAX_TEMPLATE_RENDER_ATTEMPTS; attempt++) {
      // Reuse a persisted job id ONLY on the first attempt (idempotent resume
      // after a crash). A self-heal drop always submits a fresh job.
      if (attempt === 1 && run.nexrenderJobId) {
        log.info("resuming existing render job", { jobId: run.nexrenderJobId });
        task = { jobId: run.nexrenderJobId };
      } else {
        task = await provider.submitRender({ ...input, assets });
        await db
          .update(schema.runs)
          .set({ nexrenderJobId: task.jobId })
          .where(eq(schema.runs.id, runId));
      }

      // Poll until terminal or the dead-man's-switch timeout fires.
      const deadline = Date.now() + env.NEXRENDER_POLL_TIMEOUT_MS;
      result = { state: "processing" };
      while (Date.now() < deadline) {
        result = await provider.pollRender(task);
        if (result.state === "completed" || result.state === "failed") break;
        await sleep(env.NEXRENDER_POLL_INTERVAL_MS);
      }

      if (result.state === "completed") break;

      if (result.state === "failed") {
        const missing = parseMissingLayerName(result.error);
        const droppable =
          missing != null &&
          attempt < MAX_TEMPLATE_RENDER_ATTEMPTS &&
          assets.some((a) => a.layerName === missing);
        if (droppable) {
          const before = assets.length;
          assets = dropAssetsByLayerName(assets, missing);
          skippedLayers.push(missing);
          log.warn(
            "↻ render failed on an unresolvable layer — retrying without it",
            { jobId: task.jobId, skipping: missing, dropped: before - assets.length, attempt },
          );
          // Force a fresh submit next iteration.
          await db
            .update(schema.runs)
            .set({ nexrenderJobId: null })
            .where(eq(schema.runs.id, runId));
          continue;
        }
        throw new RunFailure(
          "TEMPLATE_RENDER_FAILED",
          "The template render failed.",
          result.error ?? `Nexrender job ${task.jobId} failed`,
        );
      }

      // Neither completed nor failed → the poll loop hit the timeout.
      throw new RunFailure(
        "TEMPLATE_RENDER_FAILED",
        "The template render timed out.",
        `Nexrender job ${task.jobId} did not finish within ${env.NEXRENDER_POLL_TIMEOUT_MS}ms (last status: ${result.status ?? "unknown"})`,
      );
    }

    if (!task || result.state !== "completed" || !result.videoUrl) {
      throw new RunFailure(
        "TEMPLATE_RENDER_FAILED",
        "The template render failed.",
        result.error ?? "the template render did not complete",
      );
    }
    if (skippedLayers.length > 0) {
      log.info("✓ render healed by skipping unresolvable layers", {
        skippedLayers: skippedLayers.join(", "),
      });
    }

    // The template has no audio layer to inject the speech into — the common
    // case, most .aep projects have none — so lay it over the finished render.
    // `-shortest` trims the 15s track to the composition's own runtime.
    const muxed = !audioLayerName && audioUrl;

    // Download the Nexrender output and re-host to Supabase — the Cloud URL
    // expires (~14d), so persist our own copy immediately.
    let bytes: Uint8Array;
    if (muxed) {
      log.info("▶ muxing the voiceover over the render", { jobId: task.jobId });
      bytes = (await muxVoiceover(result.videoUrl, audioUrl)).bytes;
    } else {
      log.info("▶ downloading render output", { jobId: task.jobId });
      const res = await fetchWithRetry(result.videoUrl, undefined, {
        label: "template-render-download",
      });
      if (!res.ok) {
        throw new Error(
          `template_render: download failed ${res.status} for job ${task.jobId}`,
        );
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    // The delivered ad runs the TEMPLATE's own length (capped at
    // MAX_TEMPLATE_SEC), not a forced 15s — the Seedance master is reused across
    // late slots (`slices.ts`), so slots at 18s/20s show real footage. Crop only
    // when the comp runs past that cap (an over-long grandfathered template),
    // avoiding a needless re-encode of the common in-band case.
    const adSec = templateTotalSeconds(template);
    const compSec = template.metadata.durationSec;
    if (compSec == null || compSec > adSec) {
      log.info("▶ cropping render to the template's length", { compSec, adSec });
      bytes = (await capVideoDuration(bytes, adSec)).bytes;
    }

    const persisted = await persistSheet<Video>({
      runId,
      kind: "templated_video",
      bytes,
      mime: "video/mp4",
      meta: { source: "nexrender", nexrenderTemplateId },
      artifactInsert: async (tx, assetId) => {
        const [row] = await tx
          .insert(schema.videos)
          .values({
            runId,
            assetId,
            segmentIndex: null,
            hasAudio: true,
            providerMeta: {
              provider: "nexrender",
              nexrenderTemplateId,
              nexrenderJobId: task.jobId,
              composition,
              voiceover: muxed ? "muxed" : "audio-layer",
              // Layers Nexrender could not resolve and the render dropped to
              // recover. Absent on a clean render; audits a partially-healed one.
              ...(skippedLayers.length > 0
                ? { skippedLayers: skippedLayers.join(", ") }
                : {}),
            },
            status: "completed",
          })
          .returning();
        return row;
      },
    });

    // Best-effort: capture the MODIFIED .aep Nexrender returned (the editable
    // project), re-hosted to Supabase alongside the mp4. Non-fatal — not every
    // job/plan emits one, and a missing project must never fail the render.
    if (result.projectUrl) {
      try {
        const aepRes = await fetchWithRetry(result.projectUrl, undefined, {
          label: "template-render-aep-download",
        });
        if (aepRes.ok) {
          await persistAsset({
            runId,
            kind: "template_aep",
            bytes: new Uint8Array(await aepRes.arrayBuffer()),
            mime: "application/x-aep",
            meta: { source: "nexrender", jobId: task.jobId },
          });
          log.info("✓ modified .aep persisted", { jobId: task.jobId });
        } else {
          log.warn("modified .aep download failed (non-fatal)", {
            jobId: task.jobId,
            status: aepRes.status,
          });
        }
      } catch (err) {
        log.warn("modified .aep capture failed (non-fatal)", {
          jobId: task.jobId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await writeStepEvent({
      runId,
      step: "template_render",
      status: "passed",
      payload: { nexrenderTemplateId, jobId: task.jobId },
    });
    log.info("✓ templated video persisted", { assetId: persisted.assetId });
  } catch (err) {
    const failure = classifyRunError(err, "TEMPLATE_RENDER_FAILED");
    const raw = err instanceof Error ? err.message : String(err);
    const detail = failure.detail ?? raw;
    log.error("✗ template_render failed", { code: failure.code, err: detail });
    // The single `failed` step-event is written by `failRun` in the orchestrator,
    // which catches this re-thrown RunFailure. Writing one here too produced two
    // identical `failed` rows for one failure and a flickering timeline.
    throw new RunFailure(failure.code, failure.userMessage, detail, {
      cause: err,
    });
  }
}

/** Template Agent barrel. */
export const templateAgent = {
  planTemplate,
  buildTemplateKeyframe,
  buildTemplateVideo,
  applyTemplate,
  fillTemplateText,
  generateTemplateImages,
};
