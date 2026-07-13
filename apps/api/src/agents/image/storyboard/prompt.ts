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
import { panelGrid } from "../../../lib/image/crop.js";
import type { CreativeBrief, ProductUse, SupportingRole } from "../../types.js";
import { getAdType } from "../../ad-types/registry.js";
import { lookBase } from "../../ad-types/fragments/looks.js";
import { buildFragmentCtx } from "../../ad-types/fragment-ctx.js";
import { hookOpening } from "../../ad-types/hooks/compose.js";
import type { HookSelection } from "../../ad-types/types.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";
import { formatBrand } from "../../../lib/brand.js";

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
  /**
   * SERVICE ads only — the creative-director brief (`runs.creative_brief`). When
   * present with real scenes it is the AUTHORITATIVE multi-scene story the sheet
   * renders (scene i → panel i, synthesized cast held constant). Absent ⇒ the
   * planner invents the script as before (the product ad-types).
   */
  creativeBrief?: CreativeBrief;
  /** Optional user-typed brand guidelines (`runs.brand_text`), injected verbatim. */
  brandText?: string;
  /**
   * Chunk 4b — text-only supporting roles (`runs.supporting_cast`) for product
   * ads. Rendered from text (no reference sheet) and held consistent across
   * panels. Ignored for service ads (the creative brief carries their cast).
   */
  supportingCast?: SupportingRole[];
  /**
   * TEMPLATE runs only — the ordered per-slot beats (`ctx.templateBeats`). When
   * present (≥2), the sheet renders exactly one panel per beat, depicting that
   * beat, so the board and the steered video tell the identical story. Drives an
   * N-panel grid (`panelGrid`) instead of the fixed 4-panel 2×2. Falsy ⇒ the
   * legacy 4-panel sheet, byte-identical.
   */
  templateBeats?: { scene: string }[];
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
  creativeBrief,
  brandText,
  supportingCast,
  templateBeats,
}: StoryboardPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const resolutionLabel = IMAGE_LABEL_BY_RATIO[aspectRatio];
  const product = productBrief.trim();
  const person = personBrief.trim();
  const brandLine = formatBrand(brandText);

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
    5: "five",
    6: "six",
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

  // ── TEMPLATE mode: one panel per template beat (2..6), so the sheet depicts
  // the SAME shots the steered video shows. A near-square N-panel grid; the
  // legacy 4-panel 2×2 path (and master) are untouched. Mutually exclusive with
  // isMaster (the template pipeline is 15s-only). ──
  const isTemplate = !isMaster && (templateBeats?.length ?? 0) >= 2;
  const tPanels = templateBeats?.length ?? 0;
  const { rows: tRows, cols: tCols } = panelGrid(tPanels || 1);
  const tWord = NUM_WORD[tPanels] ?? String(tPanels);
  const tWordUpper = tWord.toUpperCase();
  const tLastBadge = pad2(tPanels);
  const tHasEmpty = tRows * tCols > tPanels;
  const tGridPhrase =
    tRows === 1 ? `a single row of ${tPanels}` : `a ${tRows}×${tCols} grid`;
  // Row-major badge map, e.g. "row 1 = panels 01-03 left→right, row 2 = 04-05".
  const tRowMap = Array.from({ length: tRows }, (_, r) => {
    const start = r * tCols + 1;
    const end = Math.min(tPanels, r * tCols + tCols);
    const span = start === end ? pad2(start) : `${pad2(start)}-${pad2(end)}`;
    return r === 0
      ? `row 1 = panels ${span} left→right`
      : `row ${r + 1} = ${span}`;
  }).join(", ");
  // ~15-22 words/panel, same density as the master.
  const tWords = `${tPanels * 15}-${tPanels * 22}`;

  // STEP 2 opener — N×4 scenes of ONE continuous scene vs the 15s 4.
  const scriptStep = isMaster
    ? [
        `STEP 2 — SCRIPT. Produce exactly ${totalWordUpper} scenes, no more, no less. \`index\``,
        `runs 1..${totalPanels} in play order — ONE continuous ~${totalSec}-second take of a SINGLE`,
        "coherent scene (see ONE CONTINUOUS SCENE below), split only for timing into",
        `${rowsWord} ~15s stretches (panels ${stretchMap}), each panel ~3-4s. Keep`,
        `the SAME place, person, wardrobe, product and look across all ${totalWordLower}; only`,
        "the SHOT and the small moment change. For each scene give: a `cameraAngle`",
        "(≤4 words), the `actionMovement` (≤10 words), a `sceneDescription`",
        "(≤14 words), the spoken `transcript` (≤12 words), and a short",
        "`panelCaption`. The last two are DIFFERENT texts — never the same sentence:",
      ]
    : isTemplate
      ? [
          `STEP 2 — SCRIPT. Produce exactly ${tWordUpper} scenes, no more, no less. \`index\``,
          `runs 1..${tPanels} in play order — consecutive beats of ONE continuous ~15-second`,
          "take (see ONE CONTINUOUS SCENE below). Each scene i depicts the matching BEAT i",
          "listed in PLANNED BEATS, in that exact order. For each scene give: a",
          "`cameraAngle` (≤4 words), the `actionMovement` (≤10 words), a `sceneDescription`",
          "(≤14 words), the spoken `transcript` (≤12 words), and a short `panelCaption`. The",
          "last two are DIFFERENT texts — never the same sentence:",
        ]
      : [
          "STEP 2 — SCRIPT. Produce exactly FOUR scenes, no more, no less. `index` runs",
          "1, 2, 3, 4 in play order, each scene ~3-4 seconds, together forming one",
          "continuous ~15s arc. For each scene give: a `cameraAngle` (≤4 words), the",
          "`actionMovement` (≤10 words), a `sceneDescription` (≤14 words), the spoken",
          "`transcript` (≤12 words), and a short `panelCaption`. The last two are",
          "DIFFERENT texts — never the same sentence:",
        ];

  // STEP 3 layout — N×4 grid vs the 15s 2×2.
  const gridLayout = isMaster
    ? [
        `- ONE single image, exactly ${totalWordUpper} equal-size panels in a clean ${rows}×4 grid`,
        `  (${rows} rows × 4 columns), ROW-MAJOR reading order: ${rowMap} — with only thin,`,
        "  uniform plain separator borders between panels.",
      ]
    : isTemplate
      ? [
          `- ONE single image, exactly ${tWordUpper} equal-size panels in ${tGridPhrase}`,
          `  (${tRows} row${tRows > 1 ? "s" : ""} × ${tCols} column${tCols > 1 ? "s" : ""}), ROW-MAJOR reading order: ${tRowMap} —`,
          "  with only thin, uniform plain separator borders between panels.",
          ...(tHasEmpty
            ? [
                "  Leave the unused trailing cell a plain EMPTY panel (no image, no badge).",
              ]
            : []),
        ]
      : [
          "- ONE single image, exactly FOUR equal-size panels in reading order — a",
          "  clean 2×2 grid (top-left=1, top-right=2, bottom-left=3, bottom-right=4)",
          "  with only thin, uniform plain separator borders between panels.",
        ];

  // Distinct-SHOTS rule — variety must come from the CAMERA + moment, NOT from
  // changing the world (which would re-introduce the scene-jumping). 15s ⇒ empty.
  const antiRepetition = isMaster || isTemplate
    ? [
        "- Make every panel a DISTINCT SHOT of the SAME continuous scene: vary the",
        "  camera angle, shot type, framing and the small moment/action across panels",
        "  (wide / medium / close, different angles, a beat later). Do NOT repeat a",
        "  near-identical frame — but do NOT change the location, outfit, lighting or",
        "  time-of-day to create variety; the variety is in the CAMERA and the moment,",
        "  never the world.",
      ]
    : [];

  // PANEL LABELS badge range — 01..N×4 vs 01..04.
  const labelBadge = isMaster
    ? [
        `- A scene-number BADGE in a top corner of each panel: 01 through ${lastBadge}, in`,
        "  ROW-MAJOR reading order. Small, clean, legible.",
      ]
    : isTemplate
      ? [
          `- A scene-number BADGE in a top corner of each panel: 01 through ${tLastBadge}, in`,
          "  ROW-MAJOR reading order. Small, clean, legible.",
        ]
      : [
          "- A scene-number BADGE in a top corner of each panel: 01, 02, 03, 04, in",
          "  reading order. Small, clean, legible.",
        ];

  // Panel-labelling block — the badge + a SINGLE uniform caption-bar style across
  // all panels (fixes per-panel colour drift). The ONE home for the label spec.
  const panelLabelBlock = [
    "PANEL LABELS — REQUIRED on every panel (this is a real storyboard sheet):",
    ...labelBadge,
    "- A one-line CAPTION in a thin legible bar along the BOTTOM of each panel,",
    "  reading EXACTLY the scene's `panelCaption`, in clean uppercase lettering.",
    "  ALL caption bars share ONE identical style (same colour, opacity, height,",
    "  font); badge + caption stay crisp, never overlapping the face or markings.",
    "- Apart from the badge and caption bar, add NO other graphics: no titles,",
    "  timecodes, ARROWS, callouts, logos, watermarks, boxes, colour blocks or",
    "  panels-within-a-panel. Convey motion through the imagery (pose, blur,",
    "  framing), never arrows. Panel interiors stay pure photographs.",
  ];

  // Closing JSON-spec fragments (word budget, layout phrase, badge range, count).
  const imagePromptWords = isMaster ? masterWords : isTemplate ? tWords : "60-90";
  const layoutPhrase = isMaster
    ? `the ${rows}×4 ${totalWordLower}-panel layout (row-major 01-${lastBadge}, all panels visually distinct) with thin`
    : isTemplate
      ? `the ${tGridPhrase} ${tWord}-panel layout (row-major 01-${tLastBadge}, all panels visually distinct) with thin`
      : "the 2×2 four-panel layout with thin";
  const badgeRangePhrase = isMaster
    ? `(01–${lastBadge}, in order)`
    : isTemplate
      ? `(01–${tLastBadge}, in order)`
      : "(01–04, in order)";
  const scenesCountLine = isMaster
    ? `\`scenes\` MUST have exactly ${totalPanels} entries, in order. Set every scene's \`adStyle\``
    : isTemplate
      ? `\`scenes\` MUST have exactly ${tPanels} entries, in order. Set every scene's \`adStyle\``
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
    : isTemplate
      ? [
          "",
          `ONE CONTINUOUS SCENE — these ${tWord} panels are a SINGLE ~15-second take of ONE`,
          `coherent scene, NOT ${tWord} different scenes. Across ALL ${tWord} keep the SAME`,
          "person, wardrobe and hair, the SAME product, the SAME location and the SAME",
          "lighting/look. Only the CAMERA (shot type, angle, distance) and the small",
          `moment/action move from panel to panel; panels 1→${tPanels} flow as ONE continuous`,
          "shoot of the SAME scene. Build this arc from the PLANNED BEATS above — render",
          "each beat as its panel, in order; do NOT split it into separate vignettes.",
        ]
      : [];

  // User-block "produce the script" line — N×4 master vs the 15s 4.
  const produceLine = isMaster
    ? [
          `Review them, then produce the ${totalPanels}-scene script (with spoken transcripts and`,
          "a brief panelCaption per scene) and the composite storyboard-sheet plan —",
          `exactly ${totalPanels} keyframe panels in a ${rows}×4 grid, each LABELLED with its number`,
          `badge (01–${lastBadge}) and its panelCaption bar, in row-major order; no other text`,
          "and no arrows.",
        ]
      : isTemplate
        ? [
            `Review them, then produce the ${tPanels}-scene script (with spoken transcripts`,
            "and a brief panelCaption per scene) and the composite storyboard-sheet plan —",
            `exactly ${tPanels} keyframe panels in ${tGridPhrase}, each LABELLED with its number`,
            `badge (01–${tLastBadge}) and its panelCaption bar, in row-major order; no other`,
            "text and no arrows.",
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
        "If the product sheet's KIND of item ever looks ambiguous, this text wins:",
        "never substitute a different kind of item. Name this product in the `imagePrompt`.",
      ]
    : [];

  // CHARACTER ANCHOR — lock the on-screen person's apparent identity (gender,
  // age, hair) and keep it 100% constant across all four scenes/captions/
  // transcripts. For uploaded persons personBrief is empty, so this also tells
  // the model to DERIVE the gender from the attached person sheet and lock it.
  const characterAnchor = hasPerson
    ? [
        "CHARACTER ANCHOR (the on-screen person — keep 100% constant across ALL",
        "scenes, captions and transcripts):",
        person
          ? `- From Image ${personImgNo} (the person sheet, authoritative) + the brief below, FIX the person's apparent gender, age, hair, skin tone and build.`
          : `- From Image ${personImgNo} (the person sheet, authoritative) FIX the person's apparent gender, age, hair, skin tone and build.`,
        ...(person ? [`- Person brief: ${person}`] : []),
        "- Use CONSISTENT, CORRECT pronouns matching that apparent gender in every",
        "  `sceneDescription`, `panelCaption` and `transcript` (female → she/her,",
        "  male → he/him; never switch mid-script).",
        "- The PRODUCT's marketed gender or category does NOT set the wearer's",
        "  gender — it comes ONLY from the person sheet / brief; never let a gendered",
        "  product flip the person's apparent gender.",
      ]
    : [];

  // UPLOADED-PRODUCT FOCUS — when a real product was uploaded (Image 1), promote
  // it to a featured on-screen HERO even for product-OPTIONAL types (brand-story,
  // inspirational, lifestyle…), which otherwise treat the product as optional
  // background and under-feature it. Skipped for graphic_text (explainer), whose
  // product appears as a designed graphic element, not live photography.
  const uploadedProductFocus = fctx.hasProduct
    ? [
          "UPLOADED PRODUCT — a real product was provided (Image 1), so it is a",
          "FEATURED on-screen subject of THIS ad, never optional set-dressing:",
          "- Feature it prominently and in sharp focus in the MAJORITY of panels,",
          "  woven naturally into the ad type's treatment (story, mood, demo, proof).",
          "- Never omit it, bury it in the background, or swap it for a generic stand-in.",
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
    "SCRIPT GROUNDING — the four `transcript` lines MUST be concrete, specific, VARIED and ≤12 words each:",
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
    // These lines are SPOKEN aloud in the final video; the video provider's
    // audio moderation rejects the whole clip if the generated voiceover reads
    // as sensitive. Keep the copy brand-safe so it renders cleanly.
    "- BRAND-SAFE SPEECH (these lines are spoken aloud, then audio-moderated by",
    "  the video model): keep them plain, conversational product talk. NEVER put",
    "  a phone number, email address, website/URL/domain, a spoken price or a",
    "  percentage-as-claim, a medical / health cure-or-treatment claim, a",
    "  financial or earnings guarantee, or absolute wording (\"guaranteed\",",
    "  \"cure\", \"permanent\", \"miracle\", \"100%\") in a transcript line. Nothing",
    "  political, violent, or adult. Describe the benefit in ordinary, honest",
    "  words instead.",
  ];

  // How the hero product must appear — shared across ad types. Kills the
  // invented-packaging / unboxing / duplicated-product failure modes.
  const presentationBlock = [
    "PRODUCT PRESENTATION — how the product appears in EVERY panel that shows it:",
    "- Show it the way it is REALLY used: if wearable, WORN on the body; if",
    "  handheld, in ACTIVE USE — not a static product-on-a-pedestal (unless the",
    "  style calls for it).",
    "- TRUE-TO-LIFE SCALE: render it at real-world size relative to the hand /",
    "  body / face, where it naturally sits. Make it the subject by FRAMING CLOSE,",
    "  NOT by enlarging it — it must never float, dominate the frame or dwarf the",
    "  hand/body that holds it.",
    "- The real, solid item from the sheet — the bare product, the ONLY instance;",
    "  never a box, packaging, unboxing, or a printed photo/logo of it. Fixed",
    "  geometry: hands grip its OUTER SURFACE, never pass through; it does not morph",
    "  or stretch. Any opening (twist a cap, unclasp a strap) is a natural beat and",
    "  stays one real item.",
    "- Show ONLY the product and the person's own wardrobe from the sheets — no",
    "  invented accessories, and nothing in the product's OWN colour beside it.",
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
  const boardSpecBody = [
    `\`imagePrompt\` is ONE self-contained paragraph of ${imagePromptWords} words, in THIS`,
    "order and stating each point ONCE (do NOT restate the rules already given",
    "above): (1) a short style anchor for the ad; (2) the SAME product and person",
    "from the reference sheets as four photoreal keyframes; (3) each panel's real",
    "setting + its lighting; (4) framing / lens; (5) soft natural skin, neutral",
    "white balance, true colour; (6) the product at true real-world scale, framed",
    `close (never oversized or floating); (7) ${layoutPhrase} plain separator`,
    `borders at ${resolutionLabel}, each panel's number badge ${badgeRangePhrase} + a thin`,
    "uppercase bottom caption bar (describe the bar's STYLE only — the caption",
    "text is appended automatically, so do NOT write the caption words); (8) end",
    "with tight negatives: no other text, no arrows. Keep it terse -",
    lookBase(def.lookFamily).closingLookClause(fctx)[0] ?? "",
  ];

  // SERVICE ads — the creative-director brief is the AUTHORITATIVE multi-scene
  // story (no product/person upload to anchor from). Render it scene i → panel i
  // with the synthesized cast held identical across panels. Absent ⇒ the planner
  // invents the script as before (the product ad-types).
  const brief =
    creativeBrief && creativeBrief.scenes.some((s) => s.action?.trim())
      ? creativeBrief
      : undefined;
  const plannedStoryBlock = brief
    ? [
        "PLANNED STORY (authored by the creative director — RENDER THIS EXACT",
        "STORY, scene i → panel i, in order; do NOT invent a different story):",
        ...(brief.concept ? [`- Concept: ${brief.concept}`] : []),
        ...(brief.cast.length
          ? [
              "- Cast — these people are SYNTHESIZED (no reference photo), so keep",
              "  each one's face, hair, build and wardrobe IDENTICAL in every panel",
              "  they appear in:",
              ...brief.cast.map((c) => `  - ${c.name}: ${c.identity}`),
            ]
          : []),
        ...(brief.hook?.line
          ? [
              `- OPENING HOOK — scene 1 (panel 1) MUST open on this (${brief.hook.type}): "${brief.hook.line}"`,
            ]
          : []),
        "- Scenes (each is ONE panel, in play order):",
        ...brief.scenes.map((s, i) => {
          const who = s.charactersPresent?.length
            ? ` | who: ${s.charactersPresent.join(", ")}`
            : "";
          const say = s.dialogue?.length
            ? ` | says: ${s.dialogue
                .map((d) => `${d.speaker}: "${d.line}"`)
                .join(" / ")}`
            : "";
          const txt = s.onScreenText
            ? ` | on-screen text: "${s.onScreenText}"`
            : "";
          const place = [s.setting, s.lighting]
            .filter((x) => x?.trim())
            .join(" — ");
          return `  ${i + 1}. ${place}${who} | action: ${s.action}${say}${txt}`;
        }),
        "- MULTI-SCENE: render each panel in its scene's OWN authored setting +",
        "  lighting/grade. When consecutive scenes SHARE a setting (the same",
        "  location), render that location and its recurring props (furniture,",
        "  fixtures, signage, devices) IDENTICALLY across those panels — same",
        "  colours, layout and dressing; the world only CHANGES when the authored",
        "  setting changes (a colour-grade shift is fine). Each cast member's face,",
        "  hair and wardrobe stay IDENTICAL across every panel. The panels connect",
        "  CAUSALLY into one continuous story.",
        "- ON-SCREEN TEXT: render any app / device / UI screen as realistic but with",
        "  SHORT, ABSTRACT placeholder text — do NOT spell out long readable rows or",
        "  lists (small text always renders garbled); at most a heading or one value",
        "  is crisp. The FEW hero text elements (the brand name, a single stat /",
        "  number, the end-card line) are the ONLY crisp text: render each in quotes",
        "  or ALL CAPS, 1-5 words MAX, lettered VERBATIM letter-for-letter (spell a",
        "  brand name out exactly) — no extra or duplicate characters, no invented",
        "  logos or wording.",
        "- END CARD: if the planned story's last scene is an end card, render that",
        "  panel as a clean, DESIGNED brand frame — the brand name / logo centred, a",
        "  short tagline and URL on the brand background colour; NO people, NO clutter.",
        "",
      ]
    : [];
  const plannedScriptDirective = brief
    ? [
        "RENDER THE PLANNED STORY — for EACH panel i, take its setting, lighting,",
        "who-is-present, action and spoken line from PLANNED STORY scene i above;",
        "write that panel's `sceneDescription` and `transcript` from it and a",
        "matching `panelCaption`. Do NOT invent a different story, reorder, drop or",
        "merge scenes.",
        "",
      ]
    : [];

  // TEMPLATE beats — the ad's chosen template defines what each of its video
  // slots shows, and the video is steered to those beats. The storyboard must
  // render the SAME beats, panel i → beat i, so the board and the clip match.
  // Same "render this exact sequence" mechanism as the service PLANNED STORY.
  const plannedBeatsBlock = isTemplate
    ? [
        "PLANNED BEATS (the ad's template defines these shots — RENDER THIS EXACT",
        "sequence, beat i → panel i, in order; do NOT invent, reorder, add or drop):",
        ...templateBeats!.map((b, i) => `  ${i + 1}. ${b.scene}`.trimEnd()),
        "These are consecutive moments of ONE continuous take (same place, person,",
        "product and look) — only the shot and the small action advance between them.",
        "",
      ]
    : [];

  // Chunk 4b — text-only supporting roles (product types only; the service brief
  // already carries its own cast). Rendered from text, never a reference sheet.
  const supportRoles = brief
    ? []
    : (supportingCast ?? []).filter((c) => c.role?.trim());
  const supportingCastBlock = supportRoles.length
    ? [
        "- SUPPORTING CAST (text only — these people have NO reference sheet;",
        "  render each from the description below and keep them CONSISTENT across",
        "  the panels they appear in). They are SECONDARY to the main person and",
        "  the product — never the hero of a panel, and never block or upstage them:",
        ...supportRoles.map((c) => `  - ${c.role}: ${c.appearance}`),
      ]
    : [];

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
    ...plannedStoryBlock,
    ...plannedBeatsBlock,
    ...typeBlock,
    ...hookBlock,
    "",
    ...(brandLine ? [brandLine, ""] : []),
    ...scriptGrounding,
    ...transcriptStyle,
    "",
    // Product use-sequence + presentation blocks only when a product is present
    // (no-product ad types skip them). With a product these are unchanged.
    ...(fctx.hasProduct
      ? [...useSequenceBlock, "", ...presentationBlock, ""]
      : []),
    ...plannedScriptDirective,
    ...scriptStep,
    "- `sceneDescription` — ONE concrete sentence, ≤14 words: the setting, the",
    "  key action, and what the PRODUCT visibly does. When it is USED, name the",
    '  mechanical motion (which part moves) — never a vague "using the product".',
    "  Lean, no padding; it feeds the video step. Correct, consistent pronouns",
    "  (see CHARACTER ANCHOR).",
    "- `panelCaption` — the on-image caption label, MANDATORY format",
    "  `<SHOT TYPE>. <action that NAMES the product>` (shot type = WIDE SHOT /",
    "  MEDIUM SHOT / MEDIUM CLOSE-UP / CLOSE-UP / EXTREME CLOSE-UP /",
    '  OVER-THE-SHOULDER / POV), then a period, then a vivid action naming THIS',
    '  product (never a bare "it"/"this"). ~8-14 words, the SAME moment as',
    '  `sceneDescription`. GOOD (structure only): "MEDIUM SHOT. Smiling as she',
    '  holds up the [product] to camera." REJECTED: "Picks up the sunglasses."',
    '  (no shot-type) / "Smiles and turns his head." (no product named).',
    "",
    "STEP 3 — STORYBOARD IMAGE (`imagePrompt`). Author the full, self-contained",
    "text-to-image prompt for ONE composite storyboard sheet:",
    ...gridLayout,
    `- Output/canvas resolution: ${resolutionLabel}.`,
    "- Each panel is a clean, photorealistic KEYFRAME for its scene — a still",
    "  frame lifted straight from the finished ad.",
    ...antiRepetition,
    ...keyframeLook,
    ...shotDirection,
    ...captionStyle,
    "- Keep the product's real markings, text and logos intact; do NOT invent,",
    "  restyle or garble product text.",
    ...(hasPerson
      ? [
          "- The person sheet is AUTHORITATIVE: if any wording here conflicts with",
          "  it, the SHEET WINS. Render that exact individual (per the CHARACTER",
          "  ANCHOR), never a lookalike.",
        ]
      : []),
    ...supportingCastBlock,
    "",
    ...panelLabelBlock,
    "",
    `Honor the ad style ("${style}") in framing, pacing, and mood.`,
    "",
    "Respond with STRICT JSON only, no prose, matching:",
    '{ "imagePrompt": string, "scenes": [ { "index": number, "cameraAngle": string, "actionMovement": string, "sceneDescription": string, "panelCaption": string, "transcript": string, "adStyle": string } ] }',
    ...boardSpecBody,
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
