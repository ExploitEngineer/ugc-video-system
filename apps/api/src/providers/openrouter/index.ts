// OpenRouter provider adapter — Claude Sonnet 4.6 for LLM reasoning / prompt
// building / vision. Backs `ctx.openai.chat()`; image generation stays on the
// OpenAI adapter (GPT Image 2, direct OpenAI key).
//
// OpenRouter is OpenAI-API-compatible, so this uses the `openai` SDK with a
// custom base URL + the OpenRouter key. Reasoning is left OFF: enabling it (via
// OpenRouter's `reasoning` extension) made Claude spend the entire `max_tokens`
// budget on thinking for the large storyboard prompt and return EMPTY content
// (→ JSON parse failure), plus ~3min/call latency. Plain Sonnet 4.6 is fast and
// reliable. Agent/skill code depends on the shared `ChatMessage`/`ChatOptions`
// contract only, so the model + vendor stay swappable.

import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { env } from "../../config/index.js";
import { internal } from "../../lib/errors.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import type { ChatMessage, ImageRef, OpenAIProvider } from "../openai/index.js";
import {
  DEFAULT_CHAT_MAX_TOKENS,
  OPENROUTER_BASE_URL,
  OPENROUTER_CHAT_MODEL,
} from "./constants.js";

const log = createLogger("openrouter");

/**
 * Resolve an `ImageRef` to a base64 data URI. We fetch the bytes ourselves and
 * inline them rather than hand a URL to the provider — its server times out
 * fetching large images from Supabase Storage. `data:` URIs pass through.
 */
async function imageRefToDataUri(ref: ImageRef): Promise<string> {
  if (ref.source.startsWith("data:")) return ref.source;
  const res = await fetchWithRetry(ref.source, undefined, { label: "ref-image" });
  if (!res.ok) {
    throw internal(`Failed to fetch reference image (${res.status}): ${ref.source}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = ref.mime ?? res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Map our `ChatMessage` (+ optional images) to the SDK's message shape. */
async function toChatMessage(m: ChatMessage): Promise<ChatCompletionMessageParam> {
  if (!m.images?.length) {
    return { role: m.role, content: m.content };
  }
  // Vision parts ride on a user turn (system/assistant stay text-only). Inline
  // each image as a data URI so the provider never reaches back to Supabase.
  const dataUris = await Promise.all(m.images.map(imageRefToDataUri));
  const parts: ChatCompletionContentPart[] = [
    { type: "text", text: m.content },
    ...dataUris.map(
      (url): ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url },
      }),
    ),
  ];
  return { role: "user", content: parts };
}

/** Lazily-constructed shared client (config already validated the key). */
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      // Reasoning-enabled chat can run a while; give it room and let the SDK
      // retry connection errors + 429/5xx.
      timeout: 240_000,
      maxRetries: 4,
    });
  }
  return client;
}

/** Reasoning half of the provider: `chat()` only (vision-capable). */
export function createOpenRouterReasoner(): Pick<OpenAIProvider, "chat"> {
  return {
    async chat(messages, opts) {
      const sdkMessages = await Promise.all(messages.map(toChatMessage));
      const maxTokens = opts?.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS;
      const t0 = Date.now();
      log.debug("chat →", {
        model: OPENROUTER_CHAT_MODEL,
        msgs: sdkMessages.length,
        maxTokens,
        jsonMode: Boolean(opts?.jsonMode),
      });
      const completion = await getClient().chat.completions.create({
        model: OPENROUTER_CHAT_MODEL,
        messages: sdkMessages,
        max_tokens: maxTokens,
        ...(opts?.jsonMode
          ? { response_format: { type: "json_object" as const } }
          : {}),
      });
      const choice = completion.choices[0];
      const content = choice?.message?.content ?? "";
      // Empty body → downstream JSON parse fails with a generic error. Surface
      // the real cause (usually finish_reason "length" — output hit the ceiling)
      // so it's diagnosable and the storyboard parse-retry loop can react.
      if (!content.trim()) {
        throw internal(
          `OpenRouter returned empty content (finish_reason=${
            choice?.finish_reason ?? "unknown"
          }, maxTokens=${maxTokens}).`,
        );
      }
      if (choice?.finish_reason === "length") {
        log.warn("chat truncated at token ceiling", { maxTokens });
      }
      log.debug("chat ✓", { ms: Date.now() - t0, chars: content.length });
      return content;
    },
  };
}
