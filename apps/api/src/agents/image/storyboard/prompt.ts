// Prompt module for the StoryBoard Generator skill.
//
// The skill REVIEWS the attached product sheet (+ person sheet if present)
// together with the user's prompt, then authors (a) an ordered 4-scene script
// — each scene carrying a spoken `transcript` line and a brief `panelCaption`
// (a condensed form of its `sceneDescription`) — and (b) the text-to-image
// prompt for ONE composite storyboard sheet of FOUR keyframe panels, each
// LABELLED like a real storyboard: a scene-number badge (01–04) plus the short
// caption burned into the panel. The labelled sheet is fed straight to the
// video model as the ordered shot guide; the detailed `sceneDescription` and
// `transcript` ride in the video prompt as text.

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
   * Brief on-image label — a condensed form of `sceneDescription` (shot type +
   * short action, ~6-12 words, e.g. "WIDE SHOT. A damaged robot turns on,
   * surveying the forest."). Burned into the panel as its caption; describes the
   * SAME moment as `sceneDescription`, just shortened to fit the label.
   */
  panelCaption: string;
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
    "`sceneDescription` (richer metadata for the video step), the spoken",
    "`transcript` line described above, and a `panelCaption` — a CONDENSED form",
    "of that same `sceneDescription` for the on-image label: the shot type",
    "followed by the brief action, ~6-12 words, e.g. \"WIDE SHOT. A damaged robot",
    "turns on, surveying the forest.\". The `panelCaption` must describe the SAME",
    "moment as `sceneDescription` — just shortened to fit the panel; never a",
    "different action.",
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
    "PANEL LABELS — REQUIRED on every panel (this is a real storyboard sheet):",
    "- A scene-number BADGE in a top corner of each panel: 01, 02, 03, 04, in",
    "  reading order. Small, clean, legible.",
    "- A one-line CAPTION in a thin legible bar along the BOTTOM of each panel,",
    "  reading EXACTLY the scene's `panelCaption` (shot type + brief action), in",
    "  clean uppercase storyboard lettering — like the supplied example sheet.",
    "- The badge and caption must be crisp and readable, never overlapping the",
    "  subject's face or the product's markings.",
    "Apart from the per-panel number badge and its caption bar, draw NO other",
    "text: no titles, subtitles, timecodes, motion or camera ARROWS, callouts,",
    "hand-drawn marks, logos or watermarks anywhere. Convey motion through the",
    "imagery itself (pose, blur, framing), never with arrows. The panel interiors",
    "stay pure photorealistic keyframes — the only graphics added are the number",
    "badge and the caption bar.",
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "panelCaption": string, "transcript": string, "adStyle": string } ] }',
    "`imagePrompt` MUST itself state the four-panel 2×2 layout with thin plain",
    `separator borders, the ${DEFAULT_IMAGE_RESOLUTION_LABEL} resolution, the`,
    "product/person fidelity rule, and the PANEL-LABEL rule: each panel carries",
    "its number badge (01–04, in order) and a bottom caption bar reading that",
    "scene's `panelCaption`, with NO other text and NO arrows. It MUST quote the",
    "four `panelCaption` strings verbatim so the image model letters them exactly.",
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
    "Review them, then produce the 4-scene script (with spoken transcripts and a",
    "brief panelCaption per scene) and the composite storyboard-sheet plan —",
    "exactly 4 keyframe panels, each LABELLED with its number badge (01–04) and",
    "its panelCaption bar, in order; no other text and no arrows.",
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
