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

import type { AdType, AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";
import { IMAGE_LABEL_BY_RATIO } from "../../../providers/openai/constants.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";

export interface StoryboardPromptInput {
  adStyle: string;
  adType: AdType;
  /**
   * Factual product identity anchor (category / materials / colors / markings)
   * from `runs.product_brief`. Pins what the product IS in TEXT so a drifting
   * reference sheet can't silently swap it for a different item. May be empty
   * (older runs / brief hiccup) — the prompt then falls back to image-only.
   */
  productBrief: string;
  userPrompt: string;
  hasPerson: boolean;
  /** Output aspect ratio — sizes the sheet so it matches the final video frame. */
  aspectRatio: AspectRatio;
  /** Critic feedback from a rejected prior attempt — appended to steer a full regen (F5). */
  critique?: string;
  /**
   * Broken-down USER revision directive (confirm-mode storyboard gate). Takes
   * precedence over `critique` when present — it is the structured form of the
   * user's feedback rather than the Critic's free-text issues.
   */
  directive?: RevisionDirective;
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

/** Render the broken-down user revision directive as explicit instructions. */
function directiveBlock(d: RevisionDirective): string[] {
  const bullets = (items: string[]) => items.map((i) => `  - ${i}`);
  const lines = [
    "",
    "USER REVISION — the user reviewed the previous storyboard and asked for the",
    "following. Author a corrected `imagePrompt` (and script) that applies EXACTLY",
    "these changes while keeping everything else faithful to the reference sheets:",
  ];
  if (d.changes.length) lines.push("CHANGES TO APPLY:", ...bullets(d.changes));
  if (d.keep.length) lines.push("KEEP UNCHANGED:", ...bullets(d.keep));
  if (d.rationale) lines.push(`WHY: ${d.rationale}`);
  return lines;
}

export function buildStoryboardPrompt({
  adStyle,
  adType,
  productBrief,
  userPrompt,
  hasPerson,
  aspectRatio,
  critique,
  directive,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];
  const product = productBrief.trim();

  // TEXT identity anchor — pins what the product IS so a drifting reference
  // sheet can't make the storyboard render a different kind of item.
  const productAnchor = product
    ? [
        "THE PRODUCT IS (authoritative identity — this exact item, nothing else):",
        product,
        "Every panel MUST show THIS product — the same category, form, materials,",
        "colors and markings described above AND shown in the product sheet. If the",
        "product sheet ever looks ambiguous, this text wins: never substitute a",
        "different kind of item. State this product by name in the `imagePrompt`.",
      ]
    : [];

  // Ad-type-specific direction for the script + transcripts.
  const typeBlock =
    adType === "ugc"
      ? [
          "AD TYPE — UGC (user-generated-content review):",
          "- The ad is a REAL PERSON giving an authentic, first-person review /",
          "  testimonial of the product, talking DIRECTLY TO CAMERA as if",
          "  recommending it to a friend. The arc: hook → wearing / using the",
          "  product → a concrete benefit or reaction → a closing recommendation.",
          "- Each scene's `transcript` is the natural, conversational line the",
          "  on-screen person SPEAKS to camera in that scene (first person, ~1",
          "  short sentence, real human speech — not ad copy), referencing the",
          "  product as they WEAR or USE it. Keep lines short and split around the",
          "  action beats; the four lines flow as one continuous spoken review.",
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

  // How the hero product must appear — shared across ad types. Kills the
  // invented-packaging / unboxing / duplicated-product failure modes.
  const presentationBlock = [
    "PRODUCT PRESENTATION — how the product appears in EVERY panel that shows it:",
    "- Show the product the way it is REALLY used. If it is wearable (jewelry,",
    "  bracelet, watch, glasses, apparel, shoes, bag) it is WORN on the person's",
    "  body; if it is handheld or used, it is shown IN ACTIVE USE. Avoid static",
    "  product-on-a-pedestal unless the ad style explicitly calls for it.",
    "- The product is ALWAYS the real, solid item from the product sheet. NEVER",
    "  invent packaging — no boxes, cartons, gift boxes, blister packs, pouches or",
    "  bags — and NEVER stage an unboxing or show the product as a print / photo /",
    "  logo on a box, poster or screen. No \"product box\" anywhere.",
    "- Show EXACTLY ONE instance of the product per panel; never duplicate it (e.g.",
    "  worn AND held at once) unless that is a deliberate, natural beat.",
    "- Do NOT open, unfold, split or transform the product or any container — keep",
    "  it a single solid object with no seams that come apart.",
    "- Both the short `panelCaption` and the detailed `sceneDescription` show the",
    "  product being WORN or USED — the panelCaption as a brief label (e.g. for a",
    '  wearable item "CLOSE-UP. Putting on the product."; for a handheld item',
    '  "CLOSE-UP. Using the product.") and the sceneDescription expanding that same',
    '  moment into full detail — NEVER a "product box", packaging or unboxing. Use',
    "  THIS product (per the identity above), never an example item.",
  ];

  // Ad-type-conditional keyframe rendering. UGC must read as authentic phone
  // footage, not a glossy studio commercial (identity/fidelity is unaffected).
  const keyframeLook =
    adType === "ugc"
      ? [
          "- UGC LOOK — render every panel as an AUTHENTIC, phone-captured moment, NOT",
          "  a glossy studio commercial: natural / available light, a real everyday",
          "  setting, candid handheld-style framing, the person relaxed and real",
          "  (talking to camera where it fits). Keep product/person IDENTITY faithful",
          "  to the reference sheets — only lighting, setting and framing read as real",
          "  UGC, never plastic or over-polished.",
        ]
      : [
          "- CINEMATIC LOOK — render every panel as a polished, cinematic keyframe:",
          "  intentional lighting, rich color and depth, a still lifted straight from a",
          "  high-end commercial.",
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
    ...(product ? [...productAnchor, ""] : []),
    ...typeBlock,
    "",
    ...presentationBlock,
    "",
    "STEP 2 — SCRIPT. Produce exactly FOUR scenes, no more, no less. `index` runs",
    "1, 2, 3, 4 in play order, each scene ~3-4 seconds, together forming one",
    "continuous ~15s arc. For each scene give: a `cameraAngle`, the",
    "`actionMovement` (what moves / how the camera moves), a DETAILED",
    "`sceneDescription`, the spoken `transcript` line described above, and a short",
    "`panelCaption`. The last two are DIFFERENT texts — never the same sentence:",
    "- `sceneDescription` — the rich shot direction for the video step AND the",
    "  text shown to the user. 2-4 full sentences (~40-70 words) covering the",
    "  setting / environment, the lighting & mood, what the subject does, HOW the",
    "  product is worn / used and framed, and the camera framing / motion. Vivid",
    "  and specific; it is handed to the video model, so it MUST be clearly LONGER",
    "  and more detailed than the panelCaption. e.g. (ILLUSTRATIVE STRUCTURE ONLY",
    "  — substitute THIS product and a fitting action) \"Medium close-up in a real",
    "  kitchen, natural daylight from a window camera-left. She holds the product up",
    "  toward the lens and turns it slowly so its markings catch the light, smiling",
    "  as she talks to camera. Handheld phone, slight natural sway.\"",
    "- `panelCaption` — a CONDENSED label for the on-image caption bar: the shot",
    "  type followed by the brief action, ~6-12 words, e.g. \"CLOSE-UP. Turning the",
    "  product so its markings catch the light.\". It describes the SAME moment as",
    "  `sceneDescription`, just shortened to fit the panel; never a different",
    "  action. ALWAYS describe THIS product, never an example item from these notes.",
    "",
    "STEP 3 — STORYBOARD IMAGE (`imagePrompt`). Author the full, self-contained",
    "text-to-image prompt for ONE composite storyboard sheet:",
    "- ONE single image, exactly FOUR equal-size panels in reading order — a",
    "  clean 2×2 grid (top-left=1, top-right=2, bottom-left=3, bottom-right=4)",
    "  with only thin, uniform plain separator borders between panels.",
    `- Output/canvas resolution: ${resolutionLabel}. Render at full detail.`,
    "- Each panel is a clean, photorealistic KEYFRAME for its scene — a still",
    "  frame lifted straight from the finished ad.",
    ...keyframeLook,
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
    `separator borders, the ${resolutionLabel} resolution, the`,
    "product/person fidelity rule, and the PANEL-LABEL rule: each panel carries",
    "its number badge (01–04, in order) and a bottom caption bar reading that",
    "scene's `panelCaption`, with NO other text and NO arrows. It MUST quote the",
    "four `panelCaption` strings verbatim so the image model letters them exactly.",
    "`imagePrompt` MUST also carry the PRODUCT PRESENTATION rule (product worn / in",
    "real use, the real solid item — NEVER a box, packaging or unboxing, never",
    "duplicated, never opened or transformed) and the",
    adType === "ugc"
      ? "authentic UGC phone-captured look (natural light, real setting, candid framing)."
      : "polished cinematic keyframe look.",
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
    ...(directive
      ? directiveBlock(directive)
      : critique?.trim()
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
