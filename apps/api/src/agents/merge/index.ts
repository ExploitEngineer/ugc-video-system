// Merge Agent — multi-segment pipeline final step.
//
// Concatenates the N persisted ~15s segment clips (in segment order) into one
// continuous mp4 (~30/45/60s) and persists it as the run's `final_video`
// (segmentIndex null), mirroring the single-clip 15s output so the API/UI
// surface it the same way. The heavy lifting (download + ffmpeg re-encode)
// lives in lib/video/merge.

import type { AspectRatio } from "@ugc/shared";
import { schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { createLogger } from "../../lib/log.js";
import { classifyRunError, RunFailure, truncateDetail } from "../../lib/run-failure.js";
import { FfmpegError, mergeSegmentUrls } from "../../lib/video/merge.js";
import { segmentVideos } from "../creative-direction/inputs.js";
import { writeStepEvent } from "../events.js";
import { persistSheet } from "../persist.js";
import type { SkillContext, SkillResult } from "../types.js";

type Video = typeof schema.videos.$inferSelect;

/** Nominal length of one segment clip (~15s), used for the merged duration. */
const SEGMENT_DURATION_SEC = 15;

/** Long/short edge per provider resolution setting. */
const RESOLUTION_EDGES: Record<string, { long: number; short: number }> = {
  "1080p": { long: 1920, short: 1080 },
  "720p": { long: 1280, short: 720 },
  "480p": { long: 864, short: 480 },
};

/**
 * The expected segment frame size for this run — pins the merge's pass-A
 * letterbox so the lossless concat can never hit a resolution mismatch.
 * Unrecognized resolution settings fall back to native-size segments.
 */
function targetSizeFor(
  aspectRatio: AspectRatio,
): { width: number; height: number } | undefined {
  const edges = RESOLUTION_EDGES[env.BYTEPLUS_VIDEO_RESOLUTION];
  if (!edges) return undefined;
  return aspectRatio === "9:16"
    ? { width: edges.short, height: edges.long }
    : { width: edges.long, height: edges.short };
}

/**
 * Merge the run's N segment clips into the final merged video. Idempotent at the
 * step level: if a `final_video` already exists (resume after a crash post-merge)
 * the orchestrator skips this step; here we just (re)build from the segments.
 */
export async function mergeSegments(
  ctx: SkillContext,
): Promise<SkillResult<Video>> {
  const runId = ctx.runId;
  const log = createLogger("merge", { run: runId });

  await writeStepEvent({ runId, step: "merge", status: "started" });
  try {
    const segments = await segmentVideos(runId);
    if (segments.length < 2) {
      throw new Error(
        `merge needs at least 2 segment clips, found ${segments.length}`,
      );
    }
    log.info("▶ merging segment clips", { count: segments.length });

    const { bytes, mime } = await mergeSegmentUrls(
      segments.map((s) => s.assetUrl),
      {
        musicBedUrl: env.MUSIC_BED_URL,
        targetSize: targetSizeFor(ctx.aspectRatio),
      },
    );
    const durationSec = segments.length * SEGMENT_DURATION_SEC;

    const persisted = await persistSheet<Video>({
      runId,
      kind: "final_video",
      bytes,
      mime,
      artifactInsert: async (tx, assetId) => {
        const [row] = await tx
          .insert(schema.videos)
          .values({
            runId,
            assetId,
            durationSec: String(durationSec),
            segmentIndex: null, // the merged output
            hasAudio: true,
            providerMeta: {
              provider: "ffmpeg",
              merged: true,
              segmentCount: segments.length,
              model: env.BYTEPLUS_VIDEO_MODEL,
            },
            status: "completed",
          })
          .returning();
        return row;
      },
    });

    await writeStepEvent({
      runId,
      step: "merge",
      status: "passed",
      payload: { durationSec, segments: segments.length },
    });
    log.info("✓ final merged video persisted", {
      assetId: persisted.assetId,
      durationSec,
    });
    return { ...persisted, promptUsed: "" };
  } catch (err) {
    // Classify here so ffmpeg stderr only ever reaches logs + the step_event
    // `detail`, never the failure message itself.
    const failure = classifyRunError(err, "VIDEO_MERGE_FAILED");
    const raw = err instanceof Error ? err.message : String(err);
    const detail = err instanceof FfmpegError ? `${raw}\n${err.detail}` : (failure.detail ?? raw);
    log.error("✗ merge failed", { code: failure.code, err: detail });
    await writeStepEvent({
      runId,
      step: "merge",
      status: "failed",
      payload: {
        error: failure.userMessage,
        code: failure.code,
        detail: truncateDetail(detail),
      },
    });
    // Re-wrap with the full detail (incl. the ffmpeg stderr tail) so failRun's
    // server log carries it too.
    throw new RunFailure(failure.code, failure.userMessage, detail, { cause: err });
  }
}

/** Merge Agent barrel. */
export const mergeAgent = {
  mergeSegments,
};
