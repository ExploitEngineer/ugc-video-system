// v2 template-vision SEAM — Gemini video understanding. DEFERRED, not built.
//
// Unlike the Claude still-vision path, Gemini can watch the preview .mp4
// frame-by-frame, so it reads the template's real motion/pacing rather than
// inferring it from sampled stills. When implemented, this provider will:
//   1. upload `input.previewVideoUrl` via the Gemini Files API,
//   2. prompt Gemini to watch the clip and emit the SAME blueprint JSON
//      (`input.system` / `input.user` carry the identical instructions),
//   3. return that raw JSON — so `visionSource` becomes "video" and NOTHING
//      else in the pipeline changes.
//
// It is selected only when `TEMPLATE_VISION_PROVIDER=gemini` AND `GEMINI_API_KEY`
// is set (see `createTemplateVisionProvider`); with no key the factory falls
// back to Claude, so this throw can only be reached by an explicit opt-in.

import type { TemplateVisionInput, TemplateVisionProvider } from "./index.js";

export function createGeminiVideoVisionProvider(): TemplateVisionProvider {
  return {
    kind: "video",
    async analyze(_input: TemplateVisionInput): Promise<string> {
      throw new Error(
        "Gemini template-vision is not implemented yet — set TEMPLATE_VISION_PROVIDER=claude",
      );
    },
  };
}
