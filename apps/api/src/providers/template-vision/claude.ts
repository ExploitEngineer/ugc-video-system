// v1 template-vision — Claude Sonnet over the preview poster + sampled frames.
//
// Reuses the existing OpenRouter/Claude transport (`OpenAIProvider.chat` with
// `backend: "claude"`), the same vision path `describe-product` uses to inline
// an image on a chat turn. The still images approximate the template's motion;
// true frame-by-frame understanding is the deferred Gemini path.

import type {
  ChatMessage,
  ImageRef,
  OpenAIProvider,
} from "../openai/index.js";
import type { TemplateVisionInput, TemplateVisionProvider } from "./index.js";

export function createClaudeStillVisionProvider(
  openai: OpenAIProvider,
): TemplateVisionProvider {
  return {
    kind: "still",
    async analyze(input: TemplateVisionInput): Promise<string> {
      // Poster first (frame 1), then the sampled strip — the FRAME LEGEND in the
      // prompt is numbered in this exact order.
      const images: ImageRef[] = [
        ...(input.poster ? [input.poster] : []),
        ...(input.frames ?? []),
      ];
      const messages: ChatMessage[] = [
        { role: "system", content: input.system },
        {
          role: "user",
          content: input.user,
          ...(images.length ? { images } : {}),
        },
      ];
      // OpenRouter/Claude ignores response_format, so the strict-JSON prompt +
      // the caller's parse/retry carry correctness — same as every other skill.
      return openai.chat(messages, {
        backend: "claude",
        jsonMode: true,
        maxTokens: input.maxTokens ?? 4000,
      });
    },
  };
}
