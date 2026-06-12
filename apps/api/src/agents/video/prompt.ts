import type { AdType, AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

/** Per-ratio frame-orientation labels baked into the Seedance directive. */
const FRAME_LABEL: Record<AspectRatio, { full: string; short: string }> = {
  "16:9": { full: "16:9 widescreen (horizontal)", short: "16:9 widescreen" },
  "9:16": { full: "9:16 vertical (portrait)", short: "9:16 vertical" },
};

/**
 * Neutral, tunable voice tags — declared ONCE in the audio line and held for the
 * whole clip to keep tone/accent steady. No region/accent word (neutral by
 * design); retune in this one spot if a different voice is wanted.
 */
const VOICE: Record<AdType, string> = {
  ugc: "a warm, conversational, natural-sounding voice",
  inspirational: "a calm, measured narrator",
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
  adType: AdType;
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
  const ugc = adType === "ugc";
  const isSegment = segmentIndex != null;

  // @Image role numbering, driven by the submitted content order (text → plain
  // refs → asset refs): product (plain, when present) → storyboard strip (asset
  // when there is a person / 60s segment) → face (asset). So product=1,
  // storyboard=2, face=3 with a product sheet; storyboard=1, face=2 otherwise.
  const boardNo = hasProductSheet ? 2 : 1;
  const boardImg = `@Image ${boardNo}`;
  const faceImg = hasProductSheet ? `@Image ${boardNo + 1}` : "@Image 1";
  const hasPresenter = Boolean(anchor) || ugc;

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

  // ONE short audio line (the user's chosen middle ground — simple shot list +
  // reliable spoken UGC / voiceover, not a full audio-engineering paragraph).
  const audioLine = ugc
    ? "Audio: the on-screen person SPEAKS each line lip-synced in a natural, real human voice (the SAME voice throughout, fitting their apparent age, gender and energy); quote each line verbatim in its slice, keep it short, mouth visible while speaking; light room ambience, no music."
    : "Audio: a natural, real human VOICEOVER narrates each line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short; a light fitting score is allowed.";

  // 60s: the ONE locked visual-style bible, injected VERBATIM.
  const lockedStyle =
    isSegment && visualStyle?.trim() ? visualStyle.trim() : "";
  const others = (otherSummaries ?? []).filter((s) => s?.trim());
  const segCount = input.segmentCount ?? 4;
  const continuity = isSegment
    ? `This is part ${segmentIndex + 1} of ${segCount} of one continuous ${segCount * 15}-second ad; keep the SAME person, wardrobe, product state, lighting and energy as the other parts so the ${segCount} clips cut together seamlessly.`
    : "";

  // The example slice layout for the literal format line (panel-count aware).
  const exampleSlices = buildSliceBrackets(durationSec, scenes.length || 4)
    .map((s, i) => `${s}: <panel ${i + 1} action>`)
    .join("; ");

  const system = [
    "You are a prompt writer for Seedance 2.0, a multi-shot AI video model.",
    `Write ONE short, SIMPLE video prompt for a ~${durationSec}s, fully photorealistic live-action ${ugc ? "UGC-style ad" : "commercial"} in the "${adStyle}" style.`,
    `A film storyboard is attached as ${boardImg}: a 2×2 grid of FOUR keyframe panels in reading order (top-left=1, top-right=2, bottom-left=3, bottom-right=4). Panel N is the keyframe for time slice N — follow them in order. Render ONE continuous live-action shot; NEVER show the grid, panel borders, badges or caption text — they are direction only.`,
    `Identity anchors — ${legend}. After any \`@Image N\` reference, immediately name what it is.`,
    lockedStyle
      ? `Locked visual style — match this EXACTLY (identical across all clips of the ad; do not reinterpret it): ${lockedStyle}`
      : "",
    "FORMAT — return EXACTLY this shape as ONE single-line string:",
    `"Generate a scene using shots in the uploaded film storyboard ${exampleSlices}."`,
    "For EACH slice: ONE plain sentence — the subject, the action/motion in that panel, and ONE camera move (static, pan, tilt, dolly, push or tracking). Concrete and short; say what the product visibly DOES so it reads as genuinely working. Any prep step (opening, unclasping) goes in an EARLIER slice and its changed state persists.",
    audioLine,
    `Frame for ${FRAME_LABEL[aspectRatio].full}. Keep the WHOLE prompt SHORT and front-loaded; lean on the attached images for look and identity instead of re-describing them. No on-screen text, captions or watermark.`,
    'Return STRICT JSON only: {"videoPrompt": "<ONE single-line string, NO raw line breaks>"}.',
  ]
    .filter(Boolean)
    .join(" ");

  const speakerLabel = ugc ? "spoken" : "voiceover";
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
  adType: AdType;
  scenes: StoryboardScene[];
  durationSec: number;
  aspectRatio: AspectRatio;
  characterAnchor?: string;
  /** 60s: this clip's segment index (0..3). Shifts the @Image numbering. */
  segmentIndex?: number;
  /** 60s: whether the shared product sheet is attached (product = @Image 1). */
  hasProductSheet?: boolean;
}): string {
  const { adStyle, adType, scenes, durationSec, aspectRatio } = input;
  const ugc = adType === "ugc";
  const anchor = (input.characterAnchor ?? "").trim();
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
    : VOICE[adType];
  const count = scenes.length || 1;
  const slices = buildSliceBrackets(durationSec, count);
  const speak = ugc ? "spoken" : "voiceover";
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
  const audio = ugc
    ? `Audio: the on-screen person speaks each line lip-synced in ${voice}, the same voice throughout, mouth visible while speaking; light room ambience, no music.`
    : `Audio: ${voice} narrates each line as voiceover, the same voice throughout; a light score is allowed.`;
  return (
    `Generate a scene using shots in the uploaded film storyboard ${boardRef} — a 2×2 grid of four keyframe panels in reading order (top-left=1, top-right=2, bottom-left=3, bottom-right=4), one per time slice in order. Render ONE continuous, photorealistic live-action ad in the "${adStyle}" style; show only the clean live scene (no grid, badges or captions). ${productPin}${presenterPin}` +
    `${shots}. ` +
    `Show the product genuinely working (its real motion); any prep comes in an earlier slice and its changed state persists. ${audio} ` +
    `Frame for ${FRAME_LABEL[aspectRatio].short}. Keep the SAME person and product across all beats. No on-screen text, captions or watermark${ugc ? "; no background music" : ""}.`
  );
}
