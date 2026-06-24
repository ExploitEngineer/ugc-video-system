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

import type { AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";
import { IMAGE_LABEL_BY_RATIO } from "../../../providers/openai/constants.js";
import type { ProductUse } from "../../types.js";
import { getAdType } from "../../ad-types/registry.js";
import { lookBase } from "../../ad-types/fragments/looks.js";
import { buildFragmentCtx } from "../../ad-types/fragment-ctx.js";
import { hookOpening } from "../../ad-types/hooks/compose.js";
import type { HookSelection } from "../../ad-types/types.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";

export interface StoryboardPromptInput {
  adStyle: string;
  /** OPEN ad-type id — dispatched through the ad-type registry for per-type fragments. */
  adType: string;
  /** Resolved hook selection (Chunk E); its opening directive is spliced into scene 1 only. */
  hooks?: HookSelection;
  /** Whether a product is present (storyboard always has a product sheet → defaults true). */
  hasProduct?: boolean;
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
  // ── 60s segment continuity (absent ⇒ single-sheet 15s behavior) ──
  /** This sheet's segment position in a 60s run (0..3). */
  segmentIndex?: number;
  /** This segment's own brief from the narrative outline. */
  segmentSummary?: string;
  /** The OTHER three segments' summaries, for cross-segment continuity. */
  otherSummaries?: string[];
  /**
   * MULTI-SEGMENT ONE-MASTER mode. When true, this single sheet IS the whole
   * multi-segment storyboard: N×4 panels in an N-row grid (row-major) of ONE
   * continuous coherent scene, not the 4-panel 15s sheet. The arc is authored
   * from the user prompt + briefs directly (no per-segment summaries).
   * `segmentIndex` / `segmentSummary` / `otherSummaries` are NOT used. Falsy ⇒
   * the 15s sheet. Pair with `segmentCount` (rows) to size the grid.
   */
  full60s?: boolean;
  /**
   * Master-mode segment rows (2/3/4 for 30/45/60s) → an N×4 master grid
   * (8/12/16 panels). Ignored when `full60s` is falsy. Defaults to 4.
   */
  segmentCount?: number;
  /**
   * Multi-segment only — the locked visual-style bible (`runs.visual_style`).
   * Injected VERBATIM (identical string across all segment storyboards AND video
   * prompts) so the whole ad shares one grade/lens/lighting/palette.
   */
  visualStyle?: string;
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
  hooks,
  hasProduct,
  productBrief,
  productUse,
  personBrief,
  userPrompt,
  hasPerson,
  aspectRatio,
  critique,
  directive,
  segmentIndex,
  segmentSummary,
  otherSummaries,
  visualStyle,
  full60s,
  segmentCount,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];
  const product = productBrief.trim();
  const person = personBrief.trim();

  // Ad-type registry dispatch (Chunk F): the per-type / per-look prompt fragments
  // replace the old `adType === "ugc"` ternaries. Legacy ids resolve via aliases,
  // so a `ugc`/`inspirational` run is byte-identical.
  const def = getAdType(adType);
  const fctx = buildFragmentCtx({
    adStyle: style,
    productBrief,
    personBrief,
    hasProduct: hasProduct ?? true, // a storyboard always has a product sheet
    hasPerson,
    hooks,
    duration: (segmentCount ?? 1) * 15,
    segmentIndex,
    segmentCount,
  });

  // ── MULTI-SEGMENT ONE-MASTER mode (full60s): this single sheet is the WHOLE
  // multi-segment storyboard — N×4 panels in an N-row grid of ONE continuous
  // coherent scene. The 15s path (full60s falsy) keeps its 4-panel 2×2 sheet
  // byte-for-byte; every master divergence is isolated in the fragments below. ──
  const isMaster = Boolean(full60s);

  // Master grid geometry, sized by the run's segment count (rows × 4 panels).
  const rows = segmentCount ?? 4;
  const totalPanels = rows * 4; // PANELS_PER_SEGMENT = 4
  const totalSec = rows * 15;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const lastBadge = pad2(totalPanels);
  const NUM_WORD: Record<number, string> = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    8: "eight",
    12: "twelve",
    16: "sixteen",
  };
  const rowsWord = NUM_WORD[rows] ?? String(rows);
  const totalWordLower = NUM_WORD[totalPanels] ?? String(totalPanels);
  const totalWordUpper = totalWordLower.toUpperCase();
  // "row 1 = panels 01-04 left→right, row 2 = 05-08, …" — the master's row map.
  const rowMap = Array.from({ length: rows }, (_, r) => {
    const span = `${pad2(r * 4 + 1)}-${pad2(r * 4 + 4)}`;
    return r === 0
      ? `row 1 = panels ${span} left→right`
      : `row ${r + 1} = ${span}`;
  }).join(", ");
  // "panels 1-4, 5-8, …" — the per-segment ~15s timing stretches.
  const stretchMap = Array.from(
    { length: rows },
    (_, r) => `${r * 4 + 1}-${r * 4 + 4}`,
  ).join(", ");
  // Word budget scales with panel count (~16-20 words/panel).
  const masterWords =
    ({ 8: "140-200", 12: "190-260", 16: "240-320" } as Record<number, string>)[
      totalPanels
    ] ?? "240-320";

  // STEP 2 opener — N×4 scenes of ONE continuous scene vs the 15s 4.
  const scriptStep = isMaster
    ? [
        `STEP 2 — SCRIPT. Produce exactly ${totalWordUpper} scenes, no more, no less. \`index\``,
        `runs 1..${totalPanels} in play order — ONE continuous ~${totalSec}-second take of a SINGLE`,
        "coherent scene (see ONE CONTINUOUS SCENE below), split only for timing into",
        `${rowsWord} ~15s stretches (panels ${stretchMap}), each panel ~3-4s. Keep`,
        `the SAME place, person, wardrobe, product and look across all ${totalWordLower}; only`,
        "the SHOT and the small moment change. For each scene give: a `cameraAngle`,",
        "the `actionMovement` (what moves / how the camera moves), a DETAILED",
        "`sceneDescription`, the spoken `transcript` line described above, and a short",
        "`panelCaption`. The last two are DIFFERENT texts — never the same sentence:",
      ]
    : [
        "STEP 2 — SCRIPT. Produce exactly FOUR scenes, no more, no less. `index` runs",
        "1, 2, 3, 4 in play order, each scene ~3-4 seconds, together forming one",
        "continuous ~15s arc. For each scene give: a `cameraAngle`, the",
        "`actionMovement` (what moves / how the camera moves), a DETAILED",
        "`sceneDescription`, the spoken `transcript` line described above, and a short",
        "`panelCaption`. The last two are DIFFERENT texts — never the same sentence:",
      ];

  // STEP 3 layout — N×4 grid vs the 15s 2×2.
  const gridLayout = isMaster
    ? [
        `- ONE single image, exactly ${totalWordUpper} equal-size panels in a clean ${rows}×4 grid`,
        `  (${rows} rows × 4 columns), ROW-MAJOR reading order: ${rowMap} — with only thin,`,
        "  uniform plain separator borders between panels.",
      ]
    : [
        "- ONE single image, exactly FOUR equal-size panels in reading order — a",
        "  clean 2×2 grid (top-left=1, top-right=2, bottom-left=3, bottom-right=4)",
        "  with only thin, uniform plain separator borders between panels.",
      ];

  // Distinct-SHOTS rule — variety must come from the CAMERA + moment, NOT from
  // changing the world (which would re-introduce the scene-jumping). 15s ⇒ empty.
  const antiRepetition = isMaster
    ? [
        "- Make every panel a DISTINCT SHOT of the SAME continuous scene: vary the",
        "  camera angle, shot type, framing and the small moment/action across panels",
        "  (wide / medium / close, different angles, a beat later). Do NOT repeat a",
        "  near-identical frame — but do NOT change the location, outfit, lighting or",
        "  time-of-day to create variety; the variety is in the CAMERA and the moment,",
        "  never the world.",
      ]
    : [];

  // graphic_text panels ARE the finished ad frames (kinetic typography), so the
  // production annotations (number badge + descriptive bottom caption bar) must
  // NOT be burned in — they read as an unfinished "storyboard", not an ad, and
  // then leak into the video. Every other look is a real storyboard sheet that
  // keeps its badge + caption bar (the video step now strips them at render).
  // graphic_text was removed (ad-gen refactor); no surviving type is a clean
  // graphic sheet, so this is always false. The dead graphic branches it gates
  // are pruned in the Chunk 6 storyboard rework.
  const cleanGraphic = false;

  // PANEL LABELS badge range — 01..N×4 vs 01..04. Suppressed for graphic_text.
  const labelBadge = isMaster
    ? [
        `- A scene-number BADGE in a top corner of each panel: 01 through ${lastBadge}, in`,
        "  ROW-MAJOR reading order. Small, clean, legible.",
      ]
    : [
        "- A scene-number BADGE in a top corner of each panel: 01, 02, 03, 04, in",
        "  reading order. Small, clean, legible.",
      ];

  // Panel-labelling block — graphic_text gets clean finished frames (no badge,
  // no caption bar); every other look keeps the storyboard badge + a SINGLE
  // uniform caption-bar style across all panels (fixes per-panel colour drift).
  const panelLabelBlock = cleanGraphic
    ? [
        "PANEL FRAMES — each of the 4 panels is a FINISHED, self-contained graphic",
        "frame (broadcast-ready), separated only by thin plain gutters: NO number",
        "badge, NO bottom caption bar, NO shot-type label, NO meta/description text.",
        "The frame's OWN kinetic typography (headline, stat, code, CTA) is the only",
        "text and must be rendered VERBATIM and perfectly legible. Add NO arrows,",
        "callouts, timecodes, watermarks, framing brackets or panels-within-a-panel",
        "— just the four clean designed frames.",
      ]
    : [
        "PANEL LABELS — REQUIRED on every panel (this is a real storyboard sheet):",
        ...labelBadge,
        "- A one-line CAPTION in a thin legible bar along the BOTTOM of each panel,",
        "  reading EXACTLY the scene's `panelCaption` (shot type + brief action), in",
        "  clean uppercase storyboard lettering — like the supplied example sheet.",
        "- ALL FOUR caption bars share ONE identical style: the SAME single colour,",
        "  opacity, height and font on every panel — never a different colour per",
        "  panel. The badge and caption stay crisp and readable, never overlapping",
        "  the subject's face or the product's markings.",
        "Apart from the per-panel number badge and its caption bar, add NO other",
        "graphics of ANY kind: no titles, subtitles, timecodes, motion or camera",
        "ARROWS, callouts, hand-drawn marks, logos or watermarks, and NO stray boxes,",
        "bars, rectangles, color blocks, framing brackets, vignettes or",
        "panels-within-a-panel anywhere. Convey motion through the imagery itself",
        "(pose, blur, framing), never with arrows. Panel interiors stay pure,",
        "uninterrupted photographs — the ONLY non-photographic marks on the whole",
        "sheet are the four number badges and the four caption bars.",
      ];

  // Closing JSON-spec fragments (word budget, layout phrase, badge range, count).
  const imagePromptWords = isMaster ? masterWords : "150-200";
  const layoutPhrase = isMaster
    ? `the ${rows}×4 ${totalWordLower}-panel layout (row-major 01-${lastBadge}, all panels visually distinct) with thin`
    : "the 2×2 four-panel layout with thin";
  const badgeRangePhrase = isMaster
    ? `(01–${lastBadge}, in order)`
    : "(01–04, in order)";
  const scenesCountLine = isMaster
    ? `\`scenes\` MUST have exactly ${totalPanels} entries, in order. Set every scene's \`adStyle\``
    : "`scenes` MUST have exactly 4 entries, in order. Set every scene's `adStyle`";

  // Master: the N×4 panels are ONE coherent continuous scene (no per-segment
  // summaries — the arc is authored from the user prompt + briefs).
  const coherentSceneBlock = isMaster
    ? [
        "",
        `ONE CONTINUOUS SCENE — these ${totalWordLower} panels are a SINGLE ~${totalSec}-second take of`,
        `ONE coherent scene, NOT ${totalWordLower} different scenes. Across ALL ${totalWordLower} keep the`,
        "SAME person, the SAME wardrobe and hair, the SAME product, the SAME location",
        "and the SAME lighting/look. A gentle, natural progression is fine (one real",
        "moment unfolding in one place — e.g. the same room as the light shifts a",
        "little), but NEVER cut to a different place, outfit, time-of-day or set",
        `between panels. Panels 1→${totalPanels} flow as ONE continuous shoot of the SAME scene;`,
        "only the CAMERA (shot type, angle, distance) and the small moment/action move",
        "from panel to panel. Build this arc from the user's prompt and the product —",
        "do NOT split it into separate vignettes.",
        ...(def.lookFamily === "ugc_authentic"
          ? [
              "Because this is UGC, the continuous action IS the person presenting the",
              `product to camera in that one spot — across the ${totalWordLower} panels they keep`,
              "showing and handling it to the lens (hold it up, take it off / put it on,",
              "rotate it, point at a detail, demonstrate it), addressing the camera; the",
              "product is clearly visible and the focus, never passive background.",
            ]
          : []),
      ]
    : [];

  // User-block "produce the script" line — graphic clean frames vs N×4 vs 4.
  const produceLine = cleanGraphic
    ? [
        "Review them, then produce the 4-scene script (each scene's on-frame text as",
        "its panelCaption) and the composite sheet plan — exactly 4 FINISHED,",
        "self-contained graphic frames in a 2×2 grid separated by thin gutters; NO",
        "number badges, NO caption bars, NO arrows — each frame's own typography IS",
        "the design.",
      ]
    : isMaster
      ? [
          `Review them, then produce the ${totalPanels}-scene script (with spoken transcripts and`,
          "a brief panelCaption per scene) and the composite storyboard-sheet plan —",
          `exactly ${totalPanels} keyframe panels in a ${rows}×4 grid, each LABELLED with its number`,
          `badge (01–${lastBadge}) and its panelCaption bar, in row-major order; no other text`,
          "and no arrows.",
        ]
      : [
          "Review them, then produce the 4-scene script (with spoken transcripts and a",
          "brief panelCaption per scene) and the composite storyboard-sheet plan —",
          "exactly 4 keyframe panels, each LABELLED with its number badge (01–04) and",
          "its panelCaption bar, in order; no other text and no arrows.",
        ];

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

  // Positional image binding — refs are pushed product-first, then person
  // (storyboard/index.ts:146-148), so with a product sheet attached the person
  // sheet is Image 2, else Image 1. gpt-image-2's images.edit gives no per-image
  // role, so the prompt MUST name which attached image is which BY NUMBER —
  // without it identity drifts to the product category's default (skincare→woman).
  const hasProd = hasProduct ?? true;
  const personImgNo = hasProd ? 2 : 1;

  // TEXT identity anchor — pins what the product IS so a drifting reference
  // sheet can't make the storyboard render a different kind of item.
  const productAnchor = product
    ? [
        "THE PRODUCT IS (authoritative identity — this exact item, nothing else):",
        product,
        "Every panel MUST show THIS product — the same category, form, materials and",
        "markings described above AND shown in Image 1 (the product sheet). For exact",
        "COLOUR and finish Image 1 (the product sheet) is the sole authority: match its hues",
        "precisely, never invent, restyle or shift the colour. If the sheet's KIND of",
        "item ever looks ambiguous, this text wins: never substitute a different kind",
        "of item. State this product by name in the `imagePrompt`.",
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
        `- The person is the EXACT human shown in Image ${personImgNo} (the person sheet):`,
        "  replicate their face, apparent gender, age, hair and skin tone IDENTICALLY",
        "  in every panel — never invent a different person, never blend in features",
        "  from any other attached image.",
        person
          ? `- From Image ${personImgNo} (the person sheet, authoritative), plus the person brief below, read and FIX the person's apparent`
          : `- From Image ${personImgNo} (the person sheet, authoritative) read and FIX the person's apparent`,
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

  // UPLOADED-PRODUCT FOCUS — when a real product was uploaded (Image 1), promote
  // it to a featured on-screen HERO even for product-OPTIONAL types (brand-story,
  // inspirational, lifestyle…), which otherwise treat the product as optional
  // background and under-feature it. Skipped for graphic_text (explainer), whose
  // product appears as a designed graphic element, not live photography.
  const uploadedProductFocus =
    fctx.hasProduct && !cleanGraphic
      ? [
          "UPLOADED PRODUCT — a real product was provided (Image 1, the product",
          "sheet), so it is a FEATURED on-screen subject of THIS ad, never optional",
          "set-dressing:",
          "- Feature THIS exact product, identity-locked to Image 1, prominently and",
          "  in sharp focus in the MAJORITY of the panels — woven naturally into the",
          "  ad type's treatment (story, mood, demo or proof), not replacing it.",
          "- Never omit the product, bury it in the deep background, or swap it for a",
          "  generic stand-in; whenever a panel shows it, it is unmistakably the",
          "  product from Image 1, at true-to-life scale.",
        ]
      : [];

  // Ad-type-specific direction for the script + transcripts (registry dispatch).
  const typeBlock = def.fragments.storyboardTypeBlock(fctx);

  // Opening hook — its directive applies to SCENE 1 ONLY (scenes 2..N carry no
  // hook). Empty when no hook resolved (legacy/older runs) → byte-identical.
  const hookBlock = fctx.hooks
    ? [
        "",
        "OPENING HOOK — applies ONLY to scene 1 (the first panel / opening beat);",
        "scenes 2..N carry NO hook directive:",
        ...hookOpening(fctx.hooks).storyboardScene1,
      ]
    : [];

  // Newly-wired fragment seams: transcript style (TYPE-driven) + shot direction
  // + caption style (LOOK-driven). Empty for the two legacy types (their .md
  // omits transcript and the ugc/cinematic look bases return [] for the others),
  // so splicing them is byte-identical for legacy and adds per-type direction for
  // the new ad types.
  const transcriptStyle = def.fragments.storyboardTranscriptStyle(fctx);
  const shotDirection = def.fragments.storyboardShotDirection(fctx);
  const captionStyle = def.fragments.storyboardCaptionStyle(fctx);

  // Script grounding — forces the four spoken lines to be specific to THIS
  // product, THIS person and THIS scene, and to never repeat. Kills the
  // generic, interchangeable filler ("I love this", "you'll love it") that
  // appears when the model has no concrete anchor.
  const speaker =
    def.fragments.storyboardSpeakerLabel(fctx)[0] ?? "the on-screen person";
  // Anchor the script in what THIS product actually does (from productUse) so two
  // different products yield clearly different scripts — kills cross-ad sameness.
  const benefitAnchor = hasUse
    ? `Ground the lines in what THIS product actually does — a real person ${useVerb} it and ${functionSignal} — so the script is specific to this exact product (a bottle ad and a watch ad must sound nothing alike).`
    : "Ground the lines in THIS product's actual, concrete benefit (per the product sheet) — never an interchangeable line that would fit any product.";
  const scriptGrounding = [
    "SCRIPT GROUNDING — the four `transcript` lines MUST be concrete, specific and VARIED:",
    product
      ? `- Talk about THIS product specifically — ${product} Name or clearly evoke it; never a generic "this" with no anchor. Do NOT invent a brand, price or feature unsupported by the product or the user's prompt.`
      : "- Talk about THIS specific product (per the product sheet); never a generic, interchangeable line that would fit any product.",
    `- ${benefitAnchor}`,
    "- Each line is a DIFFERENT beat that OPENS with a different word — a distinct",
    "  concrete benefit, feature, use-moment or reaction tied to what that panel",
    "  shows. Across the four: hook → product-in-use → a concrete benefit/reaction",
    "  → an honest closing thought (a real personal verdict, never a pitch or",
    "  call-to-action). No two lines may share an idea, a phrase or an opener.",
    hasPerson
      ? `- Write the way THIS specific person speaks — their age, gender and energy from the CHARACTER ANCHOR${person ? ` (${person})` : ""}; a real individual, never a generic creator template or brand script.`
      : `- Make the wording sound like a real, specific human (${speaker}), not interchangeable ad copy.`,
    "- BANNED — recycled UGC filler and template openers/closers (vary these every",
    "  time; never default to them across ads): empty hype with no specifics",
    '  ("I love this", "you\'ll love it", "this is amazing", "game changer",',
    '  "obsessed", "10/10", "must-have"); stock openers ("okay so", "okay guys",',
    '  "so I\'ve been using", "let me tell you", "honestly", "trust me", "guys");',
    '  stock closers ("you need this", "run don\'t walk", "link in bio",',
    '  "thank me later"). Replace each with a concrete, product-specific detail.',
    "- The lines must match what the matching panel actually shows (same action /",
    "  setting), so the spoken script and the keyframes stay in sync.",
  ];

  // How the hero product must appear — shared across ad types. Kills the
  // invented-packaging / unboxing / duplicated-product failure modes.
  const presentationBlock = [
    "PRODUCT PRESENTATION — how the product appears in EVERY panel that shows it:",
    "- Show the product the way it is REALLY used: if wearable (jewelry, bracelet,",
    "  watch, glasses, apparel, shoes, bag) it is WORN on the body; if handheld it",
    "  is in ACTIVE USE — not a static product-on-a-pedestal (unless the ad style",
    "  calls for it).",
    "- TRUE-TO-LIFE SCALE & PLACEMENT: render it at real-world size relative to the",
    "  hand / body / face (a ring is finger-sized, glasses face-sized, a bottle",
    "  hand-sized), placed exactly where it naturally sits — worn on the correct",
    "  body part or held in the hand. Read it as the subject by FRAMING THE SHOT",
    "  CLOSE (a close or medium shot), NOT by enlarging the object beyond its real",
    "  size — it must never float, dominate the frame or dwarf the hand/body that",
    "  holds it.",
    "- PHYSICAL SIZE ANCHOR: in every panel that shows the product, describe its",
    "  size RELATIVE to a known object in frame — the hand, the desk, a standard",
    '  mug, the person\'s body (e.g. "held in one hand, reaching from fingertips to',
    '  mid-palm", or "on the desk, about as tall as the mug beside it").',
    "- The product appears at its true real-world size relative to the hand / desk /",
    "  person in frame. Never enlarge, inflate, or scale up the product for emphasis;",
    "  it must look physically plausible next to the objects around it.",
    "- Always the real, solid item from the product sheet — the bare product, the",
    "  ONLY instance in the panel; not a box, packaging, blister pack, pouch or an",
    "  unboxing, and not a print / photo / logo of it on a box, poster or screen.",
    "- ONE SOLID OBJECT: the product is a single solid item with fixed geometry —",
    "  hands grip its OUTER SURFACE and never pass through it. Show it doing exactly",
    "  ONE clear, real, physically-correct action per panel; it does not morph,",
    "  stretch or sprout shape-shifting parts.",
    "- Operate it the REAL way: if its use needs opening (twist off a cap, flip a",
    "  lid, unclasp a strap), SHOW that action as a natural beat; it stays the same",
    "  single real item (not shattered or split into separate loose pieces).",
    "- PRODUCT-STATE CONTINUITY: keep its physical state causal and consistent per",
    "  the use-sequence in STEP 1.5 — a state-change (cap off, lid open) carries",
    "  through to every later panel.",
    "- Show ONLY the product and the person's own wardrobe from the reference",
    "  sheets — no invented accessories or extra objects near it, and nothing in the",
    "  product's OWN color beside it, so the product stays distinct and unmistakable.",
    "- Both the short `panelCaption` and the detailed `sceneDescription` show the",
    "  product WORN or USED (the panelCaption a brief label, the sceneDescription",
    "  expanding the same moment) — THIS product, never an example item.",
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
          : "- This product is used as-is — show it used directly, with no opening or unclasping step (it has no cap/lid/clasp to undo).",
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
    "  undone, a cover removed) happens in an EARLIER panel than the action that",
    "  needs it, and once changed it PERSISTS in every later panel.",
    "- In any panel where a use-action changes the product, NAME that state in",
    "  BOTH the `sceneDescription` and the `panelCaption`, and keep every panel a",
    "  physically real moment consistent with the use-sequence above.",
  ];

  // Keyframe look — LOOK-driven fragment (registry dispatch). UGC reads as
  // authentic phone footage, cinematic as a polished commercial keyframe.
  const keyframeLook = def.fragments.storyboardKeyframeLook(fctx);

  // The `imagePrompt` board-spec sentence. graphic_text drops the badge +
  // caption-bar + product clauses (clean designed frames). Every other look
  // keeps them and pins TRUE-TO-LIFE product scale by FRAMING CLOSE — not by
  // enlarging the object — so the product reads as the clear subject without
  // floating or dominating (the too-big / too-small failure).
  const boardSpecBody = cleanGraphic
    ? [
        `\`imagePrompt\` is ONE self-contained paragraph, roughly ${imagePromptWords} words — long`,
        "enough to be specific, but NOT a rule restatement. It MUST cover: the 2×2",
        `four-panel layout with thin plain gutters at ${resolutionLabel}; each panel a`,
        "FINISHED graphic frame with NO number badge and NO bottom caption bar, the",
        "frame's own kinetic typography rendered VERBATIM and perfectly legible as the",
        "design; and",
        lookBase(def.lookFamily).closingLookClause(fctx)[0] ?? "",
      ]
    : [
        `\`imagePrompt\` is ONE self-contained paragraph, roughly ${imagePromptWords} words — long`,
        `enough to be specific, but NOT a rule restatement. It MUST cover: ${layoutPhrase}`,
        `plain separator borders at ${resolutionLabel}; each panel's number badge`,
        `${badgeRangePhrase} + a thin uppercase storyboard-style bottom caption bar`,
        "(the EXACT caption text is appended after your prompt automatically — so",
        "describe the bar's STYLE and placement only; do NOT write the caption words",
        'yourself, and do NOT add a "quote the panelCaption" meta-instruction); NO',
        "other text and NO arrows; the product worn / in real use as the real solid",
        "item at TRUE real-world scale, FRAMED CLOSE so it reads as the clear subject",
        "at its true size relative to the hand / desk / person — NOT enlarged beyond",
        "its real size (never oversized, dominating, floating, a",
        "box/packaging/unboxing, or duplicated); each panel showing the product in",
        "its CORRECT causal state from",
        hasUse
          ? `the use-sequence (${hasPrep ? `${changedState} once the person ${accessVerb}, and it visibly works — ${functionSignal}` : `the product visibly working — ${functionSignal}`}), the state persistent across panels;`
          : "the use-sequence (e.g. cap removed and held in the other hand when drinking);",
        "and",
        lookBase(def.lookFamily).closingLookClause(fctx)[0] ?? "",
      ];

  const system = [
    "You are the StoryBoard Generator skill of an ad-video Image Agent.",
    "The attached reference sheets are the SINGLE SOURCE OF TRUTH for identity.",
    "ATTACHED IMAGES — bind identity to them BY NUMBER (this exact order):",
    hasProd
      ? "- Image 1 = the PRODUCT reference sheet: render THIS exact item, matching its shape, colour, finish and markings in every panel."
      : "",
    hasPerson
      ? `- Image ${personImgNo} = the PERSON reference sheet: the human in Image ${personImgNo} is the EXACT on-screen person. Copy their face, apparent gender, age, hair and skin tone IDENTICALLY in every panel; never invent a different person, and never change or flip their gender — a "men's"/"women's" product does NOT set the person's gender.`
      : "- No person in this ad.",
    "",
    "STEP 1 — REVIEW. First study the attached sheet(s) together with the user's",
    "prompt and the ad style. Note the product (its real form, materials,",
    "markings/text/logos)",
    hasPerson ? "and the person (face, build, wardrobe, palette)," : "",
    "and what the user wants the ad to say.",
    "",
    ...(product ? [...productAnchor, ""] : []),
    ...(uploadedProductFocus.length ? [...uploadedProductFocus, ""] : []),
    ...(characterAnchor.length ? [...characterAnchor, ""] : []),
    ...typeBlock,
    ...hookBlock,
    "",
    ...scriptGrounding,
    ...transcriptStyle,
    "",
    // Product use-sequence + presentation blocks only when a product is present
    // (no-product ad types skip them). With a product these are unchanged.
    ...(fctx.hasProduct
      ? [...useSequenceBlock, "", ...presentationBlock, ""]
      : []),
    ...scriptStep,
    "- `sceneDescription` — ONE tight, concrete sentence (~15-30 words): the",
    "  setting (a real, ordinary place that fits how THIS product is actually",
    "  used — not a styled studio or stock-commercial cliché), the key action, and",
    "  what the PRODUCT visibly DOES to show it is genuinely working. When the",
    "  product is being USED, STATE THE MECHANICAL INTERACTION explicitly — which",
    "  part moves, in which direction, and what the product physically does",
    '  (e.g. "index finger depresses the pump; fine mist sprays forward and',
    '  slightly left"), never a vague "using the product". Substitute THIS',
    "  product's real motion — a watch's hand sweeping; a cap twisted off and",
    "  the liquid level dropping; a shoe flexing.",
    "  Keep it LEAN — no padding, no second/extra clauses; richer than the",
    "  panelCaption but close to it in spirit. It feeds the video step, which does",
    "  BETTER with short, focused direction than long paragraphs — do NOT write a",
    "  paragraph. Match the panel, the real product (per the identity above) and",
    "  the real person with correct, consistent pronouns (see CHARACTER ANCHOR).",
    "  e.g. (STRUCTURE ONLY — substitute THIS product and a fitting real setting)",
    '  "Medium close-up; she [uses the product] and [its real working motion shows]."',
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
    ...gridLayout,
    `- Output/canvas resolution: ${resolutionLabel}. Render at full detail.`,
    "- Each panel is a clean, photorealistic KEYFRAME for its scene — a still",
    "  frame lifted straight from the finished ad.",
    ...antiRepetition,
    ...keyframeLook,
    ...shotDirection,
    ...captionStyle,
    "- Keep the product (and the person, if present) faithfully consistent with",
    "  the attached reference sheets in EVERY panel — the SAME product with all",
    "  its real markings, text and logos intact, the same person, materials and",
    "  proportions. The reference sheets are the COLOUR authority: match their",
    "  exact hues and finish, never invent or shift the colour. Do not restyle,",
    "  garble, or invent product text.",
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
    ...panelLabelBlock,
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "panelCaption": string, "transcript": string, "adStyle": string } ] }',
    ...boardSpecBody,
    hasPerson
      ? `It MUST also state the SAME person is rendered photorealistically (real, lifelike face and skin) with consistent apparent gender and identity in every one of the ${isMaster ? totalWordLower : "four"} panels, faithful to the person sheet.`
      : "",
    scenesCountLine,
    `to "${style}".`,
  ]
    .filter(Boolean)
    .join("\n");

  // 60s continuity: this sheet renders ONE ~15s segment of a four-part ad. The
  // segment's own brief drives these four panels; the OTHER summaries are
  // consistency context only (NOT to be drawn) so the four sheets read as one
  // ad — same person/wardrobe, product state carried forward, coherent
  // time/location progression, clean hand-off to the neighbouring segments.
  const isSegment = segmentSummary != null && segmentIndex != null;
  const continuityBlock = isSegment
    ? [
        "",
        `SEGMENT ${segmentIndex + 1} OF 4 — this storyboard renders ONE 15-second`,
        "segment of a single continuous 60-second ad. Your four panels cover ONLY",
        "this segment's beat.",
        `THIS SEGMENT'S BRIEF: ${segmentSummary.trim()}`,
        ...(otherSummaries && otherSummaries.length
          ? [
              "THE OTHER SEGMENTS (for continuity ONLY — do NOT render these; stay",
              "consistent with them):",
              ...otherSummaries
                .filter((s) => s?.trim())
                .map((s) => `  - ${s.trim()}`),
            ]
          : []),
        "Keep the SAME person, wardrobe, hairstyle and the SAME product across all",
        "four segments; carry the product's state FORWARD (never reset it); keep a",
        "coherent time-of-day and location progression. These four panels must hand",
        "off cleanly to the adjacent segments so the final 60s cut feels seamless.",
      ]
    : [];

  // 60s only — the ONE locked visual-style bible, injected VERBATIM here and in
  // every other segment storyboard + every video prompt, so all four panels (×4
  // sheets) and all four clips share one grade/lens/lighting/palette. Keep the
  // string byte-identical everywhere; do not paraphrase per segment.
  const visualStyleBlock =
    (isSegment || isMaster) && visualStyle?.trim()
      ? [
          "",
          "LOCKED VISUAL STYLE — identical across all four segments; render these",
          "four panels in EXACTLY this look (do not reinterpret per segment):",
          visualStyle.trim(),
        ]
      : [];

  const user = [
    `Ad style: ${style}`,
    `Ad type: ${adType}`,
    `User prompt: ${userPrompt}`,
    ...continuityBlock,
    ...coherentSceneBlock,
    ...visualStyleBlock,
    "The reference sheets are attached in the image-generation step.",
    ...produceLine,
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
