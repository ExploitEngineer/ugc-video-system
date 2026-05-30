// Provider adapter boundary barrel. All external model calls live behind
// these interfaces so concrete providers stay swappable (SPEC §6).

import { env } from "../config/index.js";
import type { VideoProvider } from "./video.js";
import { createArkProvider } from "./ark/index.js";
import { createRunComfyProvider } from "./runcomfy/index.js";

export * from "./openai/index.js";
export * from "./video.js";
export * from "./ark/index.js";
export { createRunComfyProvider } from "./runcomfy/index.js";

/** Pick the video provider per `VIDEO_PROVIDER` (default: ark). */
export function createVideoProvider(): VideoProvider {
  return env.VIDEO_PROVIDER === "runcomfy"
    ? createRunComfyProvider()
    : createArkProvider();
}
