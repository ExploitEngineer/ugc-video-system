// Merge Agent — 60s pipeline final step.
//
// Concatenates the four persisted ~15s segment clips (in segment order) into one
// continuous 60s mp4 and persists it as the run's `final_video` (segmentIndex
// null), mirroring the single-clip 15s output so the API/UI surface it the same
// way. The heavy lifting (download + ffmpeg re-encode) lives in lib/video/merge.

import { schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { createLogger } from "../../lib/log.js";
import { mergeSegmentUrls } from "../../lib/video/merge.js";
import { segmentVideos } from "../creative-direction/inputs.js";
import { writeStepEvent } from "../events.js";
import { persistSheet } from "../persist.js";
import type { SkillContext, SkillResult } from "../types.js";

type Video = typeof schema.videos.$inferSelect;

/** Nominal length of one segment clip (~15s), used for the merged duration. */
const SEGMENT_DURATION_SEC = 15;

/**
 * Merge the run's four segment clips into the final 60s video. Idempotent at the
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
      { musicBedUrl: env.MUSIC_BED_URL },
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
            segmentIndex: null, // the merged 60s output
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
    log.info("✓ final 60s video persisted", {
      assetId: persisted.assetId,
      durationSec,
    });
    return { ...persisted, promptUsed: "" };
  } catch (err) {
    await writeStepEvent({
      runId,
      step: "merge",
      status: "failed",
      payload: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Merge Agent barrel. */
export const mergeAgent = {
  mergeSegments,
};
