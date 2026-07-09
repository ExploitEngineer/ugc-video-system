// BytePlus provider adapter — Seedance 2.0 video.
//
// Adapter boundary: the Video Builder skill depends on the shared VideoProvider
// interface only, never on this REST shape, so the provider is swappable.
// Seedance runs async: POST a generation task → poll the task id → video_url.
// Native audio is requested via `generate_audio: true` (Seedance 2.0 feature).
//
// Generation is driven by the text prompt + the labelled storyboard keyframe
// sheet passed as a guidance image — via `referenceImages` (no person) or
// `personReferences` (with a person, so it clears Seedance's face filter). The
// sheet carries per-panel number badges + captions that guide the ordered shot
// sequence; the caller's prompt instructs Seedance to keep those badges/captions
// out of the rendered frame.

import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { redactUrls } from "../../lib/run-failure.js";
import { ensureFaceAsset, isAssetMgmtConfigured } from "./assets.js";
import type {
  SubmitVideoInput,
  VideoProvider,
  VideoTask,
  VideoTaskResult,
  VideoTaskState,
} from "../video.js";
import { snapSeedanceDuration } from "../video.js";

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
// Code fallback only — the real default comes from env.BYTEPLUS_VIDEO_RESOLUTION
// (1080p). 720p here just guards against an empty/unset value at runtime.
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

/** BytePlus statuses that mean "still working — keep polling". */
const PROCESSING_STATUSES = new Set([
  "queued",
  "running",
  "pending",
  "in_progress",
]);

/** Map BytePlus task status → our coarse VideoTaskState. An unmapped status is
 *  treated as a FAILURE (surfaced with the raw status) rather than silently
 *  polled until the 30-min timeout. */
function mapState(status: string): VideoTaskState {
  if (status === "succeeded") return "completed";
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return "failed";
  }
  if (PROCESSING_STATUSES.has(status)) return "processing";
  log.warn("unmapped BytePlus task status — treating as failed", { status });
  return "failed";
}

async function bytePlusFetch(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${env.BYTEPLUS_BASE_URL}/api/v3${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = {
    Authorization: `Bearer ${env.BYTEPLUS_API_KEY}`,
    "Content-Type": "application/json",
    ...init?.headers,
  };

  // fetchWithRetry gives us a per-attempt timeout (a stalled poll/submit must
  // never hang the worker) + capped backoff. Only the idempotent poll (GET)
  // retries a thrown network error; the submit POST does NOT — a drop AFTER the
  // request reached BytePlus would create a duplicate, paid generation task.
  const res = await fetchWithRetry(
    url,
    { ...init, headers },
    { label: `byteplus ${path}`, retryOnNetworkError: method === "GET" },
  );

  const text = await res.text();
  if (!res.ok) {
    // Redact any echoed signed URLs/tokens before this reaches logs/step_events.
    throw new Error(
      `BytePlus ${path} failed: ${res.status} ${redactUrls(text).slice(0, 500)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

export function createBytePlusProvider(): VideoProvider {
  return {
    async submitVideo(input: SubmitVideoInput): Promise<VideoTask> {
      // content[] = text prompt, then (optional) clean first frame, then any
      // plain image refs, then the registered face asset(s). Callers pass the
      // labelled storyboard sheet here (as a plain ref or a face asset).
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

      const resolution = env.BYTEPLUS_VIDEO_RESOLUTION || DEFAULT_RESOLUTION;
      // Seed precedence: the eval env override wins (reproducible iteration);
      // otherwise the caller's per-run seed (multi-segment continuity); else
      // unset → BytePlus picks at random for per-run variety.
      const seed = env.BYTEPLUS_VIDEO_SEED ?? input.seed;
      // Seedance accepts a DISCRETE duration set. Snap here, at the boundary, so
      // an out-of-set value can never reach ModelArk and fail a run that has
      // already paid for its reference sheets and storyboard. Template runs ask
      // for their composition's own length, which is exactly where a 7 or a 9
      // would otherwise slip through.
      const requested = input.durationSec ?? DEFAULT_DURATION_SEC;
      const duration = snapSeedanceDuration(requested);
      if (duration !== requested) {
        log.warn("duration snapped to a supported Seedance value", {
          run: input.referenceTag,
          requested,
          duration,
        });
      }
      const body = {
        model: env.BYTEPLUS_VIDEO_MODEL,
        content,
        duration,
        resolution,
        ratio: input.aspectRatio ?? DEFAULT_RATIO, // Seedance 2.0 key (16:9 | 9:16)
        generate_audio: true, // native synchronized audio
        watermark: false,
        ...(seed != null ? { seed } : {}),
      };

      log.info("submit task", {
        run: input.referenceTag,
        model: env.BYTEPLUS_VIDEO_MODEL,
        refs: input.referenceImages?.length ?? 0,
        personRefs: personRefs.length,
        durationSec: body.duration,
        ratio: body.ratio,
        resolution: body.resolution,
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

      const status = json.status ?? "running";
      const state = mapState(status);
      log.debug("poll", { taskId: task.taskId, status, state });
      if (state === "completed") {
        const videoUrl = json.content?.video_url;
        if (!videoUrl) {
          return {
            state: "failed",
            status,
            error: `BytePlus task ${task.taskId} succeeded but returned no video_url`,
          };
        }
        return { state, status, videoUrl, hasAudio: true };
      }
      if (state === "failed") {
        // Lead with the taskId + raw status so the message itself says which
        // job and WHY (failed | cancelled | expired) — the classifier then keys
        // `expired` → VIDEO_GENERATION_EXPIRED, everything else generic.
        const providerMsg =
          typeof json.error === "string"
            ? json.error
            : (json.error?.message ?? "");
        const error = `BytePlus task ${task.taskId} ${status}${providerMsg ? `: ${providerMsg}` : ""}`;
        return { state, status, error };
      }
      return { state, status };
    },
  };
}
