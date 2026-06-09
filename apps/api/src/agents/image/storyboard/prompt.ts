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
import type { ProductUse } from "../../types.js";
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
  /**
   * Causal use-sequence for THIS product (from `runs.product_use`). When
   * present, it is the authoritative sequence the four panels are built around
   * (prep → use + function, persisted). Absent (older runs / no-prep products /
   * vision hiccup) → the planner derives the sequence itself, as before.
   */
  productUse?: ProductUse;
  /**
   * Product-derived person description (`runs.person_brief`) — demographics,
   * wardrobe, palette. Used to tailor the spoken lines to who is on camera.
   * Empty when a person was uploaded (no text brief) or there is no person.
   */
  personBrief: string;
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
   * short action, ~8-14 words, e.g. "WIDE SHOT. A damaged robot turns on,
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
  productUse,
  personBrief,
  userPrompt,
  hasPerson,
  aspectRatio,
  critique,
  directive,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];
  const product = productBrief.trim();
  const person = personBrief.trim();

  // Authoritative causal use-sequence fields (empty-string safe). `hasUse` gates
  // the whole known-sequence path; `hasPrep` gates the prep/persist lines (false
  // for already-worn products so no fake prep step is invented).
  const accessVerb = productUse?.accessVerb?.trim() ?? "";
  const changedState = productUse?.changedState?.trim() ?? "";
  const persistenceCue = productUse?.persistenceCue?.trim() ?? "";
  const functionSignal = productUse?.functionSignal?.trim() ?? "";
  const useVerb = productUse?.useVerb?.trim() ?? "";
  const hasUse = Boolean(useVerb);
  const hasPrep = Boolean(accessVerb);

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

  // CHARACTER ANCHOR — lock the on-screen person's apparent identity (gender,
  // age, hair) and keep it 100% constant across all four scenes/captions/
  // transcripts. For uploaded persons personBrief is empty, so this also tells
  // the model to DERIVE the gender from the attached person sheet and lock it.
  const characterAnchor = hasPerson
    ? [
        "CHARACTER ANCHOR (the on-screen person — lock this and keep it 100%",
        "constant across ALL FOUR scenes, captions and transcripts):",
        person
          ? "- From the attached PERSON SHEET (authoritative), plus the person brief below, read and FIX the person's apparent"
          : "- From the attached PERSON SHEET (authoritative) read and FIX the person's apparent",
        "  GENDER PRESENTATION, approximate age range, hair (length / color /",
        "  style), skin tone and build.",
        ...(person ? [`- Person brief: ${person}`] : []),
        "- Use the SAME person in every panel — the SAME apparent gender, face,",
        "  hair, build and wardrobe. NEVER change the person's gender, age, face,",
        "  hair or wardrobe between panels, and never introduce a different person.",
        "- Use CONSISTENT, CORRECT pronouns matching that apparent gender in every",
        "  `sceneDescription`, `panelCaption` and `transcript`: if the person reads",
        "  female use she/her throughout, if male he/him — do not switch mid-script.",
        "- The PRODUCT's marketed gender or category (e.g. a \"men's\" watch, a",
        "  \"women's\" product) does NOT determine the wearer's gender — the",
        "  on-screen person's gender comes ONLY from the person sheet / brief above;",
        "  anyone can authentically present any product. NEVER let a gendered",
        "  product brief flip the person's apparent gender.",
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

  // Script grounding — forces the four spoken lines to be specific to THIS
  // product, THIS person and THIS scene, and to never repeat. Kills the
  // generic, interchangeable filler ("I love this", "you'll love it") that
  // appears when the model has no concrete anchor.
  const speaker = adType === "ugc" ? "the on-screen person" : "the voiceover";
  const scriptGrounding = [
    "SCRIPT GROUNDING — the four `transcript` lines MUST be concrete and specific:",
    product
      ? `- Talk about THIS product specifically — ${product} Name or clearly evoke it; never a generic "this" with no anchor. Do NOT invent a brand, price or feature that isn't supported by the product or the user's prompt.`
      : "- Talk about THIS specific product (per the product sheet); never a generic, interchangeable line that would fit any product.",
    "- Each line carries a DIFFERENT, scene-specific beat — a distinct concrete",
    "  benefit, feature, use-moment or reaction tied to what that panel shows.",
    "  Across the four lines: hook → product-in-use → a concrete benefit/reaction",
    "  → a closing line. No two lines may repeat the same idea or phrasing.",
    "- BANNED filler unless the user's prompt truly calls for it: empty hype with",
    '  no specifics like "I love this", "you\'ll love it", "this is amazing",',
    '  "game changer", "obsessed", "10/10", "must-have". Replace with a concrete,',
    "  product-specific detail instead.",
    hasPerson
      ? `- Fit the wording, vocabulary and tone to the on-screen person from the CHARACTER ANCHOR${person ? ` (${person})` : ""} — ${speaker} should sound like that real individual, with the correct gender, and never a brand script.`
      : `- Make the wording sound like a real, specific human (${speaker}), not interchangeable ad copy.`,
    "- The lines must match what the matching panel actually shows (the same",
    "  action / setting), so the spoken script and the keyframes stay in sync.",
  ];

  // How the hero product must appear — shared across ad types. Kills the
  // invented-packaging / unboxing / duplicated-product failure modes.
  const presentationBlock = [
    "PRODUCT PRESENTATION — how the product appears in EVERY panel that shows it:",
    "- Show the product the way it is REALLY used. If it is wearable (jewelry,",
    "  bracelet, watch, glasses, apparel, shoes, bag) it is WORN on the person's",
    "  body; if it is handheld or used, it is shown IN ACTIVE USE. Avoid static",
    "  product-on-a-pedestal unless the ad style explicitly calls for it.",
    "- TRUE-TO-LIFE SCALE & PLACEMENT: render the product at its real-world size",
    "  relative to the hand / body / face (a ring is finger-sized, glasses",
    "  face-sized, a bottle hand-sized). NEVER oversize it to dominate the frame,",
    "  NEVER shrink it to a speck. Place it ONLY where it would really be — worn on",
    "  the correct body part, or held naturally in the hand — never floating,",
    "  hovering detached, or somewhere it physically could not sit.",
    "- The product is ALWAYS the real, solid item from the product sheet. NEVER",
    "  invent packaging — no boxes, cartons, gift boxes, blister packs, pouches or",
    "  bags — and NEVER stage an unboxing or show the product as a print / photo /",
    '  logo on a box, poster or screen. No "product box" anywhere.',
    "- Show EXACTLY ONE instance of the product per panel; never duplicate it (e.g.",
    "  worn AND held at once) unless that is a deliberate, natural beat.",
    "- Do NOT open, unfold, split or transform the product or any container — keep",
    "  it a single solid object with no seams that come apart.",
    "- PRODUCT-STATE CONTINUITY: keep the product's physical state causal and",
    "  consistent across the four panels per the use-sequence in STEP 1.5 — a",
    "  state-change (a cap unscrewed, a lid flipped) persists and never reverts,",
    "  and no panel shows a physically impossible moment.",
    "- Show ONLY the product and the person's own wardrobe from the reference",
    "  sheets. Do NOT invent extra accessories, props or objects, and do NOT place",
    "  any other item — especially one in the SAME COLOR as the product (e.g. a",
    "  matching wristband or band) — on or near it, where it could read as part of",
    "  the product. Keep the product visually distinct and unmistakable.",
    "- Both the short `panelCaption` and the detailed `sceneDescription` show the",
    "  product being WORN or USED — the panelCaption as a brief label (e.g. for a",
    '  wearable item "CLOSE-UP. Putting on the product."; for a handheld item',
    '  "CLOSE-UP. Using the product.") and the sceneDescription expanding that same',
    '  moment into full detail — NEVER a "product box", packaging or unboxing. Use',
    "  THIS product (per the identity above), never an example item.",
  ];

  // Causal use-sequence planning — the load-bearing fix for physically
  // impossible beats (e.g. "drinking with the cap on"). Forces the planner to
  // work out how THIS product is really operated, then lay the four panels out
  // as one causal sequence with persistent state. Derived per-product from the
  // sheet + brief (no hard-coded list), so it generalises to any product.
  // When a known use-sequence was derived for THIS product, state it as the
  // authoritative spine the panels are built around; otherwise fall back to
  // asking the planner to work it out. Either way the ordering + persistence
  // rules below are the load-bearing fix for physically impossible beats.
  const knownSequenceBlock = hasUse
    ? [
        "KNOWN USE-SEQUENCE FOR THIS PRODUCT (authoritative — derived from the",
        "product itself; build the four panels around it, never contradict it):",
        hasPrep
          ? `- PREP first, in an EARLIER panel than the use: the person ${accessVerb} → ${changedState}.`
          : "- This product needs NO prep to use — do NOT invent one (no cap, lid, clasp or cover to undo before use).",
        `- USE: the person ${useVerb} the product, and it visibly works — ${functionSignal}.`,
        ...(hasPrep
          ? [
              `- PERSIST: in EVERY panel after the prep, ${persistenceCue} — the changed state never reverts.`,
            ]
          : []),
        "- NAME this product state in the matching `panelCaption` and `sceneDescription`.",
        "",
      ]
    : [];
  const useSequenceBlock = [
    "STEP 1.5 — PLAN THE USE-SEQUENCE (do this BEFORE writing the scenes):",
    ...knownSequenceBlock,
    hasUse
      ? "- Lay the four panels out as that causal sequence in time."
      : "- Work out how THIS product (per the identity above + the product sheet) is REALLY operated by a real person — what is touched, moved, opened, worn or pressed, and in what order — then lay the four panels out as that causal sequence in time.",
    "- Any prerequisite state-change (a cap unscrewed, a lid flipped, a clasp",
    "  undone, a cover removed) MUST happen in an EARLIER panel than the action",
    "  that needs it — never depict the use before its prep. Once the state",
    "  changes it PERSISTS in every later panel and never silently reverts.",
    "- In any panel where a use-action changes the product, NAME that state in",
    '  BOTH the `sceneDescription` and the `panelCaption`. NEVER show a physically',
    "  impossible moment (drinking through a closed cap, an item both open and",
    "  closed at once).",
  ];

  // Ad-type-conditional keyframe rendering. UGC must read as authentic phone
  // footage, not a glossy studio commercial (identity/fidelity is unaffected).
  const keyframeLook =
    adType === "ugc"
      ? [
          "- UGC LOOK — render every panel as an AUTHENTIC, phone-captured moment, NOT",
          "  a glossy studio commercial: natural / available light from real windows",
          "  or lamps, a real lived-in everyday setting with ordinary background",
          "  detail, candid handheld-style framing, the person relaxed and real",
          "  (talking to camera where it fits) with TRUE skin texture — visible pores,",
          "  fine lines, natural hair flyaways, NOT smoothed, waxy, airbrushed or an",
          "  uncanny AI face. Keep product/person IDENTITY faithful to the reference",
          "  sheets — only lighting, setting and framing read as real UGC, never",
          "  plastic, never over-polished, no glossy magazine retouch or HDR sheen.",
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
    ...(characterAnchor.length ? [...characterAnchor, ""] : []),
    ...typeBlock,
    "",
    ...scriptGrounding,
    "",
    ...useSequenceBlock,
    "",
    ...presentationBlock,
    "",
    "STEP 2 — SCRIPT. Produce exactly FOUR scenes, no more, no less. `index` runs",
    "1, 2, 3, 4 in play order, each scene ~3-4 seconds, together forming one",
    "continuous ~15s arc. For each scene give: a `cameraAngle`, the",
    "`actionMovement` (what moves / how the camera moves), a DETAILED",
    "`sceneDescription`, the spoken `transcript` line described above, and a short",
    "`panelCaption`. The last two are DIFFERENT texts — never the same sentence:",
    "- `sceneDescription` — ONE tight, concrete sentence (~15-30 words): the",
    "  setting, the key action, and what the PRODUCT visibly DOES to show it is",
    "  genuinely working (substitute THIS product's real motion — a watch's hand",
    "  sweeping; a cap twisted off and the liquid level dropping; a shoe flexing).",
    "  Keep it LEAN — no padding, no second/extra clauses; richer than the",
    "  panelCaption but close to it in spirit. It feeds the video step, which does",
    "  BETTER with short, focused direction than long paragraphs — do NOT write a",
    "  paragraph. Match the panel, the real product (per the identity above) and",
    "  the real person with correct, consistent pronouns (see CHARACTER ANCHOR).",
    '  e.g. (STRUCTURE ONLY — substitute THIS product) "Medium close-up in a sunlit',
    '  kitchen; she sips from the bottle, cap off in her other hand, water level dropping."',
    "- `panelCaption` — the on-image caption-bar label, in the MANDATORY format",
    "  `<SHOT TYPE>. <concrete action that NAMES the product>`. The shot-type",
    "  prefix is REQUIRED on every caption (WIDE SHOT / MEDIUM SHOT / MEDIUM",
    "  CLOSE-UP / CLOSE-UP / EXTREME CLOSE-UP / OVER-THE-SHOULDER / POV), then a",
    "  period, then a vivid action that names or unmistakably evokes THIS product",
    '  (never a bare "it" / "this"). ~8-14 words. It describes the SAME moment as',
    "  `sceneDescription`, just shortened to fit the panel; never a different",
    "  action, and never an example item from these notes. GOOD (structure only —",
    "  substitute THIS product, do not copy the noun):",
    '  "MEDIUM SHOT. Smiling as she holds up the [product] to camera.",',
    '  "CLOSE-UP. Sliding the [product] onto her wrist by the window.",',
    '  "MEDIUM CLOSE-UP. Talking to camera while wearing the [product].".',
    '  REJECTED: "Picks up the sunglasses." (no shot-type prefix) and "Smiles and',
    '  turns his head." (no product named) — never emit captions like these.',
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
          "- PERSON: the attached PERSON SHEET IMAGE is the AUTHORITATIVE source for",
          "  the on-screen person's gender, face and identity in EVERY panel — if",
          "  anything in this prompt's wording ever conflicts with the sheet, the",
          "  SHEET WINS. Render that EXACT individual photorealistically: a real,",
          "  lifelike human with natural skin and a realistic face, the SAME face,",
          "  hair, build, wardrobe, palette, apparent gender and identity as the",
          "  sheet in all four panels (per the CHARACTER ANCHOR) — same facial",
          "  structure, features and proportions; do NOT beautify, restyle, age,",
          "  swap gender, or render a lookalike or a different person. The product,",
          "  setting and lighting stay photorealistic and faithful to the",
          "  references too.",
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
    "Apart from the per-panel number badge and its caption bar, add NO other",
    "graphics of ANY kind: no titles, subtitles, timecodes, motion or camera",
    "ARROWS, callouts, hand-drawn marks, logos or watermarks, and NO stray boxes,",
    "bars, rectangles, color blocks, framing brackets, vignettes or",
    "panels-within-a-panel anywhere. Convey motion through the imagery itself",
    "(pose, blur, framing), never with arrows. Panel interiors stay pure,",
    "uninterrupted photographs — the ONLY non-photographic marks on the whole",
    "sheet are the four number badges and the four caption bars.",
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "panelCaption": string, "transcript": string, "adStyle": string } ] }',
    "`imagePrompt` is ONE self-contained paragraph, roughly 150-200 words — long",
    "enough to be specific, but NOT a rule restatement. It MUST cover: the 2×2",
    "four-panel layout with thin",
    `plain separator borders at ${resolutionLabel}; each panel's number badge`,
    "(01–04, in order) + a thin uppercase storyboard-style bottom caption bar",
    "(the EXACT caption text is appended after your prompt automatically — so",
    "describe the bar's STYLE and placement only; do NOT write the caption words",
    'yourself, and do NOT add a "quote the panelCaption" meta-instruction); NO',
    "other text and NO arrows; the product worn / in real use as",
    "the real solid item at TRUE real-world scale and correctly placed (never",
    "oversized, dominating or floating; never a box/packaging/unboxing, never",
    "duplicated); each panel showing the product in its CORRECT causal state from",
    hasUse
      ? `the use-sequence (${hasPrep ? `${changedState} once the person ${accessVerb}, and it visibly works — ${functionSignal}` : `the product visibly working — ${functionSignal}`}), the state persistent across panels;`
      : "the use-sequence (e.g. cap removed and held in the other hand when drinking);",
    "and",
    adType === "ugc"
      ? "the authentic UGC phone-captured look (natural light, real setting, candid framing)."
      : "the polished cinematic keyframe look.",
    hasPerson
      ? "It MUST also state the SAME person is rendered photorealistically (real, lifelike face and skin) with consistent apparent gender and identity in every one of the four panels, faithful to the person sheet."
      : "",
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
