import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard scenes
 * into ONE cohesive Seedance directive: a single shot description carrying
 * camera grammar, motion, pacing, and audio tone in the requested ad style.
 *
 * Division of labour (per the seedance-v2 skill): stable identity lives in the
 * storyboard image reference; the text prompt drives the evolving narrative,
 * camera, and audio. So this prompt must NOT re-describe the product/person
 * appearance — only motion, camera, mood, and sound.
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
    `Compose ONE Seedance 2.0 video prompt for a ~${durationSec}s ad in the "${adStyle}" style.`,
    "The storyboard sheet is supplied as an image reference and holds the visual identity (product, person, palette) — DO NOT re-describe their appearance.",
    "Describe the EVOLVING shot: camera movement/grammar, subject action across the scenes in order, pacing, lighting/mood, and AUDIO (spoken tone, ambience, music/SFX) for native synchronized audio.",
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
    `Return JSON: { "videoPrompt": "<one cinematic paragraph with camera, motion, mood, and audio direction>" }`,
    critiqueBlock,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
