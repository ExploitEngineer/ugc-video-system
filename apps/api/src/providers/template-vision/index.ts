// Template-vision provider boundary — how the `template_plan` step SEES the
// template it is analyzing.
//
// v1 (`claude`, the default) shows Claude Sonnet the preview POSTER plus frames
// sampled from the preview clip — still images, which approximate motion. v2
// (`gemini`, deferred) would watch the actual .mp4 frame-by-frame for true
// temporal understanding; its provider is a stub. Selection is a one-line
// factory swap, and both implementations return the SAME blueprint JSON, so
// nothing downstream changes when the video path lands.

import { env } from "../../config/index.js";
import type { ImageRef, OpenAIProvider } from "../openai/index.js";
import { createClaudeStillVisionProvider } from "./claude.js";
import { createGeminiVideoVisionProvider } from "./gemini.js";

export interface TemplateVisionInput {
  /** Strict-JSON system instruction (the blueprint rules). */
  system: string;
  /** The structural inventory + brief + frame legend. */
  user: string;
  /** The preview poster — the one still every provider can see. May be absent. */
  poster?: ImageRef;
  /** Frames sampled across the preview clip (still-vision providers only). */
  frames?: ImageRef[];
  /** The preview .mp4 URL — consumed ONLY by the video-capable (Gemini) provider. */
  previewVideoUrl?: string;
  /** The clip length the blueprint must cover. */
  durationSec: number;
  /** Token ceiling for this call — the caller raises it on a retry. */
  maxTokens?: number;
}

export interface TemplateVisionProvider {
  /** For provenance on the blueprint (`visionSource`) and logs. */
  readonly kind: "still" | "video";
  /** Run the analysis and return the model's raw reply (JSON string). */
  analyze(input: TemplateVisionInput): Promise<string>;
}

/**
 * Pick the analysis provider. v1 = Claude still-vision (default). The Gemini
 * video path is selected only when explicitly configured AND a live key is
 * present, and degrades back to Claude otherwise (mirroring the OpenRouter
 * fallback), so a stray `gemini` flag with no key never breaks a run.
 */
export function createTemplateVisionProvider(
  openai: OpenAIProvider,
): TemplateVisionProvider {
  if (env.TEMPLATE_VISION_PROVIDER === "gemini" && env.GEMINI_API_KEY) {
    return createGeminiVideoVisionProvider();
  }
  return createClaudeStillVisionProvider(openai);
}
