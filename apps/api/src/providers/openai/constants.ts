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
 * Composite-sheet pixel size per output aspect ratio. The sheets only GUIDE the
 * downstream video, so they are rendered at ~2K (≈2.36 MP) regardless of shape:
 * 4K made the base64 response ~12 MB and intermittently truncated
 * (Unterminated-JSON failures), whereas 2K is far smaller, faster, reliable.
 * gpt-image-2 requires BOTH dimensions divisible by 16 — every value below is
 * (2048/16=128, 1152/16=72, 1152/16=72, 2048/16=128). The sheet shape matches
 * the video so the guidance frame is never cropped/letterboxed downstream.
 */
export const IMAGE_SIZE_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "2048x1152",
  "9:16": "1152x2048",
};

/** Human-readable resolution label baked into the image prompts, per ratio. */
export const IMAGE_LABEL_BY_RATIO: Record<AspectRatio, string> = {
  "16:9": "2K (2048×1152, 16:9 landscape)",
  "9:16": "2K (1152×2048, 9:16 portrait)",
};

/** Fallback size when a caller omits one (landscape — the default ratio). */
export const DEFAULT_IMAGE_SIZE = IMAGE_SIZE_BY_RATIO["16:9"];
