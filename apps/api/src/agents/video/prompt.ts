import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard scenes
 * into ONE cohesive Kling 3.0 directive: a single shot description carrying
 * camera grammar, motion, pacing, and mood in the requested ad style.
 *
 * Division of labour: stable identity lives in the clean product/person
 * reference sheets (sent as guidance images); the storyboard is a PLANNING
 * artifact whose scenes are given to the LLM as text only — its sheet image is
 * never sent, so its panel numbers/arrows/captions cannot leak into the clip.
 * This prompt must NOT re-describe the product/person appearance — only motion,
 * camera, and mood — and must yield ONE clean continuous live-action shot.
 */
export function buildVideoPrompt(input: {
  adStyle: string;
  userPrompt: string;
  scenes: StoryboardScene[];
  durationSec: number;
  critique?: string;
}): ChatMessage[] {
  const { adStyle, userPrompt, scenes, durationSec, critique } = input;

  const system = [
    "You are the Video Builder for an AI ad-video pipeline.",
    `Compose ONE Kling 3.0 video prompt for a ~${durationSec}s ad in the "${adStyle}" style.`,
    "Identity (product, person, palette) is supplied separately via clean reference-sheet images — DO NOT re-describe their appearance.",
    "The storyboard scenes below are a PLAN. Translate them into ONE finished, continuous live-action commercial shot — never a storyboard. The result must contain NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text; explicitly say so in the prompt.",
    "The FINAL VIDEO must be fully photorealistic live-action — real, lifelike people, NOT animation. State explicitly that the footage is photorealistic, real-camera, live-action.",
    "Describe the EVOLVING shot: camera movement/grammar, subject action across the scenes in order, pacing, and lighting/mood.",
    "Frame for 16:9 widescreen (horizontal), composing the action for a landscape frame.",
    "Keep it one flowing cinematic paragraph, filmable in the duration. Return STRICT JSON only.",
  ].join(" ");

  const sceneLines = scenes
    .map(
      (s) =>
        `Scene ${s.index} — camera: ${s.cameraAngle}; action: ${s.actionMovement}; ${s.sceneDescription}`,
    )
    .join("\n");

  const critiqueBlock = critique
    ? `\n\nA prior attempt was rejected. Fix exactly this: ${critique}`
    : "";

  const user = [
    `Ad prompt: ${userPrompt}`,
    "Storyboard scenes (in order):",
    sceneLines,
    `Return JSON: { "videoPrompt": "<one cinematic paragraph with camera, motion, and mood direction>" }`,
    critiqueBlock,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
