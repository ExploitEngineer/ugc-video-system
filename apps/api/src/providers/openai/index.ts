// OpenAI provider adapter — GPT Image 2 (images) + LLM reasoning/critique.
//
// Adapter boundary: agent/skill code depends on these interfaces only,
// never on the `openai` SDK directly, so the model is swappable.
// Chat is vision-capable (used by F5 Critic); generateImage branches
// text-to-image vs reference edit.

import OpenAI, { toFile } from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { env } from "../../config/index.js";
import { internal } from "../../lib/errors.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import {
  DEFAULT_CHAT_MAX_TOKENS,
  DEFAULT_IMAGE_SIZE,
  OPENAI_CHAT_MODEL,
  OPENAI_IMAGE_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_CLAUDE_MODEL,
} from "./constants.js";

const log = createLogger("openai");

/** A reference image passed into an image-gen or vision call. */
export interface ImageRef {
  /** Public or signed URL, or a base64 data URI. */
  source: string;
  mime?: string;
}

export interface GenerateImageInput {
  prompt: string;
  /** Optional reference images (product upload, prior sheets, …). */
  refs?: ImageRef[];
  size?: string;
  /**
   * Render quality. gpt-image-2's biggest fidelity lever for labels/text and
   * dense product detail (low→high ≈ 35× sharper, ~4× slower). Defaults to
   * `"high"` — every sheet in this pipeline carries product markings or a face.
   */
  quality?: "low" | "medium" | "high" | "auto";
}

export interface GenerateImageResult {
  /** Raw image bytes of the generated composite sheet. */
  bytes: Uint8Array;
  mime: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Images for vision/critique turns. */
  images?: ImageRef[];
}

/** Per-call tuning for `chat()`. */
export interface ChatOptions {
  /** Output-token ceiling. Defaults to `DEFAULT_CHAT_MAX_TOKENS` (4096). */
  maxTokens?: number;
  /**
   * Force `response_format: json_object` — the model must emit a single JSON
   * object. Use for every strict-JSON skill; it also hardens against mid-string
   * truncation. Safe only when the prompt asks for JSON (all our skills do).
   *
   * NOTE: only honored on the `"openai"` backend. Claude-via-OpenRouter does not
   * reliably support basic JSON mode (and can error on it), so on `"claude"` we
   * skip `response_format` and lean on the strict-JSON prompt + the forgiving
   * `parseJsonObject` (fence-stripping + brace-slicing) instead.
   */
  jsonMode?: boolean;
  /**
   * Reasoning backend. `"claude"` (DEFAULT) → Claude Sonnet 4.6 via OpenRouter.
   * `"openai"` → forces gpt-4.1. When `OPENROUTER_API_KEY` is unset, the default
   * silently falls back to gpt-4.1, so the server runs without the key.
   */
  backend?: "openai" | "claude";
}

export interface OpenAIProvider {
  /** LLM reasoning / prompt building (and vision when `images` present). */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  /** GPT Image 2 generation → composite reference/storyboard sheet. */
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}

/** Lazily-constructed shared client (config already validated the key). */
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      // Image generation is slow and returns multi-MB bodies; give it room and
      // let the SDK retry connection-level failures. (A post-200 truncated-body
      // parse error is NOT retried by the SDK — generateImage handles that.)
      // 240s: a complex full-body person sheet can legitimately run >120s, so a
      // tight timeout forced a wasteful regen instead of letting it finish.
      timeout: 240_000,
      // The SDK auto-retries connection errors + 429/5xx on chat/image calls;
      // give it more headroom so the parallel 60s fan-outs survive provider
      // overload without surfacing a transient failure to the orchestrator.
      maxRetries: 4,
    });
  }
  return client;
}

/**
 * OpenRouter client for the Claude-routed chat steps. Same OpenAI SDK, just a
 * different base URL + key (OpenRouter is OpenAI-API-compatible). Lazy + cached;
 * only built when a `"claude"` chat call actually fires.
 */
let orClient: OpenAI | null = null;
function getOpenRouterClient(): OpenAI {
  if (!orClient) {
    if (!env.OPENROUTER_API_KEY) {
      throw internal("OPENROUTER_API_KEY is not set; cannot route to Claude.");
    }
    orClient = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      timeout: 240_000,
      maxRetries: 4,
    });
  }
  return orClient;
}

/** Image-gen attempts before giving up (covers truncated-body JSON failures). */
const IMAGE_MAX_ATTEMPTS = 5;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve an `ImageRef` to a base64 data URI. We fetch the bytes ourselves and
 * inline them rather than handing OpenAI a URL to download — OpenAI's server
 * times out fetching large images from Supabase Storage ("400 Timeout while
 * downloading …"). Already-inline data URIs pass through untouched.
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
  // each image as a data URI so OpenAI never reaches back to Supabase.
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

/** Fetch an `ImageRef` (URL or data URI) into an Uploadable file for edits. */
async function imageRefToFile(ref: ImageRef): Promise<File> {
  const res = await fetchWithRetry(ref.source, undefined, { label: "ref-image" });
  if (!res.ok) {
    throw internal(`Failed to fetch reference image (${res.status}): ${ref.source}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const mime = ref.mime ?? res.headers.get("content-type") ?? "image/png";
  const ext = mime.split("/")[1]?.split(";")[0] ?? "png";
  return toFile(buf, `ref.${ext}`, { type: mime });
}

export function createOpenAIProvider(): OpenAIProvider {
  return {
    async chat(messages, opts) {
      const sdkMessages = await Promise.all(messages.map(toChatMessage));
      const maxTokens = opts?.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS;
      // Claude Sonnet 4.6 (via OpenRouter) is the DEFAULT reasoning/vision
      // backend. A call routes to Claude unless it explicitly forces
      // `backend:"openai"`; if `OPENROUTER_API_KEY` is unset we degrade to
      // gpt-4.1 (so the server still runs without the key).
      const backend = opts?.backend ?? "claude";
      const useClaude = backend === "claude" && Boolean(env.OPENROUTER_API_KEY);
      const apiClient = useClaude ? getOpenRouterClient() : getClient();
      const model = useClaude ? OPENROUTER_CLAUDE_MODEL : OPENAI_CHAT_MODEL;
      // json_object is reliable on gpt-4.1; on Claude-via-OpenRouter it is not
      // guaranteed (and can error) — skip it there and trust the prompt + parser.
      const wantJson = Boolean(opts?.jsonMode) && !useClaude;
      const t0 = Date.now();
      log.debug("chat →", {
        model,
        backend: useClaude ? "claude" : "openai",
        msgs: sdkMessages.length,
        maxTokens,
        jsonMode: wantJson,
      });
      const completion = await apiClient.chat.completions.create({
        model,
        messages: sdkMessages,
        max_completion_tokens: maxTokens,
        ...(wantJson
          ? { response_format: { type: "json_object" as const } }
          : {}),
      });
      const choice = completion.choices[0];
      const content = choice?.message?.content ?? "";
      // A truncated response (hit the token ceiling) yields invalid JSON
      // downstream — surface it as a clear, actionable error here.
      if (choice?.finish_reason === "length") {
        log.warn("chat truncated at token ceiling", { maxTokens });
      }
      log.debug("chat ✓", { ms: Date.now() - t0, chars: content.length });
      return content;
    },

    async generateImage(input) {
      const size = input.size ?? DEFAULT_IMAGE_SIZE;
      const quality = input.quality ?? "high";
      const mode = input.refs?.length ? "edit" : "generate";
      // Pre-fetch the reference files ONCE (not per attempt).
      const refFiles = input.refs?.length
        ? await Promise.all(input.refs.map(imageRefToFile))
        : null;

      // Retry transient failures: the model returns the PNG as a multi-MB base64
      // body whose HTTP response occasionally truncates → the SDK's internal
      // response.json() throws "Unterminated string in JSON" (not auto-retried,
      // since the request reached 200). Also covers network drops / empty data.
      let lastErr: unknown;
      for (let attempt = 1; attempt <= IMAGE_MAX_ATTEMPTS; attempt++) {
        const t0 = Date.now();
        log.debug("image →", {
          model: OPENAI_IMAGE_MODEL,
          mode,
          refs: input.refs?.length ?? 0,
          size,
          quality,
          attempt,
        });
        try {
          const result = refFiles
            ? await getClient().images.edit({
                model: OPENAI_IMAGE_MODEL,
                image: refFiles,
                prompt: input.prompt,
                size: size as never,
                quality: quality as never,
              })
            : await getClient().images.generate({
                model: OPENAI_IMAGE_MODEL,
                prompt: input.prompt,
                size: size as never,
                quality: quality as never,
              });

          const b64 = result.data?.[0]?.b64_json;
          if (!b64) throw internal("OpenAI image response missing image data.");
          log.debug("image ✓", { ms: Date.now() - t0, mode, attempt });
          return {
            bytes: new Uint8Array(Buffer.from(b64, "base64")),
            mime: "image/png",
          };
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          log.warn("image retry", { attempt, mode, ms: Date.now() - t0, err: msg });
          // Capped exponential backoff + jitter (~2s, 4s, 8s, 12s): give a
          // truncating proxy / flaky connection time to clear, and keep the
          // parallel product+person sheet retries from thundering in lockstep.
          if (attempt < IMAGE_MAX_ATTEMPTS) {
            await sleep(
              Math.min(2000 * 2 ** (attempt - 1), 12_000) +
                Math.floor(Math.random() * 600),
            );
          }
        }
      }
      throw internal(
        `OpenAI image generation failed after ${IMAGE_MAX_ATTEMPTS} attempts: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`,
      );
    },
  };
}
