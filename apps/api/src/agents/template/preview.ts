// The `previewing` stage of a template's lifecycle.
//
// Nexrender exposes no thumbnail endpoint and no way to attach our own metadata
// to a template, so the ONLY way to show a user what they are picking is to
// render the template once ourselves. An ordinary render job with an EMPTY asset
// list composites the template's own placeholder content.
//
// Deliberately a FULL render, not Nexrender's `preview` parameter: that one
// truncates the output (a 12.03s template came back as 3.7 seconds), so the
// picker's card would misreport how long the template runs.
//
// The output lives on Nexrender's CDN and expires (~14 days), so we download it
// immediately, re-host it to Supabase under `templates/{id}/`, and pull a poster
// frame out of it so the picker's grid does not have to decode a dozen clips.
//
// A preview render is a REAL render of the same template through the same
// engine. If it fails, the deliverable render would fail too — so a preview
// failure marks the template `failed` rather than merely leaving it thumbnail-
// less. That makes this stage a genuine validation gate, not just cosmetics.

import { env } from "../../config/index.js";
import { unprocessable } from "../../lib/errors.js";
import { isTransientNetworkError } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { uploadTemplateObject } from "../../lib/storage.js";
import { extractPoster, probeVideoDuration } from "../../lib/video/merge.js";
import { createTemplateRenderProvider } from "../../providers/index.js";
import { isStubTemplateId } from "../../providers/nexrender/index.js";
import type { TemplateRenderProvider } from "../../providers/template-render.js";
import {
  failTemplate,
  getTemplate,
  parseMetadata,
  parseStructure,
  setTemplate,
  type TemplateRow,
  validateMeasuredDuration,
} from "./library.js";

const log = createLogger("template-preview");

/**
 * Decide what to do when a preview network operation (poll / download) hits a
 * transient failure on a flaky connection. A non-network error rethrows (it's a
 * real bug). A transient one leaves the template in `previewing` so the worker
 * retries next tick (the `previewJobId` is persisted, so the retry re-polls the
 * finished job and re-downloads — no second render), UNTIL the dead-man's-switch
 * window since submission passes, at which point it fails terminally.
 *
 * Returns the row `previewTemplate` should hand back.
 */
async function retryOrFailPreview(
  row: TemplateRow,
  jobId: string,
  what: string,
  err: unknown,
): Promise<TemplateRow> {
  if (!isTransientNetworkError(err)) throw err;
  const age = Date.now() - row.updatedAt.getTime();
  if (age > env.NEXRENDER_POLL_TIMEOUT_MS) {
    await failTemplate(
      row.id,
      `Preview ${what} unreachable for ${Math.round(env.NEXRENDER_POLL_TIMEOUT_MS / 60000)} minutes (job ${jobId}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return (await getTemplate(row.id)) ?? row;
  }
  log.warn(`preview ${what} unreachable — will retry next tick`, {
    id: row.id,
    jobId,
    err:
      (err as { cause?: { code?: string } })?.cause?.code ??
      (err as Error).message,
  });
  return row; // status stays `previewing` → the worker retries
}

/**
 * Advance a `previewing` template by ONE step, then return.
 *
 * Called on a timer by the preview worker (and by the admin console), so it
 * never blocks: it submits the job on the first call and polls on later ones.
 *
 *  - still rendering → the row is returned unchanged, still `previewing`
 *  - completed       → download, re-host, poster, `ready`
 *  - failed / timeout→ `failed`, with the reason on the row
 */
export async function previewTemplate(
  id: string,
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw new Error(`preview: template ${id} not found`);
  if (!row.nexrenderTemplateId) {
    await failTemplate(id, "Template was never registered with Nexrender.");
    return (await getTemplate(id)) ?? row;
  }

  const structure = parseStructure(row.structure);
  if (!structure?.mainComposition) {
    await failTemplate(id, "Template has no renderable composition.");
    return (await getTemplate(id)) ?? row;
  }

  // Submit once. The job id is persisted BEFORE the first poll, so a process
  // that crashes mid-render resumes by polling THAT job rather than paying for
  // a second one — the same guarantee `runs.nexrender_job_id` gives a render.
  let jobId = row.previewJobId;
  if (!jobId) {
    const task = await provider.submitRender({
      nexrenderTemplateId: row.nexrenderTemplateId,
      composition: structure.mainComposition,
      assets: [], // the template renders its OWN placeholder content
      libraryPreview: true,
      referenceTag: id,
    });
    jobId = task.jobId;
    await setTemplate(id, { previewJobId: jobId });
    log.info("preview submitted", { id, jobId });
    return (await getTemplate(id)) ?? row;
  }

  let result: Awaited<ReturnType<TemplateRenderProvider["pollRender"]>>;
  try {
    result = await provider.pollRender({ jobId });
  } catch (err) {
    // A transient network blip polling a job that may already be done must not
    // fail the template — retry next tick.
    return retryOrFailPreview(row, jobId, "poll", err);
  }

  if (result.state === "failed") {
    await failTemplate(
      id,
      result.error ?? `Preview render failed (job ${jobId}).`,
    );
    return (await getTemplate(id)) ?? row;
  }

  if (result.state !== "completed" || !result.videoUrl) {
    // Dead-man's switch. `updatedAt` was stamped when `previewJobId` was
    // persisted and is not touched while polling, so it dates the submission.
    const age = Date.now() - row.updatedAt.getTime();
    if (age > env.NEXRENDER_POLL_TIMEOUT_MS) {
      await failTemplate(
        id,
        `Preview render did not finish within ${Math.round(env.NEXRENDER_POLL_TIMEOUT_MS / 60000)} minutes (job ${jobId}, last status: ${result.status ?? "unknown"}).`,
      );
      return (await getTemplate(id)) ?? row;
    }
    return row; // still rendering
  }

  // Completed. The render is large (Nexrender outputs `video_h264_vbr_15mbps`, so a
  // 40s+ template exceeds the storage bucket's object-size limit), and the preview is
  // just a library-card thumbnail — so reference the Nexrender output URL DIRECTLY
  // rather than re-hosting the whole clip. Nexrender retains outputs ~14d; only the
  // tiny poster JPEG is stored, so the card keeps a stable thumbnail after it expires.
  log.info("preview completed — referencing the Nexrender URL", { id, jobId });

  // The poster is a nicety, not a requirement: a card can fall back to the video's
  // own first frame. Never fail a good template over a missing JPEG.
  let poster: { url: string; storagePath: string } | null = null;
  try {
    const frame = await extractPoster(result.videoUrl);
    poster = await uploadTemplateObject({
      templateId: id,
      kind: "poster",
      bytes: frame.bytes,
      contentType: frame.mime,
    });
  } catch (err) {
    log.warn("poster extraction failed (non-fatal)", {
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // MEASURE the template's real length off this clip. It is the same composition
  // rendered with no assets, so its length IS the template's length, by definition —
  // whereas the composition's `duration` property is arbitrary (After Effects
  // renders the WORK AREA, and Nexrender exposes no work-area field). Believing the
  // property made a 21s ad generate a 36s master.
  //
  // Best-effort: a template is never failed over a probe that could not run — the
  // composition's number stays as the (poor) fallback.
  let measured: number | null = null;
  if (isStubTemplateId(row.nexrenderTemplateId)) {
    // The stub hands back a canned 2s clip; measuring it would reject every
    // template in the free smoke-test path for being under MIN_TEMPLATE_SEC.
    // Checked per-ROW, not per-env: a stub-registered row always carries the
    // prefix, even if this process now holds real credentials.
    log.info("stub preview — keeping the composition's duration", { id });
  } else {
    try {
      measured = await probeVideoDuration(result.videoUrl);
    } catch (err) {
      log.warn("preview duration probe failed (non-fatal)", {
        id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const prior = parseMetadata(row.metadata);
  if (measured != null) {
    const rejection = validateMeasuredDuration(measured);
    if (rejection) {
      // Deliberately NOT `discardRemoteTemplate`, unlike the introspection gate:
      // this is OUR measurement, and a regression in it must never wipe a user's
      // upload. The row fails; the bytes stay.
      await failTemplate(id, rejection);
      return (await getTemplate(id)) ?? row;
    }
    log.info("preview measured", {
      id,
      measured,
      comp: prior?.durationSec ?? null,
      drift: (measured - (prior?.durationSec ?? 0)).toFixed(2),
    });
  }

  const metadata = prior
    ? measured != null
      ? {
          ...prior,
          durationSec: measured,
          measuredDurationSec: measured,
          durationSource: "measured" as const,
        }
      : { ...prior, durationSource: "composition" as const }
    : null;

  await setTemplate(id, {
    previewVideoUrl: result.videoUrl,
    previewVideoPath: null, // not re-hosted — the URL is Nexrender's own (expires ~14d)
    previewPosterUrl: poster?.url ?? null,
    previewPosterPath: poster?.storagePath ?? null,
    previewSource: "auto",
    ...(metadata ? { metadata } : {}),
    error: null,
    status: "ready",
  });
  log.info("✓ preview ready", {
    id,
    hasPoster: Boolean(poster),
    durationSec: metadata?.durationSec ?? null,
    source: metadata?.durationSource ?? "unknown",
  });
  return (await getTemplate(id)) ?? row;
}

/**
 * Replace a template's preview with an admin-supplied clip.
 *
 * The escape hatch for a template whose placeholder content is grey boxes and
 * Lorem Ipsum: the auto-render is faithful but ugly, so let the admin drop in
 * the designer's own demo video. Skips Nexrender entirely.
 */
/**
 * Re-measure an EXISTING preview and correct the template's recorded length.
 *
 * The backfill for templates registered before the length was measured: their
 * `durationSec` is the composition's `duration` property, which is arbitrary (one
 * real template reports 30.97s and renders 21.0s), so their runs over-generate
 * footage and slice it from the wrong seconds.
 *
 * Costs nothing when the preview is still on Nexrender's CDN (~14d retention) —
 * it just re-reads the clip. Once it has expired, `DELETE /:id/preview` regenerates
 * one and the normal path measures it.
 */
export async function remeasureTemplate(id: string): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw new Error(`remeasure: template ${id} not found`);
  if (!row.previewVideoUrl) {
    throw unprocessable(
      "This template has no preview to measure. Regenerate the preview first (DELETE /admin/templates/:id/preview).",
    );
  }
  if (row.previewSource !== "auto") {
    // An admin-supplied demo clip's length has nothing to do with the composition.
    throw unprocessable(
      "This template's preview is an admin override, so its length is not the template's. Regenerate the auto preview to measure it.",
    );
  }
  if (row.nexrenderTemplateId && isStubTemplateId(row.nexrenderTemplateId)) {
    throw unprocessable("This is a stub template; its canned preview is not measurable.");
  }

  const measured = await probeVideoDuration(row.previewVideoUrl);
  if (measured == null) {
    throw unprocessable(
      "Could not read the preview's duration — it may have expired. Regenerate the preview (DELETE /admin/templates/:id/preview).",
    );
  }
  const rejection = validateMeasuredDuration(measured);
  if (rejection) throw unprocessable(rejection);

  const prior = parseMetadata(row.metadata);
  if (!prior) throw unprocessable("This template has no readable metadata to correct.");

  log.info("remeasured", {
    id,
    measured,
    was: prior.durationSec,
    drift: (measured - (prior.durationSec ?? 0)).toFixed(2),
  });
  await setTemplate(id, {
    metadata: {
      ...prior,
      durationSec: measured,
      measuredDurationSec: measured,
      durationSource: "measured",
    },
  });
  return (await getTemplate(id)) ?? row;
}

export async function setPreviewOverride(
  id: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw new Error(`preview override: template ${id} not found`);

  // Deliberately does NOT measure this clip's duration, unlike `previewTemplate`.
  // This is a hand-picked demo video whose length has nothing to do with the
  // composition's — writing it into `metadata.durationSec` would make every beat,
  // segment and slice downstream follow a fiction.

  const video = await uploadTemplateObject({
    templateId: id,
    kind: "preview",
    bytes,
    contentType,
  });

  let poster: { url: string; storagePath: string } | null = null;
  try {
    const frame = await extractPoster(video.url);
    poster = await uploadTemplateObject({
      templateId: id,
      kind: "poster",
      bytes: frame.bytes,
      contentType: frame.mime,
    });
  } catch (err) {
    log.warn("poster extraction failed for override (non-fatal)", {
      id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // A template with an introspected structure is usable; one without still needs
  // to finish introspecting before it can be picked.
  const introspected = Boolean(parseStructure(row.structure)?.mainComposition);
  await setTemplate(id, {
    previewVideoUrl: video.url,
    previewVideoPath: video.storagePath,
    previewPosterUrl: poster?.url ?? null,
    previewPosterPath: poster?.storagePath ?? null,
    previewSource: "admin",
    error: null,
    ...(introspected ? { status: "ready" as const } : {}),
  });
  log.info("✓ preview override stored", { id, introspected });
  return (await getTemplate(id)) ?? row;
}

/**
 * Throw away the current preview and re-render it. Clears the persisted job id
 * so `previewTemplate` submits a fresh one rather than polling the dead job.
 */
export async function regeneratePreview(id: string): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw new Error(`regenerate preview: template ${id} not found`);

  const hasStructure = Boolean(parseStructure(row.structure)?.mainComposition);
  await setTemplate(id, {
    previewJobId: null,
    previewVideoUrl: null,
    previewVideoPath: null,
    previewPosterUrl: null,
    previewPosterPath: null,
    previewSource: null,
    error: null,
    // A template that never introspected has to do that first.
    status: hasStructure ? "previewing" : "introspecting",
  });
  log.info("preview reset", { id, hasStructure });
  return (await getTemplate(id)) ?? row;
}
