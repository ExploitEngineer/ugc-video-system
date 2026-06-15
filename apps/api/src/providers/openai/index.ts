// OpenAI provider adapter — GPT Image 2 image generation.
//
// Adapter boundary: agent/skill code depends on these interfaces only, never on
// the `openai` SDK directly, so the model is swappable. `generateImage` branches
// text-to-image vs reference edit. The chat/reasoning contract (`ChatMessage`,
// `ChatOptions`, `OpenAIProvider.chat`) is declared here but IMPLEMENTED by the
// OpenRouter adapter (providers/openrouter) — Claude Sonnet 4.6.

import OpenAI, { toFile } from "openai";
import { env } from "../../config/index.js";
import { internal } from "../../lib/errors.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { DEFAULT_IMAGE_SIZE, OPENAI_IMAGE_MODEL } from "./constants.js";

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
  /** Output-token ceiling for the JSON body. Defaults to 4096 (see openrouter constants). */
  maxTokens?: number;
  /**
   * Instruct the model to emit a single JSON object. Use for every strict-JSON
   * skill; it also hardens against mid-string truncation. Safe only when the
   * prompt asks for JSON (all our skills do).
   */
  jsonMode?: boolean;
}

export interface OpenAIProvider {
  /**
   * LLM reasoning / prompt building (and vision when `images` present).
   * Implemented by the OpenRouter adapter (Claude Sonnet 4.6), not OpenAI.
   */
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

/** Image-gen attempts before giving up (covers truncated-body JSON failures). */
const IMAGE_MAX_ATTEMPTS = 5;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

/** Image half of the provider: `generateImage()` only. */
export function createOpenAIProvider(): Pick<OpenAIProvider, "generateImage"> {
  return {
    async generateImage(input) {
      const size = input.size ?? DEFAULT_IMAGE_SIZE;
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
          attempt,
        });
        try {
          const result = refFiles
            ? await getClient().images.edit({
                model: OPENAI_IMAGE_MODEL,
                image: refFiles,
                prompt: input.prompt,
                size: size as never,
              })
            : await getClient().images.generate({
                model: OPENAI_IMAGE_MODEL,
                prompt: input.prompt,
                size: size as never,
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
