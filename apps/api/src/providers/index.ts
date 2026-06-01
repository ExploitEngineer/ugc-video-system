// Provider adapter boundary barrel. All external model calls live behind
// these interfaces so concrete providers stay swappable (SPEC §6).

import type { VideoProvider } from "./video.js";
import { createOpenRouterProvider } from "./openrouter/index.js";

export * from "./openai/index.js";
export * from "./video.js";
export * from "./openrouter/index.js";

/** Video provider — OpenRouter (Kling 3.0 Pro). */
export function createVideoProvider(): VideoProvider {
  return createOpenRouterProvider();
}
