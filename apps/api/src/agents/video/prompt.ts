import type { AdType } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard scenes
 * + per-scene transcripts into ONE cohesive Seedance 2.0 directive: a single
 * shot description carrying camera grammar, motion, pacing, mood, and spoken
 * audio in the requested ad style.
 *
 * Division of labour: the clean storyboard sheet (sent as the guidance image)
 * grounds framing/action; this prompt translates the scene plan into motion,
 * camera, mood, and the spoken/voiceover audio. The spoken lines come from each
 * scene's `transcript` — for UGC the on-screen person says them; for
 * inspirational ads they are voiceover narration over the visuals.
 */
export function buildVideoPrompt(input: {
  adStyle: string;
  adType: AdType;
  userPrompt: string;
  scenes: StoryboardScene[];
  durationSec: number;
  critique?: string;
}): ChatMessage[] {
  const { adStyle, adType, userPrompt, scenes, durationSec, critique } = input;

  const audioDirective =
    adType === "ugc"
      ? "AUDIO — this is a UGC review: a single on-screen person SPEAKS the transcript lines below in order, in a natural, conversational, authentic tone, lip-synced on camera. Carry their voice as the primary audio, with light realistic ambience."
      : "AUDIO — this is an inspirational ad: the transcript lines below are VOICEOVER NARRATION delivered over the visuals (not necessarily lip-synced by anyone on screen), in an evocative tone, layered with fitting music/ambience.";

  const system = [
    "You are the Video Builder for an AI ad-video pipeline.",
    `Compose ONE Seedance 2.0 video prompt for a ~${durationSec}s ad in the "${adStyle}" style.`,
    "A clean storyboard keyframe image is attached separately as framing guidance — use the scenes below as the plan; DO NOT describe panels, grids or storyboards in the prompt.",
    "Translate the scenes into ONE finished, continuous live-action commercial shot. The result must contain NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text; explicitly say so in the prompt.",
    "The FINAL VIDEO must be fully photorealistic live-action — real, lifelike people, NOT animation. State explicitly that the footage is photorealistic, real-camera, live-action.",
    "Describe the EVOLVING shot: camera movement/grammar, subject action across the scenes in order, pacing, lighting/mood.",
    audioDirective,
    "Weave the spoken/voiceover lines into the prompt as native synchronized audio, in scene order, quoting them so the model speaks them.",
    "Frame for 16:9 widescreen (horizontal), composing the action for a landscape frame.",
    "Keep it one flowing cinematic paragraph, filmable in the duration. Return STRICT JSON only.",
  ].join(" ");

  const speakerLabel = adType === "ugc" ? "spoken" : "voiceover";
  const sceneLines = scenes
    .map((s) => {
      const line = `Scene ${s.index} — camera: ${s.cameraAngle}; action: ${s.actionMovement}; ${s.sceneDescription}`;
      return s.transcript?.trim()
        ? `${line}\n  ${speakerLabel}: "${s.transcript.trim()}"`
        : line;
    })
    .join("\n");

  const critiqueBlock = critique
    ? `\n\nA prior attempt was rejected. Fix exactly this: ${critique}`
    : "";

  const user = [
    `Ad prompt: ${userPrompt}`,
    `Ad type: ${adType}`,
    "Storyboard scenes (in order, with their spoken/voiceover lines):",
    sceneLines,
    `Return JSON: { "videoPrompt": "<one cinematic paragraph with camera, motion, mood, and audio (including the spoken lines, in order)>" }`,
    critiqueBlock,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
