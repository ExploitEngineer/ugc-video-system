// OpenRouter reasoning model id + chat defaults, isolated here so they swap
// without touching provider or agent logic. OpenRouter is OpenAI-compatible, so
// the reasoning adapter uses the `openai` SDK pointed at this base URL.

/** OpenAI-compatible OpenRouter endpoint. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Claude Sonnet 4.6 via OpenRouter — LLM reasoning / prompt-building / vision. */
export const OPENROUTER_CHAT_MODEL = "anthropic/claude-sonnet-4.6";

/**
 * Default output-token budget for `chat()`. The long storyboard `imagePrompt`
 * truncated mid-string under a tight cap (→ JSON parse failure), so every chat
 * call gets a generous explicit ceiling; callers can override via `maxTokens`.
 */
export const DEFAULT_CHAT_MAX_TOKENS = 4096;
