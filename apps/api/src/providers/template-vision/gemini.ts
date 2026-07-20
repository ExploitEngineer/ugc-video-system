// v2 template-vision — Gemini video understanding.
//
// Unlike the Claude still-vision path, Gemini WATCHES the preview .mp4 end to
// end, so it reads the template's real motion/pacing/timing rather than
// inferring it from sampled stills. The flow:
//   1. download the preview clip (`input.previewVideoUrl`) into memory,
//   2. upload it via the Gemini Files API and wait until it is ACTIVE,
//   3. ask Gemini to watch the clip and emit the SAME blueprint JSON
//      (`input.system` / `input.user` carry the identical instructions),
//   4. return that raw JSON — so `visionSource` becomes "video" and NOTHING
//      else in the pipeline changes.
//
// Selected only when `TEMPLATE_VISION_PROVIDER=gemini` AND `GEMINI_API_KEY` is
// set (see `createTemplateVisionProvider`); any failure here (missing clip,
// upload/processing error, empty reply) is caught by the caller, which degrades
// to the Claude still provider — so Gemini is a strict upgrade, never a new way
// for `template_plan` to fail.

import { FileState, GoogleGenAI } from "@google/genai";

import { env } from "../../config/index.js";
import { downloadToBuffer } from "../../lib/download.js";
import { createLogger } from "../../lib/log.js";
import type { TemplateVisionInput, TemplateVisionProvider } from "./index.js";

const log = createLogger("gemini-vision");

// The preview clip is a small (8–60s) render; processing is quick. Bounds keep a
// stuck upload from hanging the `template_plan` step (the caller still falls back
// to Claude if we throw).
const PROCESSING_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Lazy, module-cached client — mirrors the openai provider. Constructed on first
// use so the server still boots without a key (the factory only routes here when
// GEMINI_API_KEY is present).
let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new Error("gemini-vision: GEMINI_API_KEY is not set");
  }
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export function createGeminiVideoVisionProvider(): TemplateVisionProvider {
  return {
    kind: "video",
    async analyze(input: TemplateVisionInput): Promise<string> {
      if (!input.previewVideoUrl) {
        throw new Error("gemini-vision: no previewVideoUrl to analyze");
      }
      const ai = getClient();

      // 1. Stream the preview clip to disk (stall-timeout bounded — never a total
      //    cap that would abort a healthy large ~15mbps render download), then
      //    wrap the bytes as a Blob for the Files API upload.
      const bytes = await downloadToBuffer(input.previewVideoUrl, {
        label: "gemini-preview-download",
      });
      const blob = new Blob([bytes], { type: "video/mp4" });

      // 2. Upload via the Files API, then poll until ACTIVE.
      let file = await ai.files.upload({
        file: blob,
        config: { mimeType: "video/mp4" },
      });
      const fileName = file.name;
      if (!fileName) throw new Error("gemini-vision: upload returned no file name");

      try {
        const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
        while (file.state === FileState.PROCESSING) {
          if (Date.now() > deadline) {
            throw new Error("gemini-vision: file processing timed out");
          }
          await sleep(POLL_INTERVAL_MS);
          file = await ai.files.get({ name: fileName });
        }
        if (file.state !== FileState.ACTIVE || !file.uri) {
          throw new Error(`gemini-vision: file not active (state=${file.state})`);
        }

        // 3. Watch the clip and emit the blueprint. Same strict-JSON contract as
        //    Claude — responseMimeType nudges Gemini; the caller's parseJsonObject
        //    + one-retry still guards correctness.
        const result = await ai.models.generateContent({
          model: env.GEMINI_VISION_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: file.uri, mimeType: file.mimeType ?? "video/mp4" } },
                { text: input.user },
              ],
            },
          ],
          config: {
            systemInstruction: input.system,
            responseMimeType: "application/json",
            maxOutputTokens: input.maxTokens ?? 4000,
          },
        });

        const text = result.text;
        if (!text) throw new Error("gemini-vision: empty reply");
        return text;
      } finally {
        // 4. Best-effort cleanup — a leaked file expires on Gemini's side anyway.
        await ai.files.delete({ name: fileName }).catch((err: unknown) => {
          log.warn("gemini-vision: file cleanup failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }
    },
  };
}
