// OpenRouter provider adapter — Kling 3.0 Standard video (kwaivgi/kling-v3.0-std).
//
// Adapter boundary: the Video Builder skill depends on the shared VideoProvider
// interface only, never on this REST shape, so the provider is swappable.
// Kling runs async: POST a generation job → poll the returned polling_url →
// download the unsigned content URL (which itself needs the auth header).
//
// Image-to-video: the storyboard sheet is sent as `frame_images[0]` with
// `frame_type: "first_frame"`; optional person/product reference sheets go in
// `input_references` as style guidance. Kling 3.0 has no real-person face
// restriction, so the references can be fully photorealistic, and it emits
// native synchronized audio (`generate_audio: true`).

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

/** Back-compat alias — the OpenRouter adapter is one implementation of VideoProvider. */
export type OpenRouterProvider = VideoProvider;

const DEFAULT_DURATION_SEC = 15;
const DEFAULT_RESOLUTION = "1080p";
const DEFAULT_ASPECT_RATIO = "16:9";

/** Map OpenRouter/Kling job status → our coarse VideoTaskState. */
function mapState(status: string): VideoTaskState {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "failed";
  }
  return "processing"; // pending | in_progress
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` };
}

async function openRouterFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenRouter ${url} failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

export function createOpenRouterProvider(): VideoProvider {
  return {
    async submitVideo(input: SubmitVideoInput): Promise<VideoTask> {
      const references = input.referenceImages ?? [];
      const body: Record<string, unknown> = {
        model: env.OPENROUTER_VIDEO_MODEL,
        prompt: input.prompt,
        duration: input.durationSec ?? DEFAULT_DURATION_SEC,
        resolution: DEFAULT_RESOLUTION,
        aspect_ratio: DEFAULT_ASPECT_RATIO,
        frame_images: [
          {
            type: "image_url",
            image_url: { url: input.storyboardSheet },
            frame_type: "first_frame", // image-to-video keyframe
          },
        ],
        generate_audio: true,
      };
      if (references.length > 0) {
        // Person + product reference sheets as style guidance (no face limit).
        body.input_references = references.map((url) => ({
          type: "image_url",
          image_url: { url },
        }));
      }

      const json = (await openRouterFetch(
        `${env.OPENROUTER_BASE_URL}/videos`,
        { method: "POST", body: JSON.stringify(body) },
      )) as { id?: string; polling_url?: string };

      if (!json.id) {
        throw new Error(
          `OpenRouter submit returned no job id: ${JSON.stringify(json)}`,
        );
      }
      return {
        taskId: json.id,
        pollUrl: json.polling_url ?? `${env.OPENROUTER_BASE_URL}/videos/${json.id}`,
      };
    },

    async pollVideo(task: VideoTask): Promise<VideoTaskResult> {
      const url = task.pollUrl ?? `${env.OPENROUTER_BASE_URL}/videos/${task.taskId}`;
      const json = (await openRouterFetch(url)) as {
        status?: string;
        error?: { message?: string } | string;
        unsigned_urls?: string[];
      };

      const state = mapState(json.status ?? "in_progress");
      if (state === "completed") {
        const videoUrl = json.unsigned_urls?.[0];
        if (!videoUrl) {
          return {
            state: "failed",
            error: "OpenRouter completed but no unsigned_urls",
          };
        }
        // The content URL is unsigned — the download needs the same auth header.
        return { state, videoUrl, hasAudio: true, downloadHeaders: authHeaders() };
      }
      if (state === "failed") {
        const error =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? `OpenRouter job ${json.status}`);
        return { state, error };
      }
      return { state };
    },
  };
}
