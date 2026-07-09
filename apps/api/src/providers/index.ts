// Provider adapter boundary barrel. All external model calls live behind
// these interfaces so concrete providers stay swappable (SPEC §6).

import type { VideoProvider } from "./video.js";
import type { TemplateRenderProvider } from "./template-render.js";
import { createBytePlusProvider } from "./byteplus/index.js";
import { createNexrenderProvider } from "./nexrender/index.js";

export * from "./openai/index.js";
export * from "./video.js";
export * from "./byteplus/index.js";
export * from "./template-render.js";
export * from "./nexrender/index.js";

/** Video provider — BytePlus ModelArk (Seedance 2.0). */
export function createVideoProvider(): VideoProvider {
  return createBytePlusProvider();
}

/** Template-render provider — Nexrender Cloud (falls back to a stub locally). */
export function createTemplateRenderProvider(): TemplateRenderProvider {
  return createNexrenderProvider();
}
