// OpenAI model ids + defaults, isolated here so they swap without touching
// provider or agent logic. SPEC §8 open question: the exact "GPT Image 2" slug
// is unconfirmed — `gpt-image-1` is the real OpenAI image model whose
// generate/edit endpoints accept reference images. Swap here when confirmed.

/** LLM used for prompt-building / reasoning (and vision in F5). */
export const OPENAI_CHAT_MODEL = "gpt-4.1";

/** GPT Image 2 stand-in. Generate + edit (reference-image) capable. */
export const OPENAI_IMAGE_MODEL = "gpt-image-1";

/** Default composite-sheet size (landscape, fits multi-view/panel layouts). */
export const DEFAULT_IMAGE_SIZE = "1536x1024";
