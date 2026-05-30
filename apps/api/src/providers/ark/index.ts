// Ark provider adapter — Volcengine / BytePlus ModelArk, Seedance 2.0 video.
//
// Adapter boundary: the Video Builder skill depends on the shared VideoProvider
// interface only, never on this REST shape, so the provider is swappable.
// Seedance runs async: POST a generation task → poll the task id → video_url.
// Native audio is requested via `generate_audio: true` (Seedance 2.0 feature).

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

/** Back-compat alias — the Ark adapter is one implementation of VideoProvider. */
export type ArkProvider = VideoProvider;

const DEFAULT_DURATION_SEC = 15;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_RATIO = "16:9";

/** Map Ark task status → our coarse VideoTaskState. */
function mapState(status: string): VideoTaskState {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "failed";
  }
  return "processing"; // queued | running
}

async function arkFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${env.ARK_BASE_URL}/api/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.ARK_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ark ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

export function createArkProvider(): VideoProvider {
  return {
    async submitVideo(input: SubmitVideoInput): Promise<VideoTask> {
      const body = {
        model: env.ARK_VIDEO_MODEL,
        content: [
          { type: "text", text: input.prompt },
          { type: "image_url", image_url: { url: input.storyboardSheet } },
        ],
        duration: input.durationSec ?? DEFAULT_DURATION_SEC,
        resolution: DEFAULT_RESOLUTION,
        ratio: DEFAULT_RATIO,
        generate_audio: true, // native synchronized audio
      };

      const json = (await arkFetch("/contents/generations/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { id?: string };

      if (!json.id) {
        throw new Error(`Ark submit returned no task id: ${JSON.stringify(json)}`);
      }
      return { taskId: json.id };
    },

    async pollVideo(task: VideoTask): Promise<VideoTaskResult> {
      const json = (await arkFetch(
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
          return { state: "failed", error: "Ark succeeded but no video_url" };
        }
        return { state, videoUrl, hasAudio: true };
      }
      if (state === "failed") {
        const error =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? `Ark task ${json.status}`);
        return { state, error };
      }
      return { state };
    },
  };
}
