// BytePlus provider adapter — Seedance 2.0 video.
//
// Adapter boundary: the Video Builder skill depends on the shared VideoProvider
// interface only, never on this REST shape, so the provider is swappable.
// Seedance runs async: POST a generation task → poll the task id → video_url.
// Native audio is requested via `generate_audio: true` (Seedance 2.0 feature).
//
// Generation is driven by the text prompt + the clean storyboard keyframe sheet
// passed as a guidance image — via `referenceImages` (no person) or
// `personReferences` (with a person, so it clears Seedance's face filter). The
// caller sends a storyboard with no baked-in text/numbers/arrows, so nothing
// bleeds into the clip.

import { env } from "../../config/index.js";
import { createLogger } from "../../lib/log.js";
import { ensureFaceAsset, isAssetMgmtConfigured } from "./assets.js";
import type {
  SubmitVideoInput,
  VideoProvider,
  VideoTask,
  VideoTaskResult,
  VideoTaskState,
} from "../video.js";

const log = createLogger("byteplus");

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
const DEFAULT_RATIO = "16:9";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; role?: string; image_url: { url: string } };

const imagePart = (url: string, role = "reference_image"): ContentPart => ({
  type: "image_url",
  role,
  image_url: { url },
});

/** Map BytePlus task status → our coarse VideoTaskState. */
function mapState(status: string): VideoTaskState {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "failed";
  }
  return "processing"; // queued | running
}

async function bytePlusFetch(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${env.BYTEPLUS_BASE_URL}/api/v3${path}`;
  const headers = {
    Authorization: `Bearer ${env.BYTEPLUS_API_KEY}`,
    "Content-Type": "application/json",
    ...init?.headers,
  };

  // Retry transient network failures (the bare "fetch failed" / connection
  // reset / timeout that undici throws) a few times before giving up — a single
  // blip on the submit or a poll shouldn't kill a whole video run. A thrown
  // fetch never reached the server, so retrying is safe.
  let res: Response | undefined;
  let lastDetail = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { ...init, headers });
      break;
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } })
        .cause;
      lastDetail = cause?.code ?? cause?.message ?? (err as Error).message;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  if (!res) {
    throw new Error(`BytePlus ${path} request failed: ${lastDetail}`);
  }

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
      // content[] = text prompt, then (optional) clean first frame, then any
      // plain image refs, then the registered face asset(s). Callers pass the
      // clean storyboard sheet here (as a plain ref or a face asset).
      const content: ContentPart[] = [{ type: "text", text: input.prompt }];
      if (input.firstFrame) {
        content.push(imagePart(input.firstFrame, "first_frame"));
      }
      // Non-face refs — passed as plain image URLs.
      for (const url of input.referenceImages ?? []) {
        content.push(imagePart(url));
      }
      // Face/person refs — register as BytePlus assets so Seedance's real-human
      // face filter accepts them, then reference via asset://<id>. When AK/SK
      // are absent, fall back to the raw URL (likely rejected by the filter).
      const personRefs = input.personReferences ?? [];
      if (personRefs.length > 0) {
        if (isAssetMgmtConfigured()) {
          const tag = input.referenceTag ?? "run";
          let i = 0;
          for (const url of personRefs) {
            const assetId = await ensureFaceAsset(url, `${tag}-person-${i++}`);
            content.push(imagePart(`asset://${assetId}`));
          }
        } else {
          log.warn(
            "AK/SK not set — sending face refs as raw image_url; Seedance's face filter may reject them. See docs/byteplus-face-assets.md",
            { run: input.referenceTag },
          );
          for (const url of personRefs) content.push(imagePart(url));
        }
      }

      const body = {
        model: env.BYTEPLUS_VIDEO_MODEL,
        content,
        duration: input.durationSec ?? DEFAULT_DURATION_SEC,
        resolution: DEFAULT_RESOLUTION,
        ratio: DEFAULT_RATIO, // Seedance 2.0 key (16:9 widescreen)
        generate_audio: true, // native synchronized audio
        watermark: false,
      };

      log.info("submit task", {
        run: input.referenceTag,
        model: env.BYTEPLUS_VIDEO_MODEL,
        refs: input.referenceImages?.length ?? 0,
        personRefs: personRefs.length,
        durationSec: body.duration,
      });
      const json = (await bytePlusFetch("/contents/generations/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { id?: string };

      if (!json.id) {
        throw new Error(
          `BytePlus submit returned no task id: ${JSON.stringify(json)}`,
        );
      }
      log.info("task created", { run: input.referenceTag, taskId: json.id });
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
      log.debug("poll", { taskId: task.taskId, status: json.status, state });
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
