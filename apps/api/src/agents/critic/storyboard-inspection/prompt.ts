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
  /** The storyboard sheet to inspect, attached as a vision image (Image 1). */
  sheetRef: ImageRef;
  /** Ground-truth product reference sheet, attached for identity comparison (Image 2). */
  productSheetRef: ImageRef;
  /** Ground-truth person reference sheet, attached when the ad has a person (Image 3). */
  personSheetRef?: ImageRef;
  /** Factual product identity anchor (text) from `runs.product_brief`. */
  productBrief: string;
}

export function buildStoryboardInspectionPrompt({
  adStyle,
  userPrompt,
  scenes,
  hasPerson,
  sheetRef,
  productSheetRef,
  personSheetRef,
  productBrief,
}: StoryboardInspectionPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const product = productBrief.trim();

  // Image order matches the `images: [...]` array below — the model reads them
  // in order, so it must be told which is which.
  const imageLegend = [
    "ATTACHED IMAGES (in order):",
    "- Image 1 = the STORYBOARD SHEET to inspect (the 2×2 keyframe sheet).",
    "- Image 2 = the PRODUCT reference sheet — the GROUND TRUTH for the product.",
    personSheetRef
      ? "- Image 3 = the PERSON reference sheet — the GROUND TRUTH for the person."
      : "",
  ].filter(Boolean);

  const system = [
    "You are the StoryBoard Sheet Inspection skill of an ad-video Critic Agent.",
    "A storyboard/keyframe sheet for a single ~15-second ad is attached, together",
    "with the product (and person) REFERENCE sheets it must match. Judge whether",
    "the storyboard is fit to drive the video step, then return a strict-JSON",
    "verdict. Be strict but fair: only fail on real, visible defects.",
    "",
    ...imageLegend,
    ...(product
      ? [
          "THE PRODUCT IS (authoritative identity — Image 1 must show THIS item):",
          product,
        ]
      : []),
    "",
    "RUBRIC — the sheet must satisfy ALL of:",
    "1. Exactly FOUR equal panels in reading order (2×2: top-left=1,",
    "   top-right=2, bottom-left=3, bottom-right=4).",
    "2. PRODUCT IDENTITY — compare Image 1's product against Image 2 (and the",
    "   product text above). It must be the SAME product in EVERY panel: same",
    "   category/kind of item, same form, materials, colors, proportions and",
    "   on-product markings/text/logos. A storyboard showing a DIFFERENT kind of",
    "   product than the reference (e.g. a bracelet when the reference is a bottle)",
    "   is a `blocking`, `global` issue — say so explicitly in `problem`. The",
    hasPerson
      ? "   person must likewise match Image 3. A PERSON-IDENTITY mismatch — a different apparent GENDER (e.g. a man on screen when the person sheet is a woman), or a different face, age, hair or build than Image 3 — is a `blocking`, `global` issue; say so explicitly in `problem`. The product's marketed gender (a 'men's' / 'women's' item) NEVER excuses a wrong-gender person."
      : "   ad has no person.",
    "   STRAY PROPS: flag (`major`) any invented accessory or prop on the person",
    "   that is NOT in the reference sheets — particularly a stray item the SAME",
    "   color as the product, on or near it, that reads as part of the product",
    "   (e.g. a matching wristband next to a same-color bottle).",
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
    "5. PRODUCT-STATE & PHYSICAL PLAUSIBILITY — the four panels must obey real",
    "   physical causality. If the product changes state in a panel (cap removed,",
    "   lid opened, clasp fastened), every later panel keeps that state. Flag",
    "   (`blocking`) any physically impossible moment — e.g. the person drinking",
    "   from a bottle whose cap is still on, a removed part reappearing, or an item",
    "   shown both open and closed — these reality breaks make the sheet unusable.",
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
      "Image 1 is the storyboard sheet to inspect; Image 2 is the product",
      personSheetRef
        ? "reference sheet; Image 3 is the person reference sheet. Return the verdict."
        : "reference sheet. Return the verdict.",
    ].join("\n"),
    // Order MUST match the legend above: storyboard, product sheet, [person sheet].
    images: personSheetRef
      ? [sheetRef, productSheetRef, personSheetRef]
      : [sheetRef, productSheetRef],
  };

  return [{ role: "system", content: system }, user];
}
