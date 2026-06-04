// OpenAI model ids + defaults, isolated here so they swap without touching
// provider or agent logic.

/** LLM used for prompt-building / reasoning (and vision in F5). */
export const OPENAI_CHAT_MODEL = "gpt-4.1";

/** GPT Image 2. Generate + edit (reference-image) capable. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/**
 * Default composite-sheet size — 2K landscape (16:9), matching the video aspect.
 * These sheets only GUIDE the downstream video; 4K made the base64 response
 * ~12 MB and intermittently truncated (Unterminated-JSON failures), so we render
 * the intermediate sheets at 2K — far smaller, faster, reliable.
 * gpt-image-2 requires BOTH dimensions divisible by 16: 2048/16=128, 1152/16=72.
 */
export const DEFAULT_IMAGE_SIZE = "2048x1152";

/** Human-readable resolution label baked into image prompts. */
export const DEFAULT_IMAGE_RESOLUTION_LABEL = "2K (2048×1152, 16:9 landscape)";
