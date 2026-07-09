// Worker-side failure type + classifier — the counterpart to the HTTP-only
// `ApiError` in ./errors.ts. A `RunFailure` carries the machine `code` that
// lands in `runs.error_code`, the friendly `userMessage` that lands in
// `runs.error` (and the studio UI banner), and the raw provider/ffmpeg text as
// `detail` — which must only ever reach server logs and step_event payloads,
// never the run row.
//
// Throw-sites that know their cause throw `RunFailure` directly (BytePlus
// assets, video agent, merge agent). Everything else is funneled through
// `classifyRunError` in `failRun`, which pattern-matches known provider error
// signatures so even un-retrofitted paths fail with a readable sentence.

import type { RunErrorCode } from "@ugc/shared";

export class RunFailure extends Error {
  readonly code: RunErrorCode;
  /** Friendly, actionable sentence — what `runs.error` (and the UI) gets. */
  readonly userMessage: string;
  /** Raw provider/ffmpeg text — server logs + step_event payloads ONLY. */
  readonly detail?: string;

  constructor(
    code: RunErrorCode,
    userMessage: string,
    detail?: string,
    opts?: { cause?: unknown },
  ) {
    // super(userMessage) so any code that logs/stores err.message stays friendly.
    super(userMessage, opts);
    this.name = "RunFailure";
    this.code = code;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

export const RUN_ERROR_MESSAGES: Record<RunErrorCode, string> = {
  PERSON_IMAGE_INVALID:
    "One of the reference images has a shape the video service can't use. If you uploaded a person photo, try one closer to a standard portrait or square format.",
  PROVIDER_CONTENT_BLOCKED:
    "Part of this generation was blocked by the provider's safety filters. Try a different photo or adjust your prompt.",
  PROVIDER_AUDIO_BLOCKED:
    "The generated voiceover was flagged by the provider's audio safety filter. Regenerate to try again.",
  PROVIDER_RATE_LIMITED:
    "The generation service is busy right now. Please try again in a few minutes.",
  VIDEO_MERGE_FAILED:
    "We couldn't assemble the final video from its segments. Please try the run again.",
  VIDEO_GENERATION_FAILED: "Video generation failed. Please try the run again.",
  VIDEO_GENERATION_TIMEOUT:
    "Video generation took too long and timed out. Please try the run again.",
  VIDEO_GENERATION_EXPIRED:
    "The video provider expired this job before it finished. Please try the run again.",
  IMAGE_GENERATION_FAILED:
    "We couldn't generate the reference images. Please try the run again.",
  RUN_CANCELLED: "Run cancelled.",
  INTERNAL: "Something went wrong while generating your ad. Please try again.",
};

// Ordered, first match wins. Content-block / rate-limit MUST precede the
// provider-generic rows: a BytePlus moderation rejection message contains
// both "BytePlus" and "moderation".
const CLASSIFIERS: Array<{ pattern: RegExp; code: RunErrorCode }> = [
  {
    pattern: /aspectratiotoo(small|large)|aspect ratio must be between/i,
    code: "PERSON_IMAGE_INVALID",
  },
  // Output-AUDIO moderation, BEFORE the generic content-block row (first match
  // wins): the video ladder retries this specific code with brand-safe speech.
  // The generic row below would otherwise swallow it via "sensitive information".
  {
    pattern:
      /output\s*audio.*(sensitive|moderation|blocked)|audio may contain sensitive/i,
    code: "PROVIDER_AUDIO_BLOCKED",
  },
  {
    pattern:
      /sensitivecontentdetected|moderation\b|content.?policy|safety system|flagged|sensitive information|output video may contain/i,
    code: "PROVIDER_CONTENT_BLOCKED",
  },
  {
    pattern: /rate.?limit|too many requests|\b429\b|quota/i,
    code: "PROVIDER_RATE_LIMITED",
  },
  { pattern: /ffmpeg|merge/i, code: "VIDEO_MERGE_FAILED" },
  // Specific video-task outcomes BEFORE the generic byteplus/video row below —
  // both their messages contain "video task"/"byteplus", so order decides.
  { pattern: /timed out after/i, code: "VIDEO_GENERATION_TIMEOUT" },
  {
    pattern: /\btask\b.*\bexpired\b|status[= ]expired|\bexpired\b/i,
    code: "VIDEO_GENERATION_EXPIRED",
  },
  {
    pattern: /byteplus|seedance|video task|video generation/i,
    code: "VIDEO_GENERATION_FAILED",
  },
  {
    pattern: /openai image|image generation|images\.(edit|generate)/i,
    code: "IMAGE_GENERATION_FAILED",
  },
];

/**
 * Turn ANY error into a `RunFailure`. `RunFailure` instances pass through
 * untouched; everything else is matched against known provider signatures,
 * falling back to `defaultCode` (or INTERNAL) with a generic friendly message.
 * The original raw message is preserved as `detail`.
 */
export function classifyRunError(
  err: unknown,
  defaultCode: RunErrorCode = "INTERNAL",
): RunFailure {
  if (err instanceof RunFailure) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const code = CLASSIFIERS.find((c) => c.pattern.test(raw))?.code ?? defaultCode;
  return new RunFailure(code, RUN_ERROR_MESSAGES[code], raw, { cause: err });
}

/** Bound raw detail before persisting it in a step_event payload. */
export function truncateDetail(s: string, max = 1500): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Strip URL-looking substrings from provider/error text before it reaches logs
 * or a step_event `detail`. A 4xx body that echoes the request can carry a
 * signed asset URL (Supabase) or a token-bearing content URL; those must not
 * leak into logs/DB. Status words ("expired", "moderation") are untouched, so
 * `classifyRunError` still keys correctly.
 */
export function redactUrls(s: string): string {
  return s.replace(/https?:\/\/[^\s"'<>)]+/gi, "[redacted-url]");
}
