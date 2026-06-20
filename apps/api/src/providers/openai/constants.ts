// OpenAI model ids + defaults, isolated here so they swap without touching
// provider or agent logic.

import type { AspectRatio } from "@ugc/shared";

/** LLM used for prompt-building / reasoning (and vision in F5). */
export const OPENAI_CHAT_MODEL = "gpt-4.1";

/**
 * OpenRouter — OpenAI-SDK-compatible chat endpoint. Used only for the
 * vision/label-reading steps that route to Claude (describeProduct,
 * derivePersonBrief); everything else stays on `OPENAI_CHAT_MODEL`.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Claude Sonnet 4.6 via OpenRouter — stronger label OCR + disciplined JSON for
 * the product/person briefs. VERIFY the slug is live before deploy
 * (`GET https://openrouter.ai/api/v1/models`); a dated alias may also exist.
 */
export const OPENROUTER_CLAUDE_MODEL = "anthropic/claude-sonnet-4.6";

/** GPT Image 2. Generate + edit (reference-image) capable. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/**
 * Default output-token budget for `chat()`. The API's implicit default cap
 * truncated the long storyboard `imagePrompt` mid-string (→ JSON parse failure),
 * so every chat call gets a generous explicit ceiling; callers can override.
 */
export const DEFAULT_CHAT_MAX_TOKENS = 4096;

/**
 * Composite-sheet pixel size per output aspect ratio — now 4K UHD. More pixels
 * per panel = real skin micro-texture survives instead of going waxy/plastic
 * (the per-panel pixel budget is the mechanical root of the "AI face" look).
 * 4K was previously reverted because 4K-PNG returned a ~12 MB base64 body that
 * intermittently truncated (Unterminated-JSON failures); switching the output
 * to WebP q100 (see below) drops that to ~5 MB and makes 4K reliable.
 * gpt-image-2 requires BOTH dimensions divisible by 16 (3840/16=240, 2160/16=135)
 * and total pixels ≤ 8,294,400 — 3840×2160 = 8,294,400 sits exactly at the max.
 * NOTE: OpenAI flags > 2560×1440 as "experimental"; if 4K proves unstable, fall
 * back to "2560x1440" / "1440x2560". The shape matches the video so the guidance
 * frame is never cropped/letterboxed downstream.
 */
export const IMAGE_SIZE_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "3840x2160",
  "9:16": "2160x3840",
};

/** Human-readable resolution label baked into the image prompts, per ratio. */
export const IMAGE_LABEL_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "4K UHD (3840×2160, 16:9 landscape)",
  "9:16": "4K UHD (2160×3840, 9:16 portrait)",
};

/**
 * Image output encoding. WebP at quality 100 is near-lossless yet ~2.5× smaller
 * than PNG, which is what makes 4K viable (a 4K-PNG base64 body truncated over
 * HTTP; 4K-WebP q100 is ~5 MB and reliable). gpt-image-2 ignores `input_fidelity`
 * (it processes every reference image at high fidelity automatically — confirmed
 * by a 400 "does not support the 'input_fidelity' parameter"), so we never send it.
 */
export const OPENAI_IMAGE_OUTPUT_FORMAT = "webp" as const;
export const OPENAI_IMAGE_OUTPUT_COMPRESSION = 100;

/** Fallback size when a caller omits one (landscape — the default ratio). */
export const DEFAULT_IMAGE_SIZE = IMAGE_SIZE_BY_RATIO["16:9"];
