// Provider adapter boundary barrel. All external model calls live behind
// these interfaces so concrete providers stay swappable (SPEC §6).

import type { VideoProvider } from "./video.js";
import type { OpenAIProvider } from "./openai/index.js";
import { createOpenAIProvider } from "./openai/index.js";
import { createOpenRouterReasoner } from "./openrouter/index.js";
import { createBytePlusProvider } from "./byteplus/index.js";

export * from "./openai/index.js";
export * from "./openrouter/index.js";
export * from "./video.js";
export * from "./byteplus/index.js";

/**
 * Composite reasoning+image provider used everywhere `ctx.openai` is expected:
 * reasoning/vision via OpenRouter (Claude Sonnet 4.6), image generation via the
 * OpenAI adapter (GPT Image 2). Agents call `.chat` / `.generateImage` without
 * knowing which vendor backs each.
 */
export function createAiProvider(): OpenAIProvider {
  return { ...createOpenRouterReasoner(), ...createOpenAIProvider() };
}

/** Video provider — BytePlus ModelArk (Seedance 2.0). */
export function createVideoProvider(): VideoProvider {
  return createBytePlusProvider();
}
