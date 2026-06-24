import type { AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { getAdType } from "../ad-types/registry.js";
import { buildFragmentCtx } from "../ad-types/fragment-ctx.js";
import { hookOpening } from "../ad-types/hooks/compose.js";
import type { HookSelection } from "../ad-types/types.js";
import { formatBrand } from "../../lib/brand.js";

/** Per-ratio frame-orientation labels baked into the Seedance directive. */
const FRAME_LABEL: Record<AspectRatio, { full: string; short: string }> = {
  "16:9": { full: "16:9 widescreen (horizontal)", short: "16:9 widescreen" },
  "9:16": { full: "9:16 vertical (portrait)", short: "9:16 vertical" },
};

/** `M:SS` time stamp for the bracketed Seedance shot list. */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Bracketed time slices, one per panel, e.g. `["[0:00-0:04]", "[0:04-0:08]", …]`.
 * Even split with the last slice absorbing the remainder — for 15s/4 panels this
 * yields 0:00-0:04, 0:04-0:08, 0:08-0:11, 0:11-0:15.
 */
function buildSliceBrackets(durationSec: number, count: number): string[] {
  if (count <= 0) return [];
  const step = durationSec / count;
  return Array.from({ length: count }, (_, i) => {
    const start = Math.round(i * step);
    const end = i === count - 1 ? durationSec : Math.round((i + 1) * step);
    return `[${fmtTime(start)}-${fmtTime(end)}]`;
  });
}

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard panels
 * + per-scene transcripts into ONE SIMPLE Seedance 2.0 shot-list directive — the
 * "Generate a scene using shots in the uploaded film storyboard [0:00-0:04]: …"
 * form — kept deliberately short (Seedance degrades on long prompts; realism is
 * carried by the still, not the prose).
 *
 *   • A film-storyboard guide is attached as `@Image N` — a 2×2 grid of FOUR
 *     keyframe panels (top-left=1 … bottom-right=4). Panel N is the keyframe for
 *     time slice N; follow them in order. The OUTPUT is ONE clean continuous
 *     live-action shot that never shows the grid/badges/captions.
 *   • ONE plain sentence per time slice (subject + action + one camera move).
 *   • ONE short audio line — UGC: the on-screen person lip-syncs each transcript;
 *     inspirational: a voiceover narrates them.
 *   • Identity anchored by the `@Image` legend (product / storyboard / face).
 *
 * Emitted as ONE single-line string (no raw newlines) so `{ "videoPrompt": "…" }`
 * always parses. Spoken lines come from each scene's `transcript`.
 */
export function buildVideoPrompt(input: {
  adStyle: string;
  /** OPEN ad-type id — dispatched through the ad-type registry. */
  adType: string;
  /** Resolved hook selection (Chunk E); spliced into the FIRST time-slice only. */
  hooks?: HookSelection;
  /** Whether the ad features a person on screen (presenter logic). */
  hasPerson?: boolean;
  userPrompt: string;
  scenes: StoryboardScene[];
  durationSec: number;
  aspectRatio: AspectRatio;
  /**
   * Presenter identity (gender/age/hair) to PIN early in the prompt — sourced
   * from `runs.person_brief`. Empty for no-person ads and for uploaded persons
   * (no text brief); the scene text + the face `@Image` carry it then.
   */
  characterAnchor?: string;
  critique?: string;
  /** Multi-segment: this clip's segment index (0..N-1). Adds a continuity preamble. */
  segmentIndex?: number;
  /** Multi-segment: total segment count (N) for accurate "part X of N" wording. */
  segmentCount?: number;
  /** Multi-segment: the OTHER segments' summaries, for tone/motion continuity. */
  otherSummaries?: string[];
  /**
   * 60s: the locked visual-style bible (`runs.visual_style`), injected VERBATIM
   * — the SAME string used in the storyboard prompts — so all clips share
   * one grade/lens/lighting/palette.
   */
  visualStyle?: string;
  /**
   * 60s: whether the shared product reference sheet is attached. Shifts the
   * @Image numbering (product=1, storyboard=2, face=3 when present; else
   * storyboard=1, face=2) to match the submitted content order.
   */
  hasProductSheet?: boolean;
  /** Optional user-typed brand guidelines (`runs.brand_text`), injected verbatim. */
  brandText?: string;
}): ChatMessage[] {
  const {
    adStyle,
    adType,
    userPrompt,
    scenes,
    durationSec,
    aspectRatio,
    critique,
    segmentIndex,
    otherSummaries,
    visualStyle,
    hasProductSheet,
  } = input;
  const anchor = (input.characterAnchor ?? "").trim();
  // Ad-type registry dispatch (Chunk F). `isUgcLook` carries the old `ugc`
  // label/speaker branches; presenter logic comes from `hasPerson`. Legacy ids
  // resolve via aliases, so a ugc/inspirational run is byte-identical.
  const def = getAdType(adType);
  const isUgcLook = def.lookFamily === "ugc_authentic";
  // Service ads are a multi-scene SKIT (distinct settings, clean cuts between
  // scenes, synthesized characters speaking) — NOT one continuous take, and there
  // is no physical product to hold constant.
  const isService = def.id === "service";
  const hasPerson = input.hasPerson ?? false;
  const fctx = buildFragmentCtx({
    adStyle,
    hasProduct: Boolean(hasProductSheet),
    hasPerson,
    hooks: input.hooks,
    duration: durationSec >= 30 ? durationSec : 15,
    segmentIndex,
  });
  const isSegment = segmentIndex != null;

  // @Image role numbering, driven by the submitted content order (text → plain
  // refs → asset refs): product (plain, when present) → storyboard strip (asset
  // when there is a person / 60s segment) → face (asset). So product=1,
  // storyboard=2, face=3 with a product sheet; storyboard=1, face=2 otherwise.
  const boardNo = hasProductSheet ? 2 : 1;
  const boardImg = `@Image ${boardNo}`;
  const faceImg = hasProductSheet ? `@Image ${boardNo + 1}` : "@Image 1";
  const hasPresenter = Boolean(anchor) || hasPerson;

  // ONE-line identity legend — the load-bearing anchors, nothing more.
  const legend = [
    hasProductSheet
      ? "@Image 1 is the product — keep its exact shape, colour, finish and markings identical in every shot"
      : "",
    `${boardImg} is the film storyboard — a 2×2 grid of four keyframe panels in reading order (top-left=1, top-right=2, bottom-left=3, bottom-right=4); follow the panels in order, one per time slice`,
    hasPresenter
      ? `${faceImg} is the on-screen person — keep this exact face and identity throughout`
      : "",
  ]
    .filter(Boolean)
    .join("; ");

  // ONE short audio line — TYPE-driven fragment (registry dispatch).
  const audioLine = def.fragments.videoAudioLine(fctx)[0] ?? "";

  // Opening hook — its directive applies to the FIRST time-slice only. Empty
  // when no hook resolved → byte-identical to the pre-hook prompt.
  const hookDirective = fctx.hooks
    ? `OPENING HOOK (first time-slice only): ${hookOpening(fctx.hooks).videoFirstSlice.join(" ")}`
    : "";

  // Shot-rhythm/pacing — LOOK-driven fragment, joined into one compact line.
  // Empty for the legacy looks (ugc/cinematic return []) → byte-identical.
  const pacingLine = def.fragments.videoPacing(fctx).join(" ");

  // 60s: the ONE locked visual-style bible, injected VERBATIM.
  const lockedStyle =
    isSegment && visualStyle?.trim() ? visualStyle.trim() : "";
  const others = (otherSummaries ?? []).filter((s) => s?.trim());
  const segCount = input.segmentCount ?? 4;
  // FROZEN continuity block — the N segments are generated independently and
  // ffmpeg-merged, so the ONLY thing carrying continuity is the same reference
  // sheets + the SAME identity tokens repeated verbatim in every segment's
  // prompt. The `anchor` string is byte-identical across segments (it's the
  // run's person brief), and `lockedStyle` (the visual-style bible) is injected
  // verbatim too — together they pin identity + look so the clips cut together.
  const continuity = isSegment
    ? [
        `This is part ${segmentIndex + 1} of ${segCount} of one continuous ${segCount * 15}-second ad — the ${segCount} clips are merged, so they MUST cut together seamlessly.`,
        anchor
          ? `FROZEN identity (identical, verbatim, in every part): ${anchor}.`
          : "",
        "Keep the SAME person, wardrobe, product, lighting, lens and energy as the other parts; never restyle or re-cast anything between parts.",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  // The example slice layout for the literal format line (panel-count aware).
  const exampleSlices = buildSliceBrackets(durationSec, scenes.length || 4)
    .map((s, i) => `${s}: <panel ${i + 1} action>`)
    .join("; ");

  const system = [
    "You are a prompt writer for Seedance 2.0, a multi-shot AI video model.",
    `Write ONE short, SIMPLE video prompt for a ~${durationSec}s, fully photorealistic live-action ${isUgcLook ? "UGC-style ad" : "commercial"} in the "${adStyle}" style.`,
    isService
      ? `A film storyboard is attached as ${boardImg}: a 2×2 grid of FOUR keyframe panels in reading order (01→04), ONE per scene. Use it as the LOOK + identity reference. Render the FOUR scenes in order as a short live-action SKIT with a clean CUT between each — they are DISTINCT settings/moments (the world and lighting may change between scenes), NOT one continuous take. Each output frame is ONE single scene that FILLS THE WHOLE FRAME — never reproduce the 2×2 grid, never split the frame into panels or a side-by-side/collage. The sheet's panel-number badges, grid lines, labels and caption bars are PRODUCTION ANNOTATIONS — NEVER render any of them.`
      : `A film storyboard is attached as ${boardImg}: a 2×2 grid of FOUR keyframe panels in reading order (01→04). Use it as the LOOK reference — framing, identity, product, setting — NOT as a timeline; the beat order comes from the timestamped slices below. Render ONE continuous live-action take with NO cuts, the beats flowing smoothly into one another. Each output frame is ONE single scene that FILLS THE WHOLE FRAME — never reproduce the 2×2 grid itself, never split the frame into panels or a side-by-side/collage. The sheet's panel-number badges, grid lines, split-screen dividers, before/after labels and bottom caption bars are PRODUCTION ANNOTATIONS — NEVER render any of them in the frame.`,
    `Identity anchors — ${legend}. After any \`@Image N\` reference, immediately name what it is.`,
    lockedStyle
      ? `Locked visual style — match this EXACTLY (identical across all clips of the ad; do not reinterpret it): ${lockedStyle}`
      : "",
    "FORMAT — return EXACTLY this shape as ONE single-line string:",
    `"Generate a scene using shots in the uploaded film storyboard ${exampleSlices}."`,
    isService
      ? "For EACH slice: ONE SHORT clause — the camera's single move (or HOLD steady), the one key action, then the character's spoken line in quotes. ONE speaker per slice (never two people talking at once — cut to whoever speaks). Keep motion natural and stable. Do NOT restate the characters' looks, wardrobe or the lighting in each slice — the storyboard carries that; no adjective stacking."
      : "",
    isService ? "" : "For EACH slice: ONE SHORT clause — the camera's single move (or HOLD steady), the one key action, then the spoken line in quotes. Keep motion slow and stable; the product holds ONE fixed shape (no morph or duplicate); any prep (opening, unclasping) comes in an EARLIER slice and persists. Do NOT restate the person's look, wardrobe, lighting or style in each slice — the reference images carry that; no adjective stacking.",
    audioLine,
    isService
      ? ""
      : hasPresenter
        ? "Audio uses ONE single voice for the whole ad — the on-screen person's own voice, matching their apparent age and gender, the SAME voice in every beat; never a second or overlapping voice."
        : "Audio uses ONE consistent voiceover — a single voice for the whole ad, the same in every beat; never a second or overlapping voice.",
    hookDirective,
    pacingLine,
    formatBrand(input.brandText),
    `Frame for ${FRAME_LABEL[aspectRatio].full}. HARD LIMIT — the WHOLE videoPrompt is at most ~90 words; Seedance ignores long prompts, so be terse and front-load the first beat. Each slice is ONE short clause (camera + one action + the quoted line); NEVER re-describe the person, wardrobe, lighting or style (the reference images carry that). End with ONE short render-constraint clause: no on-screen text, captions, badges or grid.`,
    'Return STRICT JSON only: {"videoPrompt": "<ONE single-line string, NO raw line breaks>"}.',
  ]
    .filter(Boolean)
    .join(" ");

  const speakerLabel = isService || isUgcLook ? "spoken" : "voiceover";
  const slices = buildSliceBrackets(durationSec, scenes.length);
  const sceneLines = scenes
    .map((s, i) => {
      const slice = slices[i] ?? "";
      const desc =
        s.sceneDescription?.trim() ||
        s.actionMovement?.trim() ||
        "continue the scene naturally";
      const said = s.transcript?.trim()
        ? ` (${speakerLabel}: "${s.transcript.trim()}")`
        : "";
      return `Panel ${i + 1} ${slice}: ${desc}${said}`;
    })
    .join("\n");

  const critiqueBlock = critique
    ? `\n\nA prior attempt was rejected. Fix exactly this, keeping the simple timestamped shot-list format: ${critique}`
    : "";

  const user = [
    `Ad prompt: ${userPrompt}`,
    `Ad type: ${adType}`,
    `Target duration: ~${durationSec}s`,
    continuity ? `Continuity: ${continuity}` : "",
    others.length
      ? `Other parts (continuity only): ${others.map((s) => s.trim()).join(" | ")}`
      : "",
    lockedStyle ? `Locked visual style: ${lockedStyle}` : "",
    "Storyboard panels (in order) — write ONE timestamped slice per panel, honoring each panel's description and its spoken/voiceover line:",
    sceneLines,
    'Return JSON: { "videoPrompt": "<one single-line string in the timestamped shot-list format>" }',
    critiqueBlock,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Deterministic fallback prompt — built directly from the storyboard scenes,
 * no LLM. Used when the LLM prompt step returns empty/unparseable JSON, so the
 * video step never fails on a prompt hiccup. ONE single-line string (no raw
 * newlines), the SAME simple timestamped shot-list shape as the LLM target.
 */
export function buildDeterministicVideoPrompt(input: {
  adStyle: string;
  /** OPEN ad-type id — dispatched through the ad-type registry. */
  adType: string;
  scenes: StoryboardScene[];
  durationSec: number;
  aspectRatio: AspectRatio;
  characterAnchor?: string;
  /** 60s: this clip's segment index (0..3). Shifts the @Image numbering. */
  segmentIndex?: number;
  /** 60s: whether the shared product sheet is attached (product = @Image 1). */
  hasProductSheet?: boolean;
  /** Optional user-typed brand guidelines (`runs.brand_text`), injected verbatim. */
  brandText?: string;
}): string {
  const { adStyle, adType, scenes, durationSec, aspectRatio } = input;
  const def = getAdType(adType);
  const ugc = def.lookFamily === "ugc_authentic";
  // Service ads are a multi-scene skit (clean cuts, synthesized characters
  // speaking, no physical product to hold constant).
  const isService = def.id === "service";
  const brandTail = formatBrand(input.brandText)
    ? ` ${formatBrand(input.brandText)}.`
    : "";
  const anchor = (input.characterAnchor ?? "").trim();
  const fctx = buildFragmentCtx({
    adStyle,
    hasProduct: Boolean(input.hasProductSheet),
    hasPerson: Boolean(anchor) || ugc,
    duration: durationSec >= 30 ? durationSec : 15,
    segmentIndex: input.segmentIndex,
  });
  // Same @Image numbering as buildVideoPrompt: product=1, storyboard=2, face=3
  // with a product sheet; storyboard=1, face=2 otherwise.
  const boardNo = input.hasProductSheet ? 2 : 1;
  const boardRef = `@Image ${boardNo}`;
  const faceRef = input.hasProductSheet ? `@Image ${boardNo + 1}` : "@Image 1";
  const productPin = input.hasProductSheet
    ? "@Image 1 is the product — keep its exact identity, finish and markings identical in every shot. "
    : "";
  const presenterPin =
    anchor || ugc
      ? `${faceRef} is the on-screen person — keep this exact person (same apparent gender, age, face and hair) throughout. `
      : "";
  const voice = anchor
    ? `a natural, real human voice fitting ${anchor}`
    : (def.fragments.videoVoice(fctx)[0] ?? "");
  const count = scenes.length || 1;
  const slices = buildSliceBrackets(durationSec, count);
  const speak = isService ? "speaks in English" : ugc ? "spoken" : "voiceover";
  const shots = scenes
    .map((s, i) => {
      const slice = slices[i] ?? "";
      const cam = s.cameraAngle?.trim() || "steady camera";
      const action =
        s.sceneDescription?.trim() ||
        s.actionMovement?.trim() ||
        "continue the scene naturally";
      const said = s.transcript?.trim()
        ? `, ${speak}: "${s.transcript.trim()}"`
        : "";
      return `${slice}: ${action} (${cam})${said}`;
    })
    .join("; ");
  const audio = isService
    ? "Audio: each character speaks their line lip-synced with the mouth visible, ONE speaker per shot (cut to whoever speaks, never two voices at once); light location ambience and a fitting score."
    : ugc
      ? `Audio: the on-screen person speaks each line lip-synced in ${voice}, ONE single voice throughout with the mouth visible while speaking, never a second or overlapping voice; light room ambience, no music.`
      : `Audio: ${voice} narrates each line as a single voiceover, the same ONE voice throughout, never a second or overlapping voice; a light score is allowed.`;

  // Service ads: a multi-scene skit rendered with clean CUTS between distinct
  // scenes (no continuous take, no product-object constraint).
  if (isService) {
    return (
      `Generate a short live-action SKIT from the uploaded film storyboard ${boardRef} — a 2×2 grid of four keyframe panels (01→04), ONE per scene, used as the LOOK + identity reference. Render the four scenes IN ORDER with a clean CUT between each (DISTINCT settings/moments; the lighting may shift) in the "${adStyle}" style; each output frame is ONE single scene that FILLS THE WHOLE FRAME — never reproduce the 2×2 grid, never split the frame into panels or a side-by-side/collage. ${presenterPin}` +
      `${shots}. ` +
      `Each character's face, hair and wardrobe stay consistent across the scenes they appear in; ONE speaker per shot; motion natural and stable, ONE camera move per shot. ${audio}${brandTail} ` +
      `Frame for ${FRAME_LABEL[aspectRatio].short}. Keep any in-scene on-screen text from the keyframes (a stat, a price, the end-card line) legible, but NEVER render the sheet's panel-number badges, grid lines, dividers or bottom caption bars. ONE full-frame scene per shot with clean cuts between scenes, never a split-screen or panel grid.`
    );
  }

  // Every other look is one continuous photoreal live-action take.
  return (
    `Generate a scene using shots in the uploaded film storyboard ${boardRef} — a 2×2 grid of four keyframe panels (01→04) used as the LOOK reference (framing, identity, product), NOT a timeline; the beat order is the timestamped slices below. Render ONE continuous, photorealistic live-action take with NO cuts in the "${adStyle}" style; each output frame is ONE single scene that FILLS THE WHOLE FRAME — never reproduce the 2×2 grid, never split the frame into panels or a side-by-side/collage; the sheet's panel-number badges, grid lines and bottom caption bars are production annotations — NEVER render any of them. ${productPin}${presenterPin}` +
    `${shots}. ` +
    `The camera makes at most ONE slow move per beat (or holds steady) and all motion stays slow and physically stable; the product is ONE solid object that does not bend, stretch, melt or duplicate — the same shape, finish and exact part-count in every frame, hands touching its outer surface only and never passing through it; any prep comes in an earlier slice and its changed state persists. ${audio}${brandTail} ` +
    `Frame for ${FRAME_LABEL[aspectRatio].short}. Keep the SAME single person and product across all beats. ONE full-frame scene per shot, never a split-screen or panel grid. No on-screen text, captions, badges, panel grid or watermark${ugc ? "; no background music" : ""}.`
  );
}
