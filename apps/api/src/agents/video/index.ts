import type { SkillContext, SkillResult } from "../types.js";
import type { ImageRef } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { parseJsonObject } from "../json.js";
import { persistSheet } from "../persist.js";
import { writeStepEvent } from "../critic/events.js";
import { createLogger } from "../../lib/log.js";
import { buildDeterministicVideoPrompt, buildVideoPrompt } from "./prompt.js";

export interface VideoBuilderInput {
  /**
   * The LABELLED storyboard sheet — four numbered keyframe panels (01–04), each
   * with a caption. It IS sent to the video provider as the sole guidance image
   * and ordered shot sequence — the product/person reference sheets are NOT
   * sent; identity + shot order reach the model through these numbered keyframes
   * plus the `scenes` text and `transcript`s. The badges/captions are direction
   * only and must not be rendered into the final clip (enforced via the prompt).
   */
  storyboardSheetRef: ImageRef;
  /**
   * Whether the ad features a person. When true the storyboard is routed
   * through the face-asset path so Seedance's real-human face filter accepts it.
   */
  hasPerson: boolean;
  /**
   * The person's IDENTITY image — the uploaded person photo (or the generated
   * person sheet when nothing was uploaded). When present it is registered as
   * the PRIMARY face reference so Seedance locks the on-screen person to this
   * exact face; the storyboard is then a secondary layout/shot-order reference.
   * Without it, identity comes only from the storyboard (which may have drifted).
   */
  personFaceRef?: ImageRef;
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
 * injected video provider) together with the LABELLED storyboard sheet as the
 * sole guidance image. The sheet's four numbered panels (01–04) are the ordered
 * shot sequence — the model follows them in order while rendering ONE clean
 * continuous clip; the badges/captions are direction only and (per the prompt)
 * must not appear in the output. The product/person reference sheets are NOT
 * sent. Poll until ready, download, and persist `assets` (final_video) +
 * `videos`. Final output of the pipeline; no merge step.
 */
export async function videoBuilder(
  ctx: SkillContext,
  input: VideoBuilderInput,
): Promise<SkillResult<Video>> {
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;
  const log = createLogger("video", { run: ctx.runId });
  log.info("▶ building video", {
    durationSec,
    hasPerson: input.hasPerson,
    scenes: input.scenes.length,
  });

  await writeStepEvent({ runId: ctx.runId, step: "video", status: "started" });

  try {
    // 1. Compose the cinematic motion/audio prompt from the scenes + transcripts.
    // Try the LLM up to twice; if it returns empty/unparseable JSON, fall back to
    // a deterministic prompt built straight from the scenes so the video step
    // NEVER fails on a prompt/parse hiccup.
    const messages = buildVideoPrompt({
      adStyle: ctx.adStyle,
      adType: ctx.adType,
      userPrompt: input.userPrompt,
      scenes: input.scenes,
      durationSec,
      critique: input.critique,
    });
    let videoPrompt = "";
    for (let attempt = 1; attempt <= 2 && !videoPrompt.trim(); attempt++) {
      try {
        const planRaw = await ctx.openai.chat(messages);
        videoPrompt =
          parseJsonObject<{ videoPrompt?: string }>(
            planRaw,
          ).videoPrompt?.trim() ?? "";
      } catch (err) {
        log.warn("video prompt unparseable", {
          attempt,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!videoPrompt) {
      videoPrompt = buildDeterministicVideoPrompt({
        adStyle: ctx.adStyle,
        adType: ctx.adType,
        scenes: input.scenes,
        durationSec,
      });
      log.warn("video prompt: LLM failed twice — using deterministic fallback");
    }

    // 2. Submit to the video provider. The LABELLED storyboard sheet is the sole
    // guidance image and ordered shot guide (no product/person sheets); the
    // detailed scene descriptions + transcripts ride in the text prompt. The
    // prompt tells the model to follow panels 01→04 in order yet keep the
    // badges/captions/grid out of the rendered frame. When the ad has a person,
    // route the storyboard through the face-asset path so Seedance's face filter
    // accepts it.
    const prompt = `@Image 1 is the attached LABELLED storyboard sheet — a 2×2 grid of four numbered keyframe panels (badge 01 top-left, 02 top-right, 03 bottom-left, 04 bottom-right), each with a bottom caption. It is the authoritative reference for product/person identity, framing and the ORDERED shot sequence: panel 01 drives the first beat, 02 the second, 03 the third, 04 the fourth — follow the panels in number order. Render the FINAL VIDEO as ONE continuous, fully photorealistic live-action shot — real, lifelike humans with natural skin, realistic faces, real hair and true-to-life lighting, as if filmed with a real camera. Use @Image 1 (the keyframes) for identity, framing and shot order, but DO NOT render it as panels, a grid or a storyboard. This is a finished commercial ad: the grid lines, borders, split-screen panels, number badges, caption bars, caption text, labels, hand-drawn arrows, callouts, subtitles or watermark text from the sheet must NOT appear anywhere in the frame — they are direction only.\n\n${videoPrompt}`;
    const storyboardUrl = input.storyboardSheetRef.source;
    // When the ad has a person, send the person's IDENTITY image FIRST as the
    // primary face reference (so the rendered person matches it exactly), then
    // the storyboard for layout + shot order — both via the face-asset path so
    // Seedance's real-human filter accepts them. Falls back to just the
    // storyboard when no identity image is available (keeps prior behaviour).
    const personReferences = input.hasPerson
      ? [input.personFaceRef?.source, storyboardUrl].filter((u): u is string =>
          Boolean(u),
        )
      : [];
    const task = await ctx.video.submitVideo({
      referenceImages: input.hasPerson ? [] : [storyboardUrl],
      personReferences,
      referenceTag: ctx.runId,
      prompt,
      durationSec,
    });

    // 3. Poll until completed / failed / timeout.
    const startedAt = Date.now();
    const deadline = startedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
    log.info("task submitted — polling BytePlus", { taskId: task.taskId });
    let result = await ctx.video.pollVideo(task);
    while (result.state === "processing") {
      if (Date.now() > deadline) {
        throw new Error(
          `video task ${task.taskId} timed out after ${env.BYTEPLUS_POLL_TIMEOUT_MS}ms`,
        );
      }
      await sleep(env.BYTEPLUS_POLL_INTERVAL_MS);
      log.debug("still processing", {
        taskId: task.taskId,
        elapsedSec: Math.round((Date.now() - startedAt) / 1000),
      });
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
    log.info("✓ video persisted", {
      assetId: persisted.assetId,
      durationSec,
      hasAudio,
    });

    return {
      assetId: persisted.assetId,
      assetUrl: persisted.assetUrl,
      artifact: persisted.artifact,
      promptUsed: JSON.stringify({ messages, videoPrompt }),
    };
  } catch (err) {
    log.error("✗ video failed", {
      err: err instanceof Error ? err.message : String(err),
    });
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
