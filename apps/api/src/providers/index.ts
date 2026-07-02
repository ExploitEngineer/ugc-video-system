// Provider adapter boundary barrel. All external model calls live behind
// these interfaces so concrete providers stay swappable (SPEC §6).

import type { VideoProvider } from "./video.js";
import { createBytePlusProvider } from "./byteplus/index.js";

export * from "./openai/index.js";
export * from "./video.js";
export * from "./byteplus/index.js";
// Plainly is a distinct ASSEMBLY job (not a VideoProvider) — exported for the
// interactive pre-merge editing stage, not wired into createVideoProvider().
export * from "./plainly/index.js";

/** Video provider — BytePlus ModelArk (Seedance 2.0). */
export function createVideoProvider(): VideoProvider {
  return createBytePlusProvider();
}
