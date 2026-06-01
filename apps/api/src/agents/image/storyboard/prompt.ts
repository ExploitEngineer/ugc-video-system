// Prompt module for the StoryBoard Generator skill.
//
// Takes the product sheet (+ person sheet if present) and emits the image
// prompt for a single COMPOSITE storyboard/keyframe sheet — exactly four clean
// panels, each with only a scene number, motion arrows, and a tiny caption —
// plus the ordered list of 4 scenes, each tagged with the ad style for
// downstream video prompting.

import type { ChatMessage } from "../../../providers/openai/index.js";
import { DEFAULT_IMAGE_RESOLUTION_LABEL } from "../../../providers/openai/constants.js";

export interface StoryboardPromptInput {
  adStyle: string;
  userPrompt: string;
  hasPerson: boolean;
  /** Critic feedback from a rejected prior attempt — appended to steer a full regen (F5). */
  critique?: string;
}

export interface StoryboardScene {
  index: number;
  cameraAngle: string;
  actionMovement: string;
  sceneDescription: string;
  adStyle: string;
}

/** Shape the LLM must return as strict JSON. */
export interface StoryboardPlan {
  imagePrompt: string;
  scenes: StoryboardScene[];
}

export function buildStoryboardPrompt({
  adStyle,
  userPrompt,
  hasPerson,
  critique,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the StoryBoard Generator skill of an ad-video Image Agent.",
    "You turn the attached reference sheets into ONE composite storyboard sheet",
    "that maps out a single ~15-second ad, then author the final text-to-image",
    "prompt for it.",
    "",
    "SCENES: exactly FOUR scenes, no more, no less. `index` runs 1, 2, 3, 4 in",
    "play order, each scene ~3-4 seconds, together forming one continuous arc",
    "(hook → product → benefit/use → payoff) for the ~15s ad.",
    "",
    "THE SHEET (describe all of this inside `imagePrompt`):",
    "- ONE single image, exactly FOUR equal-size panels in reading order —",
    "  a clean 2×2 grid (top-left=1, top-right=2, bottom-left=3, bottom-right=4)",
    "  with thin, uniform plain separator borders between panels.",
    `- Output/canvas resolution: ${DEFAULT_IMAGE_RESOLUTION_LABEL}. Render at full 4K detail.`,
    "- Each panel is the keyframe illustration for that scene.",
    "- Keep the product (and the person, if present) faithfully consistent with",
    "  the attached reference sheets in EVERY panel — the SAME product with all",
    "  its real markings, text and logos intact, the same person, same colors,",
    "  materials and proportions. Do not restyle, garble, or invent product text.",
    ...(hasPerson
      ? [
          "- PERSON: render the PERSON photorealistically in EVERY panel — a real,",
          "  lifelike human with natural skin and a realistic face, recognizable",
          "  and consistent with the person sheet (same face, hair, build,",
          "  wardrobe and palette). The product, setting, lighting and everything",
          "  else stays PHOTOREALISTIC and faithful to the references too.",
        ]
      : []),
    "",
    "PANEL ANNOTATIONS — keep it MINIMAL, like a clean classic storyboard. Each",
    "panel shows ONLY:",
    "  1. a small scene-number badge (1-4) in a corner,",
    "  2. simple motion/camera arrows drawn over the keyframe to show movement",
    "     or camera direction,",
    "  3. ONE short caption line of a few words at the bottom of the panel.",
    "Nothing else: no paragraphs, no dense notes, no timecodes, no extra labels,",
    "no logos or watermarks. The keyframe image dominates each panel.",
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    hasPerson
      ? "A product sheet AND a person sheet are attached as references — feature both."
      : "A product sheet is attached as a reference (no person in this ad).",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "adStyle": string } ] }',
    "`imagePrompt` is the full, self-contained prompt for the image model and",
    "MUST itself state the four-panel 2×2 layout with thin separator borders, the",
    `${DEFAULT_IMAGE_RESOLUTION_LABEL} resolution, the product/person fidelity rule,`,
    "and the minimal-annotation rule (number + arrows + one tiny caption per",
    "panel).",
    ...(hasPerson
      ? [
          "The `imagePrompt` MUST also explicitly instruct the image model to",
          "render the person photorealistically (a real, lifelike human with a",
          "realistic face and skin) in every panel, faithful to the person sheet,",
          "while keeping the product realistic and faithful to the product sheet.",
        ]
      : []),
    "`scenes` MUST have exactly",
    "4 entries, in order; the `sceneDescription` is richer metadata for the",
    "video step (NOT all drawn on the panel). Set every scene's `adStyle` to",
    `"${style}".`,
  ].join("\n");

  const user = [
    `Ad style: ${style}`,
    `User prompt: ${userPrompt}`,
    "The reference sheets are attached in the image-generation step.",
    "Produce the composite storyboard sheet plan — exactly 4 panels, each with",
    "only a scene number, motion arrows, and one tiny caption.",
    ...(critique?.trim()
      ? [
          "",
          "PREVIOUS ATTEMPT WAS REJECTED by the Critic. Author a corrected",
          "`imagePrompt` that fixes these issues while keeping everything else:",
          critique.trim(),
        ]
      : []),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
