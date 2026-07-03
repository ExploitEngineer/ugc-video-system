// OpenAI model ids + defaults, isolated here so they swap without touching
// provider or agent logic.

import type { AspectRatio } from "@ugc/shared";
import { env } from "../../config/index.js";

/**
 * gpt-4.1 — the OpenAI FALLBACK for reasoning/vision (used when
 * `OPENROUTER_API_KEY` is unset or a caller forces `backend:"openai"`).
 * Env-overridable via `OPENAI_CHAT_MODEL` (default `gpt-4.1`).
 */
export const OPENAI_CHAT_MODEL = env.OPENAI_CHAT_MODEL;

/**
 * OpenRouter — OpenAI-SDK-compatible chat endpoint. Now the DEFAULT route for
 * every reasoning/vision `chat()` call (Claude Sonnet 4.6); only image gen
 * (gpt-image-2) and the gpt-4.1 fallback bypass it.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Claude Sonnet 4.6 via OpenRouter — the default reasoning/vision model
 * (stronger label OCR + disciplined JSON). Env-overridable via
 * `OPENROUTER_CLAUDE_MODEL`; VERIFY the slug is live before deploy
 * (`GET https://openrouter.ai/api/v1/models`).
 */
export const OPENROUTER_CLAUDE_MODEL = env.OPENROUTER_CLAUDE_MODEL;

/** GPT Image 2. Generate + edit (reference-image) capable. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/**
 * Default output-token budget for `chat()`. The API's implicit default cap
 * truncated the long storyboard `imagePrompt` mid-string (→ JSON parse failure),
 * so every chat call gets a generous explicit ceiling; callers can override.
 */
export const DEFAULT_CHAT_MAX_TOKENS = 4096;

/**
 * Composite-sheet pixel size per output aspect ratio — 4K UHD. More pixels per
 * panel = real skin micro-texture survives instead of going waxy/plastic (the
 * per-panel pixel budget is the mechanical root of the "AI face" look). 4K was
 * previously reverted because 4K-PNG returned a ~12 MB base64 body that
 * intermittently truncated (Unterminated-JSON); switching the OUTPUT to WebP q100
 * (below) drops that to ~5 MB and makes 4K reliable. gpt-image-2 requires BOTH
 * dims divisible by 16 (3840/16=240, 2160/16=135) and total pixels ≤ 8,294,400 —
 * 3840×2160 sits exactly at the max. OpenAI flags > 2560×1440 as "experimental",
 * so `generateImage` steps DOWN `IMAGE_SIZE_FALLBACK` on a size-attributable
 * failure. The shape matches the video so the guidance frame is never
 * cropped/letterboxed downstream.
 */
export const IMAGE_SIZE_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "3840x2160",
  "9:16": "2160x3840",
};

/**
 * Size fallback ladder (largest → next smaller). `generateImage` drops to the
 * mapped size on a size-attributable failure (base64 truncation / "too large" /
 * experimental instability) instead of failing the run: 4K → 2560×1440 → 2K.
 * Every key/value stays divisible by 16.
 */
export const IMAGE_SIZE_FALLBACK: Record<string, string> = {
  "3840x2160": "2560x1440",
  "2560x1440": "2048x1152",
  "2160x3840": "1440x2560",
  "1440x2560": "1152x2048",
};

/** Human-readable resolution label baked into the image prompts, per ratio. */
export const IMAGE_LABEL_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "4K UHD (3840×2160, 16:9 landscape)",
  "9:16": "4K UHD (2160×3840, 9:16 portrait)",
};

/**
 * Image output encoding. WebP q100 is near-lossless yet ~2.5× smaller than PNG,
 * which is what makes 4K viable (4K-PNG base64 truncated over HTTP; 4K-WebP q100
 * is ~5 MB, reliable). gpt-image-2 ignores `input_fidelity` (locked high; sending
 * it 400s), so output format/compression is the only output-side lever. NOTE:
 * BytePlus CreateAsset REJECTS WebP, so every Seedance-bound reference is
 * transcoded to JPEG at the provider boundary (see agents/video providerSafeRefUrl).
 */
export const OPENAI_IMAGE_OUTPUT_FORMAT = "webp" as const;
export const OPENAI_IMAGE_OUTPUT_COMPRESSION = 100;

/** Fallback size when a caller omits one (landscape — the default ratio). */
export const DEFAULT_IMAGE_SIZE = IMAGE_SIZE_BY_RATIO["16:9"];
