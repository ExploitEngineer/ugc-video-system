// Prompt module for the StoryBoard Generator skill.
//
// The skill REVIEWS the attached product sheet (+ person sheet if present)
// together with the user's prompt, then authors (a) an ordered 4-scene script
// — each scene carrying a spoken `transcript` line — and (b) the text-to-image
// prompt for ONE composite storyboard sheet of FOUR clean keyframe panels with
// NO baked-in text, numbers, captions, or arrows. The scene descriptions and
// transcripts are metadata for the video step; the sheet image stays clean so
// it can be fed to the video model without annotations leaking into the clip.

import type { AdType } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";
import { DEFAULT_IMAGE_RESOLUTION_LABEL } from "../../../providers/openai/constants.js";

export interface StoryboardPromptInput {
  adStyle: string;
  adType: AdType;
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
  /**
   * Spoken line for the scene. UGC → a first-person review line the on-screen
   * person says. Inspirational → a voiceover narration line over the visuals.
   */
  transcript: string;
  adStyle: string;
}

/** Shape the LLM must return as strict JSON. */
export interface StoryboardPlan {
  imagePrompt: string;
  scenes: StoryboardScene[];
}

export function buildStoryboardPrompt({
  adStyle,
  adType,
  userPrompt,
  hasPerson,
  critique,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  // Ad-type-specific direction for the script + transcripts.
  const typeBlock =
    adType === "ugc"
      ? [
          "AD TYPE — UGC (user-generated-content review):",
          "- The ad is a REAL PERSON giving an authentic, first-person review /",
          "  testimonial of the product, talking to camera as if recommending it",
          "  to a friend. The arc: hook → trying/showing the product → a concrete",
          "  benefit or reaction → a closing recommendation.",
          "- Each scene's `transcript` is the natural, conversational line the",
          "  on-screen person SPEAKS in that scene (first person, ~1 short",
          "  sentence, sounds like real human speech — not ad copy). The four",
          "  lines should flow as one continuous spoken review.",
        ]
      : [
          "AD TYPE — Inspirational (open-ended cinematic):",
          "- The ad is an evocative, cinematic scene that follows whatever the",
          "  user describes (mood, journey, lifestyle, story), with the product",
          "  woven in naturally. The arc builds an emotional through-line over",
          "  the ~15s.",
          "- Each scene's `transcript` is a VOICEOVER NARRATION line for that",
          "  scene (evocative, ~1 short sentence), spoken over the visuals — it is",
          "  NOT necessarily lip-synced by anyone on screen. The four lines should",
          "  read as one cohesive voiceover.",
        ];

  const system = [
    "You are the StoryBoard Generator skill of an ad-video Image Agent.",
    "The attached reference sheets are the SINGLE SOURCE OF TRUTH for identity:",
    hasPerson
      ? "a product sheet AND a person sheet are attached."
      : "a product sheet is attached (no person in this ad).",
    "",
    "STEP 1 — REVIEW. First study the attached sheet(s) together with the user's",
    "prompt and the ad style. Note the product (its real form, materials,",
    "markings/text/logos)",
    hasPerson ? "and the person (face, build, wardrobe, palette)," : "",
    "and what the user wants the ad to say.",
    "",
    ...typeBlock,
    "",
    "STEP 2 — SCRIPT. Produce exactly FOUR scenes, no more, no less. `index` runs",
    "1, 2, 3, 4 in play order, each scene ~3-4 seconds, together forming one",
    "continuous ~15s arc. For each scene give: a `cameraAngle`, the",
    "`actionMovement` (what moves / how the camera moves), a vivid",
    "`sceneDescription` (richer metadata for the video step), and the spoken",
    "`transcript` line described above.",
    "",
    "STEP 3 — STORYBOARD IMAGE (`imagePrompt`). Author the full, self-contained",
    "text-to-image prompt for ONE composite storyboard sheet:",
    "- ONE single image, exactly FOUR equal-size panels in reading order — a",
    "  clean 2×2 grid (top-left=1, top-right=2, bottom-left=3, bottom-right=4)",
    "  with only thin, uniform plain separator borders between panels.",
    `- Output/canvas resolution: ${DEFAULT_IMAGE_RESOLUTION_LABEL}. Render at full 4K detail.`,
    "- Each panel is a clean, photorealistic KEYFRAME for its scene — like a",
    "  still frame lifted straight from the finished commercial.",
    "- Keep the product (and the person, if present) faithfully consistent with",
    "  the attached reference sheets in EVERY panel — the SAME product with all",
    "  its real markings, text and logos intact, the same person, same colors,",
    "  materials and proportions. Do not restyle, garble, or invent product text.",
    ...(hasPerson
      ? [
          "- PERSON: render the PERSON photorealistically in EVERY panel — a real,",
          "  lifelike human with natural skin and a realistic face, recognizable",
          "  and consistent with the person sheet (same face, hair, build,",
          "  wardrobe and palette). The product, setting and lighting stay",
          "  photorealistic and faithful to the references too.",
        ]
      : []),
    "",
    "ABSOLUTELY NO ANNOTATIONS — the single most important rule for the image.",
    "The panels must be PURE keyframe imagery, like a clean cinematic frame.",
    "The image must contain NO scene numbers, NO number badges, NO captions, NO",
    "labels, NO titles, NO subtitles, NO timecodes, NO motion or camera arrows,",
    "NO callouts, NO hand-drawn marks, NO logos or watermarks — no text of any",
    "kind drawn anywhere in or over the panels. The ONLY non-photographic element",
    "allowed is the thin plain separator between panels. Convey motion through the",
    "imagery itself (pose, blur, framing), never with arrows or words.",
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "transcript": string, "adStyle": string } ] }',
    "`imagePrompt` MUST itself state the four-panel 2×2 layout with thin plain",
    `separator borders, the ${DEFAULT_IMAGE_RESOLUTION_LABEL} resolution, the`,
    "product/person fidelity rule, and the NO-ANNOTATION / no-text-of-any-kind /",
    "no-arrows rule.",
    ...(hasPerson
      ? [
          "The `imagePrompt` MUST also explicitly instruct the image model to",
          "render the person photorealistically (a real, lifelike human with a",
          "realistic face and skin) in every panel, faithful to the person sheet,",
          "while keeping the product realistic and faithful to the product sheet.",
        ]
      : []),
    "`scenes` MUST have exactly 4 entries, in order. Set every scene's `adStyle`",
    `to "${style}".`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Ad style: ${style}`,
    `Ad type: ${adType}`,
    `User prompt: ${userPrompt}`,
    "The reference sheets are attached in the image-generation step.",
    "Review them, then produce the 4-scene script (with spoken transcripts) and",
    "the composite storyboard-sheet plan — exactly 4 clean keyframe panels with",
    "NO text, numbers, captions, or arrows anywhere in the image.",
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
