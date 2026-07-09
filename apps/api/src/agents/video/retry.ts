// Pure decision helpers for the video regenerate-on-failure ladder. Kept free of
// I/O so they can be unit-tested offline (agents/video/__tests__/retry.test.ts).
//
// The ladder lives in videoBuilder: it re-submits a failed clip up to
// MAX_VIDEO_ATTEMPTS times, escalating the prompt tier, before it lets the
// failure propagate. failRun then reads the DISPOSITION of the final failure to
// decide whether the run parks at the recoverable `awaiting_regen` gate or dies
// at `failed`.

import type { RunErrorCode, Step } from "@ugc/shared";

/** Total in-clip submit attempts before the failure propagates. */
export const MAX_VIDEO_ATTEMPTS = 3;

/**
 * How a video failure should be handled:
 *  - `retry`     — a transient provider failure (network / 5xx / timeout /
 *                  expired / rate-limit); the ladder re-submits.
 *  - `soft_fail` — recoverable but NOT auto-retryable here (a content-safety
 *                  block needs different inputs); park at `awaiting_regen` so the
 *                  user can regenerate/tweak. Also the resting disposition once a
 *                  transient failure has exhausted the ladder.
 *  - `hard_fail` — unrecoverable (bad input image, merge/image-gen failure,
 *                  internal, or any non-video step); the run dies at `failed`.
 */
export type VideoFailureDisposition = "retry" | "soft_fail" | "hard_fail";

/** Transient video codes the ladder re-submits on. */
const TRANSIENT_VIDEO_CODES: ReadonlySet<RunErrorCode> = new Set([
  "VIDEO_GENERATION_FAILED",
  "VIDEO_GENERATION_TIMEOUT",
  "VIDEO_GENERATION_EXPIRED",
  "PROVIDER_RATE_LIMITED",
]);

/**
 * Recoverable-but-not-auto-retryable video codes → park at `awaiting_regen`.
 * `PROVIDER_AUDIO_BLOCKED` is here as the ESCAPE-HATCH disposition only: the
 * video ladder itself intercepts it first and re-tries once with neutralized,
 * brand-safe speech (`audioMode: "safe"` in agents/video/index.ts). If that
 * retry ALSO blocks, it falls through to this disposition and parks for a
 * manual regenerate — audio is never silently dropped.
 */
const SOFT_FAIL_VIDEO_CODES: ReadonlySet<RunErrorCode> = new Set([
  "PROVIDER_CONTENT_BLOCKED",
  "PROVIDER_AUDIO_BLOCKED",
  "PERSON_IMAGE_INVALID",
]);

/** The steps whose failures can land at the `awaiting_regen` clip-regen gate. */
const VIDEO_STEPS: ReadonlySet<Step> = new Set<Step>(["video", "segment_video"]);

/**
 * Classify a failure for the ladder + failRun. Only `video`/`segment_video`
 * failures can be soft — every other step (and every non-video code) is a hard
 * fail, matching today's behavior.
 */
export function videoFailureDisposition(
  code: RunErrorCode,
  step: Step | null,
): VideoFailureDisposition {
  if (!step || !VIDEO_STEPS.has(step)) return "hard_fail";
  if (TRANSIENT_VIDEO_CODES.has(code)) return "retry";
  if (SOFT_FAIL_VIDEO_CODES.has(code)) return "soft_fail";
  return "hard_fail";
}

/**
 * Once the failure propagates out of the ladder, whether the run parks
 * recoverably. A transient code that exhausted its retries becomes `soft_fail`
 * (the user can retry later); a genuine soft_fail code parks too; hard fails die.
 */
export function dispositionAfterLadder(
  code: RunErrorCode,
  step: Step | null,
): "soft_fail" | "hard_fail" {
  const d = videoFailureDisposition(code, step);
  return d === "hard_fail" ? "hard_fail" : "soft_fail";
}

/**
 * Prompt tier for a 1-indexed attempt. The first attempts use the richer LLM
 * prompt; the final attempt falls back to the simpler deterministic prompt
 * (fewer beats, camerafixed) which is more likely to clear a flaky provider.
 */
export function promptTierForAttempt(attempt: number): "llm" | "deterministic" {
  return attempt >= MAX_VIDEO_ATTEMPTS ? "deterministic" : "llm";
}
