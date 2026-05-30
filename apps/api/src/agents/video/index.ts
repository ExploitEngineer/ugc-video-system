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
  /** Approved storyboard sheet (public URL or data URI) — the visual reference. */
  storyboardSheetRef: ImageRef;
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
 * Video Builder skill — send the full storyboard sheet + an LLM-composed motion
 * /audio prompt to Seedance 2.0 (via the injected video provider), poll until
 * the clip is ready, download it, and persist `assets` (final_video) + `videos`.
 * Final output of the pipeline; no merge, native audio.
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

    // 2. Submit to the video provider (storyboard sheet = visual reference).
    const task = await ctx.video.submitVideo({
      storyboardSheet: input.storyboardSheetRef.source,
      prompt: videoPrompt,
      durationSec,
    });

    // 3. Poll until completed / failed / timeout.
    const startedAt = Date.now();
    const deadline = startedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
    logRun(ctx.runId, `video task ${task.taskId} submitted — polling BytePlus …`);
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

    // 4. Download the mp4.
    const res = await fetch(result.videoUrl);
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
