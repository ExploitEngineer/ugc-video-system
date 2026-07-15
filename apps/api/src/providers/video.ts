// Shared video-provider boundary — Seedance 2.0 via the BytePlus adapter.
//
// The Video Builder skill depends on this interface only, never on a concrete
// SDK/REST, so the provider is swappable. Seedance runs async: submit a task,
// then poll until the video is ready.

import type { AspectRatio } from "@ugc/shared";

import { isTransientNetworkError } from "../lib/http.js";
import type { Logger } from "../lib/log.js";

/**
 * The ONLY clip lengths Seedance 2.0 accepts. A discrete set, not a range: 7, 9,
 * 11, 13 and 14 are rejected outright by ModelArk.
 *
 * Lives on the provider boundary because it is a fact about the provider, not
 * about the template pipeline that happens to care most about it. `snapSeedanceDuration`
 * is applied at the boundary too, so an out-of-set request can never reach the
 * API and fail a run that has already paid for its storyboard.
 */
export const SEEDANCE_DURATIONS = [4, 5, 6, 8, 10, 12, 15] as const;

export const MIN_CLIP_SEC = SEEDANCE_DURATIONS[0]; // 4
export const MAX_CLIP_SEC = SEEDANCE_DURATIONS[SEEDANCE_DURATIONS.length - 1]; // 15

/** Floating-point slack, so 12.0000001s is not treated as longer than 12s. */
const EPSILON = 1e-6;

/**
 * The smallest Seedance duration >= `seconds`, clamped to the set's bounds.
 *
 * Snapping UP is deliberate. A clip SHORTER than the layer it fills ends on a
 * frozen frame (and its native audio cuts out early), while a LONGER one is
 * simply trimmed by After Effects. Given the choice, always overshoot.
 */
export function snapSeedanceDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= MIN_CLIP_SEC) return MIN_CLIP_SEC;
  const want = Math.ceil(seconds - EPSILON);
  return SEEDANCE_DURATIONS.find((d) => d >= want) ?? MAX_CLIP_SEC;
}

export interface SubmitVideoInput {
  /** Text prompt describing motion/ad style for the ~15s clip. */
  prompt: string;
  /**
   * Target duration in seconds. Snapped onto `SEEDANCE_DURATIONS` at the
   * provider boundary — the API rejects anything else.
   */
  durationSec?: number;
  /** Output aspect ratio (Seedance `ratio` key). Defaults to 16:9 when omitted. */
  aspectRatio?: AspectRatio;
  /**
   * Optional clean first-frame image (URL or data URI) for image-to-video.
   * Omit to drive generation purely from the reference sheets + prompt — this
   * is deliberately NOT the annotated storyboard sheet, whose panel numbers,
   * arrows and captions would otherwise be animated into the final clip.
   */
  firstFrame?: string;
  /** Non-face reference sheet URLs (e.g. product) sent as plain image guidance. */
  referenceImages?: string[];
  /**
   * Face/person reference URLs. These trip Seedance's real-human face filter
   * when sent raw, so the BytePlus adapter registers them as assets first and
   * references them as `asset://<id>` with role "reference_image". Falls back
   * to a raw image_url when asset-management creds are absent.
   */
  personReferences?: string[];
  /** Stable name prefix for idempotent asset reuse across regen/resume (runId). */
  referenceTag?: string;
  /**
   * Optional fixed generation seed. Passed for multi-segment (30/45/60s) runs —
   * a run-stable seed shared by every segment so the synthesized identity/voice
   * stay consistent across the merged clips. `env.BYTEPLUS_VIDEO_SEED` (eval)
   * still overrides this; omit for single 15s clips to keep per-run variety.
   */
  seed?: number;
}

export interface VideoTask {
  /** Provider job id. */
  taskId: string;
  /** Absolute URL to poll for this job (provider-supplied). */
  pollUrl?: string;
}

export type VideoTaskState = "processing" | "completed" | "failed";

export interface VideoTaskResult {
  state: VideoTaskState;
  /**
   * Raw provider status (`queued` | `running` | `succeeded` | `failed` |
   * `cancelled` | `expired`) behind the coarse `state`. Surfaced so the poll
   * loop can log exactly how far a task got (and which terminal status it hit)
   * when it times out or fails.
   */
  status?: string;
  /** Present when `state === "completed"`. */
  videoUrl?: string;
  hasAudio?: boolean;
  /** Headers required to GET `videoUrl` (e.g. auth for unsigned content URLs). */
  downloadHeaders?: Record<string, string>;
  error?: string;
}

export interface VideoProvider {
  /** Submit the storyboard sheet → returns a job to poll. */
  submitVideo(input: SubmitVideoInput): Promise<VideoTask>;
  /** Poll a previously submitted job. */
  pollVideo(task: VideoTask): Promise<VideoTaskResult>;
}

/**
 * Poll a task, tolerating a transient network/DNS blip.
 *
 * A generation runs for MINUTES on the provider; a flaky resolver (`EAI_AGAIN`) or
 * a dropped socket while POLLING must NOT discard a paid clip that is still being
 * rendered. The task is identified by its id, so on a transient network error this
 * returns a SYNTHETIC `processing` result — the caller's poll loop simply waits and
 * re-polls the SAME task until it completes, fails for real, or the loop's own
 * deadline fires. A non-network error (a real HTTP failure from the provider, e.g.
 * task-not-found/auth) is rethrown unchanged.
 *
 * Polling is idempotent, so re-issuing is always safe — no risk of a duplicate job.
 */
export async function pollVideoTolerant(
  video: VideoProvider,
  task: VideoTask,
  log: Logger,
): Promise<VideoTaskResult> {
  try {
    return await video.pollVideo(task);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    log.warn("video poll unreachable — task still running, will retry", {
      taskId: task.taskId,
      err:
        (err as { cause?: { code?: string } })?.cause?.code ??
        (err as Error).message,
    });
    // Synthetic "still processing" (status omitted → the loop keeps the last known
    // status). The loop's deadline bounds how long a total outage can stall it.
    return { state: "processing" };
  }
}
