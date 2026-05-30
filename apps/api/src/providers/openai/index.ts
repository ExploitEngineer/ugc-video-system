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
import {
  DEFAULT_IMAGE_SIZE,
  OPENAI_CHAT_MODEL,
  OPENAI_IMAGE_MODEL,
} from "./constants.js";

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

export interface OpenAIProvider {
  /** LLM reasoning / prompt building (and vision when `images` present). */
  chat(messages: ChatMessage[]): Promise<string>;
  /** GPT Image 2 generation → composite reference/storyboard sheet. */
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}

/** Lazily-constructed shared client (config already validated the key). */
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

/** Map our `ChatMessage` (+ optional images) to the SDK's message shape. */
function toChatMessage(m: ChatMessage): ChatCompletionMessageParam {
  if (!m.images?.length) {
    return { role: m.role, content: m.content };
  }
  // Vision parts ride on a user turn (system/assistant stay text-only).
  const parts: ChatCompletionContentPart[] = [
    { type: "text", text: m.content },
    ...m.images.map(
      (img): ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url: img.source },
      }),
    ),
  ];
  return { role: "user", content: parts };
}

/** Fetch an `ImageRef` (URL or data URI) into an Uploadable file for edits. */
async function imageRefToFile(ref: ImageRef): Promise<File> {
  const res = await fetch(ref.source);
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
    async chat(messages) {
      const completion = await getClient().chat.completions.create({
        model: OPENAI_CHAT_MODEL,
        messages: messages.map(toChatMessage),
      });
      return completion.choices[0]?.message?.content ?? "";
    },

    async generateImage(input) {
      const size = input.size ?? DEFAULT_IMAGE_SIZE;
      const result = input.refs?.length
        ? await getClient().images.edit({
            model: OPENAI_IMAGE_MODEL,
            image: await Promise.all(input.refs.map(imageRefToFile)),
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
      return { bytes: new Uint8Array(Buffer.from(b64, "base64")), mime: "image/png" };
    },
  };
}
