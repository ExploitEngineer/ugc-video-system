// OpenAI model ids + defaults, isolated here so they swap without touching
// provider or agent logic.

/** LLM used for prompt-building / reasoning (and vision in F5). */
export const OPENAI_CHAT_MODEL = "gpt-4.1";

/** GPT Image 2. Generate + edit (reference-image) capable; accepts 4K sizes. */
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

/** Default composite-sheet size — 4K landscape (16:9), matches the video aspect. */
export const DEFAULT_IMAGE_SIZE = "3840x2160";

/** Human-readable resolution label baked into image prompts. */
export const DEFAULT_IMAGE_RESOLUTION_LABEL = "4K UHD (3840×2160, 16:9 landscape)";
