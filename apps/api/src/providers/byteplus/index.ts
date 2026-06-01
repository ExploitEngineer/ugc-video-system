// BytePlus provider adapter — Seedance 2.0 video.
//
// Adapter boundary: the Video Builder skill depends on the shared VideoProvider
// interface only, never on this REST shape, so the provider is swappable.
// Seedance runs async: POST a generation task → poll the task id → video_url.
// Native audio is requested via `generate_audio: true` (Seedance 2.0 feature).
//
// Generation is driven by the text prompt + the clean product/person reference
// sheets (`referenceImages`). An optional clean first frame may also be passed;
// the annotated storyboard sheet is deliberately NOT sent as an image, so its
// panel numbers, arrows and captions never bleed into the clip.

import { env } from "../../config/index.js";
import type {
  SubmitVideoInput,
  VideoProvider,
  VideoTask,
  VideoTaskResult,
  VideoTaskState,
} from "../video.js";

export type {
  SubmitVideoInput,
  VideoProvider,
  VideoTask,
  VideoTaskResult,
  VideoTaskState,
} from "../video.js";

/** Back-compat alias — the BytePlus adapter is one implementation of VideoProvider. */
export type BytePlusProvider = VideoProvider;

const DEFAULT_DURATION_SEC = 15;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_ASPECT_RATIO = "16:9";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Map BytePlus task status → our coarse VideoTaskState. */
function mapState(status: string): VideoTaskState {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "failed";
  }
  return "processing"; // queued | running
}

async function bytePlusFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${env.BYTEPLUS_BASE_URL}/api/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.BYTEPLUS_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `BytePlus ${path} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

export function createBytePlusProvider(): VideoProvider {
  return {
    async submitVideo(input: SubmitVideoInput): Promise<VideoTask> {
      // content[] = text prompt, then (optional) clean first frame, then the
      // product/person reference sheets as image guidance. The annotated
      // storyboard sheet is intentionally never included.
      const content: ContentPart[] = [{ type: "text", text: input.prompt }];
      if (input.firstFrame) {
        content.push({ type: "image_url", image_url: { url: input.firstFrame } });
      }
      for (const url of input.referenceImages ?? []) {
        content.push({ type: "image_url", image_url: { url } });
      }

      const body = {
        model: env.BYTEPLUS_VIDEO_MODEL,
        content,
        duration: input.durationSec ?? DEFAULT_DURATION_SEC,
        resolution: DEFAULT_RESOLUTION,
        aspect_ratio: DEFAULT_ASPECT_RATIO, // Seedance 2.0 key (16:9 widescreen)
        generate_audio: true, // native synchronized audio
      };

      const json = (await bytePlusFetch("/contents/generations/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { id?: string };

      if (!json.id) {
        throw new Error(
          `BytePlus submit returned no task id: ${JSON.stringify(json)}`,
        );
      }
      return { taskId: json.id };
    },

    async pollVideo(task: VideoTask): Promise<VideoTaskResult> {
      const json = (await bytePlusFetch(
        `/contents/generations/tasks/${task.taskId}`,
      )) as {
        status?: string;
        error?: { message?: string } | string;
        content?: { video_url?: string };
      };

      const state = mapState(json.status ?? "running");
      if (state === "completed") {
        const videoUrl = json.content?.video_url;
        if (!videoUrl) {
          return { state: "failed", error: "BytePlus succeeded but no video_url" };
        }
        return { state, videoUrl, hasAudio: true };
      }
      if (state === "failed") {
        const error =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? `BytePlus task ${json.status}`);
        return { state, error };
      }
      return { state };
    },
  };
}
