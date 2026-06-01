import type { SkillContext, SkillResult } from "../types.js";
import type { ImageRef } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { parseJsonObject } from "../json.js";
import { persistSheet } from "../persist.js";
import { writeStepEvent } from "../critic/events.js";
import { logRun } from "../../lib/log.js";
import { buildVideoPrompt } from "./prompt.js";

export interface VideoBuilderInput {
  /**
   * Approved storyboard sheet — kept for provenance only. It is NOT sent to the
   * video provider as an image (its panel numbers/arrows/captions would leak
   * into the clip); the plan reaches the model via `scenes` text instead.
   */
  storyboardSheetRef: ImageRef;
  /** Optional person/product reference sheets sent as Seedance image references. */
  referenceImages?: ImageRef[];
  /** Scene metadata from the storyboard_sheets row. */
  scenes: StoryboardScene[];
  userPrompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
  /** Optional critique to steer a regen (reserved for F7). */
  critique?: string;
}

const DEFAULT_DURATION_SEC = 15;

type Video = typeof schema.videos.$inferSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Video Builder skill — compose an LLM motion prompt from the storyboard
 * scenes (text plan) and send it to Seedance 2.0 (via the injected video
 * provider) together with the clean product/person reference sheets for
 * identity. The annotated storyboard sheet is NOT sent as an image, so its
 * panel numbers, arrows and captions never leak into the clip. Poll until
 * ready, download, and persist `assets` (final_video) + `videos`. Final output
 * of the pipeline; no merge step.
 */
export async function videoBuilder(
  ctx: SkillContext,
  input: VideoBuilderInput,
): Promise<SkillResult<Video>> {
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;

  await writeStepEvent({ runId: ctx.runId, step: "video", status: "started" });

  try {
    // 1. Compose the cinematic motion/audio prompt from the scenes.
    const messages = buildVideoPrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      scenes: input.scenes,
      durationSec,
      critique: input.critique,
    });
    const planRaw = await ctx.openai.chat(messages);
    const { videoPrompt } = parseJsonObject<{ videoPrompt: string }>(planRaw);
    if (!videoPrompt?.trim()) {
      throw new Error("LLM returned an empty videoPrompt");
    }

    // 2. Submit to the video provider. The storyboard is conveyed as the TEXT
    // plan only; identity comes from the clean product/person reference sheets.
    // No storyboard image is sent, so no grid/numbers/arrows leak into the clip.
    const prompt = `Render the FINAL VIDEO as ONE continuous, fully photorealistic live-action shot — real, lifelike humans with natural skin, realistic faces, real hair and true-to-life lighting, as if filmed with a real camera. This is a finished commercial ad, NOT a storyboard: do NOT render any panel numbers, labels, hand-drawn arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text — none of these may appear anywhere in the frame. Keep the product and the people consistent with the reference sheets. ${videoPrompt}`;
    const task = await ctx.video.submitVideo({
      referenceImages: input.referenceImages?.map((r) => r.source),
      prompt,
      durationSec,
    });

    // 3. Poll until completed / failed / timeout.
    const startedAt = Date.now();
    const deadline = startedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
    logRun(
      ctx.runId,
      `video task ${task.taskId} submitted — polling BytePlus …`,
    );
    let result = await ctx.video.pollVideo(task);
    while (result.state === "processing") {
      if (Date.now() > deadline) {
        throw new Error(
          `video task ${task.taskId} timed out after ${env.BYTEPLUS_POLL_TIMEOUT_MS}ms`,
        );
      }
      await sleep(env.BYTEPLUS_POLL_INTERVAL_MS);
      logRun(
        ctx.runId,
        `video still processing … ${Math.round((Date.now() - startedAt) / 1000)}s elapsed`,
      );
      result = await ctx.video.pollVideo(task);
    }
    if (result.state === "failed" || !result.videoUrl) {
      throw new Error(result.error ?? "video generation failed");
    }

    // 4. Download the mp4. Pass any auth headers the provider supplied
    // (Seedance's video_url is directly fetchable, so this is usually empty).
    const res = await fetch(result.videoUrl, {
      headers: result.downloadHeaders,
    });
    if (!res.ok) {
      throw new Error(`failed to download video: ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hasAudio = result.hasAudio ?? true;

    // 5. Persist: Storage → assets (final_video) → videos row, in one tx.
    const persisted = await persistSheet<Video>({
      runId: ctx.runId,
      kind: "final_video",
      bytes,
      mime: "video/mp4",
      artifactInsert: async (tx, assetId) => {
        const [row] = await tx
          .insert(schema.videos)
          .values({
            runId: ctx.runId,
            assetId,
            durationSec: String(durationSec),
            hasAudio,
            providerMeta: {
              provider: "byteplus",
              model: env.BYTEPLUS_VIDEO_MODEL,
              taskId: task.taskId,
              videoPrompt,
            },
            status: "completed",
          })
          .returning();
        return row;
      },
    });

    await writeStepEvent({
      runId: ctx.runId,
      step: "video",
      status: "passed",
      payload: { taskId: task.taskId, durationSec, hasAudio },
    });

    return {
      assetId: persisted.assetId,
      assetUrl: persisted.assetUrl,
      artifact: persisted.artifact,
      promptUsed: JSON.stringify({ messages, videoPrompt }),
    };
  } catch (err) {
    await writeStepEvent({
      runId: ctx.runId,
      step: "video",
      status: "failed",
      payload: { error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

/** Video Generation Agent — the F6 skill as one barrel. */
export const videoAgent = {
  videoBuilder,
};
