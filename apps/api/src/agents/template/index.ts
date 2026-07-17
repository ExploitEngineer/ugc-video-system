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
import { downloadToBuffer, remoteContentLength } from "../../lib/download.js";
import { createLogger } from "../../lib/log.js";
import { RunFailure, runFailureWithCode } from "../../lib/run-failure.js";
import { capVideoDuration, muxVoiceover } from "../../lib/video/merge.js";
import { createTemplateRenderProvider } from "../../providers/index.js";
import type {
  TemplateRenderResult,
  TemplateRenderTask,
} from "../../providers/template-render.js";
import { latestFinalVideoUrl } from "../creative-direction/inputs.js";
import { writeStepEvent } from "../events.js";
import {
  persistAsset,
  persistSheet,
  persistSheetFromUrl,
  type PersistSheetResult,
} from "../persist.js";
import type { SkillContext } from "../types.js";
import { prepareTemplateClips } from "./clips.js";
import { fillTemplateText } from "./fill-text/index.js";
import { templateTotalSeconds } from "./geometry.js";
import { buildTemplateKeyframe } from "./keyframe/index.js";
import {
  dropAssetsByLayerName,
  dropImageAssets,
  isAssetRejectionError,
  parseMissingLayerName,
} from "./self-heal.js";
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
    // `image` assets had never once survived a job — Nexrender rejected them with
    // "assetRedefinition must include src, layerName, and filename", and one bad
    // asset aborts the WHOLE render, so they were switched off wholesale and every
    // generated still was paid for and thrown away. Two things were wrong with
    // them, and both are fixed upstream of here: they were WebP, which After
    // Effects cannot import at all, and an index-targeted one carried neither a
    // layerName nor a filename to satisfy the rejection.
    //
    // If they are refused anyway, the render loop below drops them and re-renders,
    // so a still that cannot be injected costs its slot's artwork, never the ad.
    const imageUrls = env.TEMPLATE_RENDER_INJECT_IMAGES
      ? await generatedImageUrls(runId)
      : new Map<string, string>();
    if (!env.TEMPLATE_RENDER_INJECT_IMAGES) {
      log.warn(
        "image assets are NOT injected (TEMPLATE_RENDER_INJECT_IMAGES=false) — those slots keep the template's own artwork",
      );
    }
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
        // Nexrender refused an asset rather than failing to find a layer. It names
        // no layer, so there is nothing targeted to drop — but the stills are the
        // only assets whose contract is unproven, and losing them costs artwork
        // rather than the ad. Try again without them before giving up.
        const rejectedAssets =
          isAssetRejectionError(result.error) &&
          attempt < MAX_TEMPLATE_RENDER_ATTEMPTS &&
          assets.some((a) => a.kind === "media" && a.mediaType === "image");
        if (rejectedAssets) {
          const before = assets.length;
          assets = dropImageAssets(assets);
          log.warn(
            "↻ Nexrender rejected an asset — retrying without the generated stills; those slots keep the template's artwork",
            { jobId: task.jobId, dropped: before - assets.length, attempt, error: result.error },
          );
          await db
            .update(schema.runs)
            .set({ nexrenderJobId: null })
            .where(eq(schema.runs.id, runId));
          continue;
        }

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
    // case, most .aep projects have none — so we lay the voiceover over the
    // finished render. `-shortest` trims the track to the composition's runtime.
    const wouldMux = !audioLayerName && audioUrl;

    // Supabase Storage caps a single upload (~50MB by default). Rather than fail
    // the run on a big render, keep the Nexrender URL directly (it serves the
    // composite; it expires ~14d, and with no audio layer it has no voiceover
    // since we don't re-host a muxed copy). Peek at the size via HEAD FIRST so an
    // oversized render skips the download + mux + upload entirely.
    const uploadCap = env.STORAGE_UPLOAD_MAX_BYTES;
    const remoteSize = await remoteContentLength(result.videoUrl);

    // Persist the render as an EXTERNAL asset — the Nexrender URL, no upload.
    const persistExternal = (): Promise<PersistSheetResult<Video>> =>
      persistSheetFromUrl<Video>({
        runId,
        kind: "templated_video",
        url: result.videoUrl as string,
        mime: "video/mp4",
        meta: { source: "nexrender", nexrenderTemplateId, oversized: true },
        artifactInsert: async (tx, assetId) => {
          const [row] = await tx
            .insert(schema.videos)
            .values({
              runId,
              assetId,
              segmentIndex: null,
              // Only the render's own audio (an audio layer, if any) — no muxed
              // voiceover, since we didn't download / re-host it.
              hasAudio: Boolean(audioLayerName),
              providerMeta: {
                provider: "nexrender",
                nexrenderTemplateId,
                nexrenderJobId: task.jobId,
                composition,
                voiceover: audioLayerName ? "audio-layer" : "none",
                external: true,
                oversized: true,
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

    let persisted: PersistSheetResult<Video>;
    if (remoteSize != null && remoteSize > uploadCap) {
      log.warn(
        "render exceeds the Storage cap — serving the Nexrender URL directly (no upload, no voiceover mux)",
        { bytes: remoteSize, cap: uploadCap, jobId: task.jobId },
      );
      persisted = await persistExternal();
    } else {
      // Download the Nexrender output and re-host to Supabase — the Cloud URL
      // expires (~14d), so persist our own copy immediately.
      let bytes: Uint8Array;
      if (wouldMux) {
        log.info("▶ muxing the voiceover over the render", { jobId: task.jobId });
        bytes = (await muxVoiceover(result.videoUrl, audioUrl)).bytes;
      } else {
        log.info("▶ downloading render output", { jobId: task.jobId });
        bytes = await downloadToBuffer(result.videoUrl, {
          label: "template-render-download",
        });
      }

      // The delivered ad runs the TEMPLATE's own length (capped at
      // MAX_TEMPLATE_SEC), not a forced 15s — the Seedance master is reused across
      // late slots (`slices.ts`), so slots at 18s/20s show real footage. Crop only
      // when the comp runs past that cap (an over-long grandfathered template),
      // avoiding a needless re-encode of the common in-band case.
      const adSec = templateTotalSeconds(template);
      const compSec = template.metadata.durationSec;
      // A MEASURED template needs no crop: `adSec` is the length this very
      // composition renders, so the render already IS that long. This survives only
      // as a safety net for an over-long grandfathered comp.
      //
      // A template with NO readable duration is now left ALONE. It used to be
      // cropped to the 15s default, which truncated a real 21s ad on the strength
      // of a number we never had — delivering what AE rendered beats cutting it to
      // a guess.
      if (compSec != null && compSec > adSec) {
        log.info("▶ cropping render to the template's length", { compSec, adSec });
        bytes = (await capVideoDuration(bytes, adSec)).bytes;
      }

      if (bytes.length > uploadCap) {
        // HEAD reported no size (or the processed file is still over the cap) —
        // too big to upload, so serve the Nexrender URL directly instead.
        log.warn(
          "render exceeds the Storage cap after processing — serving the Nexrender URL directly",
          { bytes: bytes.length, cap: uploadCap, jobId: task.jobId },
        );
        persisted = await persistExternal();
      } else {
        persisted = await persistSheet<Video>({
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
                  voiceover: wouldMux ? "muxed" : "audio-layer",
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
      }
    }

    // Best-effort: capture the MODIFIED .aep Nexrender returned (the editable
    // project), re-hosted to Supabase alongside the mp4. Non-fatal — not every
    // job/plan emits one, and a missing project must never fail the render.
    if (result.projectUrl) {
      try {
        const aepBytes = await downloadToBuffer(result.projectUrl, {
          label: "template-render-aep-download",
        });
        await persistAsset({
          runId,
          kind: "template_aep",
          bytes: aepBytes,
          mime: "application/x-aep",
          meta: { source: "nexrender", jobId: task.jobId },
        });
        log.info("✓ modified .aep persisted", { jobId: task.jobId });
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
    // FORCE the code — never `classifyRunError`, which runs the provider-signature
    // patterns FIRST and only falls back to the default when none match. Anything
    // failing in here reads as a generic provider error: a Supabase upload that
    // timed out matched the `timed out` pattern and this step reported
    // VIDEO_GENERATION_TIMEOUT. That is not cosmetic. `rewindStepForTemplateRegen`
    // is keyed on the TEMPLATE_* code, so the wrong code sent the retry down the
    // VIDEO regen path — re-generating a Seedance clip that was already finished,
    // to fix an upload. It also told the user their video timed out when the render
    // had in fact succeeded and was sitting on Nexrender, done and paid for.
    const failure = runFailureWithCode("TEMPLATE_RENDER_FAILED", err);
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
