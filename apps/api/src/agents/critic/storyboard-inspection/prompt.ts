// Prompt module for the StoryBoard Sheet Inspection skill (Critic Agent).
//
// The storyboard sheet is attached as a vision image; the LLM judges it against
// the StoryBoard Generator's promises (four ordered panels, product/person
// consistent with the reference sheets, each panel LABELLED with its number
// badge + caption, a coherent ~15s arc) and returns a strict-JSON verdict.
// Issues are scoped per panel via
// `region: "scene_N"`. Storyboard regen is always full (no localized path).

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";

export interface StoryboardInspectionPromptInput {
  adStyle: string;
  userPrompt: string;
  /** Metadata hint from the artifact row (the planned scenes); the image is judged, not this. */
  scenes: unknown;
  hasPerson: boolean;
  /** The storyboard sheet to inspect, attached as a vision image. */
  sheetRef: ImageRef;
}

export function buildStoryboardInspectionPrompt({
  adStyle,
  userPrompt,
  scenes,
  hasPerson,
  sheetRef,
}: StoryboardInspectionPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the StoryBoard Sheet Inspection skill of an ad-video Critic Agent.",
    "A storyboard/keyframe sheet for a single ~15-second ad is attached. Judge",
    "whether it is fit to drive the video step, then return a strict-JSON",
    "verdict. Be strict but fair: only fail on real, visible defects.",
    "",
    "RUBRIC — the sheet must satisfy ALL of:",
    "1. Exactly FOUR equal panels in reading order (2×2: top-left=1,",
    "   top-right=2, bottom-left=3, bottom-right=4).",
    "2. The product (and the person, if present) stays CONSISTENT with the",
    "   reference sheets across every panel — same product, same person, same",
    "   colors and proportions.",
    "3. The four panels form one coherent arc (hook → product → benefit/use →",
    "   payoff) that reads as a single continuous ~15s ad in the requested style.",
    "4. LABELLED PANELS — each of the four panels MUST carry: (a) a legible",
    "   scene-number badge — 01, 02, 03, 04 in reading order (top-left=01 …",
    "   bottom-right=04), and (b) a legible one-line caption bar along its bottom",
    "   describing that shot. A missing, illegible, wrong-number, or out-of-order",
    "   badge/caption is a `major` (or `blocking` if it makes the sheet unusable",
    "   as an ordered shot guide). The panel INTERIORS must otherwise stay pure",
    "   photorealistic keyframes: aside from the number badge and its caption bar,",
    "   there must be NO other text — no extra titles, subtitles, timecodes,",
    "   callouts, hand-drawn marks, logos or watermarks — and NO motion/camera",
    "   arrows anywhere. Stray extra text, garbled lettering or arrows are a defect.",
    hasPerson
      ? "This ad features a person — they must appear and stay consistent."
      : "This ad has no person — do not penalize the absence of one.",
    "",
    "REGIONS: scope each issue to its panel with `region: \"scene_1\"`..",
    '`"scene_4"`. Use `global` for sheet-wide problems (wrong layout, panels out',
    "of order, product inconsistent throughout). Set `localizedRegen` false for",
    "storyboards — they are always regenerated as a whole sheet.",
    "",
    "SEVERITY: `minor` (cosmetic, still usable), `major` (should be fixed),",
    "`blocking` (unusable downstream). `pass` is true only when there are no",
    "`major` or `blocking` issues.",
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "pass": boolean, "localizedRegen": boolean, "issues": [ { "severity": "minor"|"major"|"blocking", "region": "scene_1"|"scene_2"|"scene_3"|"scene_4"|"global", "problem": string, "fixHint": string } ], "summary": string }',
    "`issues` is empty when `pass` is true. `summary` is one short sentence.",
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      `Planned scenes (metadata): ${JSON.stringify(scenes ?? [])}`,
      "The storyboard sheet to inspect is attached. Return the verdict.",
    ].join("\n"),
    images: [sheetRef],
  };

  return [{ role: "system", content: system }, user];
}
