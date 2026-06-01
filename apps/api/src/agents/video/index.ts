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
   * The clean storyboard sheet (no baked-in text/numbers/arrows). It IS sent to
   * the video provider as the sole guidance image — the product/person
   * reference sheets are NOT sent; identity reaches the model through these
   * keyframes plus the `scenes` text and `transcript`s.
   */
  storyboardSheetRef: ImageRef;
  /**
   * Whether the ad features a person. When true the storyboard is routed
   * through the face-asset path so Seedance's real-human face filter accepts it.
   */
  hasPerson: boolean;
  /** Scene metadata (incl. transcripts) from the storyboard_sheets row. */
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
 * Video Builder skill — compose an LLM motion/audio prompt from the storyboard
 * scenes + transcripts (text plan) and send it to Seedance 2.0 (via the
 * injected video provider) together with the CLEAN storyboard sheet as the sole
 * guidance image. The storyboard now carries no baked-in text/numbers/arrows,
 * so it is safe to send and grounds the model's framing; the product/person
 * reference sheets are NOT sent. Poll until ready, download, and persist
 * `assets` (final_video) + `videos`. Final output of the pipeline; no merge step.
 */
export async function videoBuilder(
  ctx: SkillContext,
  input: VideoBuilderInput,
): Promise<SkillResult<Video>> {
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;

  await writeStepEvent({ runId: ctx.runId, step: "video", status: "started" });

  try {
    // 1. Compose the cinematic motion/audio prompt from the scenes + transcripts.
    const messages = buildVideoPrompt({
      adStyle: ctx.adStyle,
      adType: ctx.adType,
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

    // 2. Submit to the video provider. The CLEAN storyboard sheet is the sole
    // guidance image (no product/person sheets); the scenes + transcripts ride
    // in the text prompt. When the ad has a person, route the storyboard
    // through the face-asset path so Seedance's face filter accepts it.
    const prompt = `Render the FINAL VIDEO as ONE continuous, fully photorealistic live-action shot — real, lifelike humans with natural skin, realistic faces, real hair and true-to-life lighting, as if filmed with a real camera. The attached storyboard image is a set of keyframes to follow for framing and action; treat it as direction, NOT as something to reproduce on screen. This is a finished commercial ad, NOT a storyboard: do NOT render any panel numbers, labels, hand-drawn arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text — none of these may appear anywhere in the frame. ${videoPrompt}`;
    const storyboardUrl = input.storyboardSheetRef.source;
    const task = await ctx.video.submitVideo({
      referenceImages: input.hasPerson ? [] : [storyboardUrl],
      personReferences: input.hasPerson ? [storyboardUrl] : [],
      referenceTag: ctx.runId,
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
    // Retry transient network blips so a flaky download doesn't waste the
    // already-generated (paid) clip.
    let res: Response | undefined;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(result.videoUrl, { headers: result.downloadHeaders });
        break;
      } catch (err) {
        const cause = (err as { cause?: { code?: string; message?: string } })
          .cause;
        lastErr = cause?.code ?? cause?.message ?? (err as Error).message;
        if (attempt < 3) await sleep(800 * attempt);
      }
    }
    if (!res) throw new Error(`failed to download video: ${lastErr}`);
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
