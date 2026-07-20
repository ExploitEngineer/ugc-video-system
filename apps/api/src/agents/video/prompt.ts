import type { AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { getAdType } from "../ad-types/registry.js";
import { buildFragmentCtx } from "../ad-types/fragment-ctx.js";
import { hookOpening } from "../ad-types/hooks/compose.js";
import type { HookSelection } from "../ad-types/types.js";
import type { SupportingRole } from "../types.js";
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
 * Per-look motion structure - the SINGLE source of truth shared by
 * buildVideoPrompt (LLM system), buildDeterministicVideoPrompt AND
 * video/index.ts's appended renderDirective, so the three can never contradict
 * each other (the Phase-2 bug). ugc_authentic runs ONE continuous handheld take;
 * service + cinematic_polished + demo_clean cut cleanly between beats.
 */
export function usesCleanCuts(adType: string): boolean {
  const def = getAdType(adType);
  if (def.id === "service") return true;
  return (
    def.lookFamily === "cinematic_polished" || def.lookFamily === "demo_clean"
  );
}

/**
 * The render-directive sentence appended ONCE in video/index.ts (moved out of
 * its inline ternary so all three motion sites stay consistent). Per-look:
 * service = multi-scene skit with clean cuts; cinematic/demo = clean cuts
 * between beats (demo also pins the product rigid); ugc = one continuous take.
 */
export function videoRenderDirective(adType: string): string {
  const def = getAdType(adType);
  if (def.id === "service")
    return "Play the beats in order as a short live-action skit, a clean cut between each scene; one full-frame scene per shot.";
  if (usesCleanCuts(adType))
    return "Play the beats in order as distinct shots, a clean cut between each; one full-frame shot per beat.";
  return "One continuous live-action take, full frame throughout.";
}

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard panels
 * + per-scene transcripts into ONE SIMPLE Seedance 2.0 shot-list directive — the
 * "Generate a scene using shots in the uploaded film storyboard [0:00-0:04]: …"
 * form — kept deliberately short (Seedance degrades on long prompts; realism is
 * carried by the still, not the prose).
 *
 *   • A film-storyboard guide is attached as `@Image N` — a clean 2×2 of FOUR
 *     keyframe panels (top-left=1 … bottom-right=4), already cropped free of
 *     badges/caption bars/gridlines. Panel N is the keyframe for time slice N;
 *     follow them in order. The OUTPUT is ONE full-frame scene, not a collage.
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
  /** Chunk 4b — text-only supporting roles (product types); a brief mention only. */
  supportingCast?: SupportingRole[];
  /** Panels on the attached sheet, for its description. Defaults to `scenes.length`. */
  boardPanelCount?: number;
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
  // How many panels the attached sheet actually has (a template board renders one
  // per beat). Only the panel-count wording changes; 4 stays byte-identical.
  const boardPanels = input.boardPanelCount ?? (scenes.length || 4);
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
  // Per-look motion mode (single source of truth, shared with the deterministic
  // fallback + video/index.ts's renderDirective). cinematic_polished + demo_clean
  // (and service) CUT between beats; ugc_authentic runs one continuous take.
  const cuts = usesCleanCuts(adType);
  const hasPerson = input.hasPerson ?? false;
  // Chunk 4b — text-only supporting roles (product types). A SHORT mention only;
  // the storyboard still carries their look. Gated so no-cast runs are unchanged.
  const support = !isService
    ? (input.supportingCast ?? []).filter((c) => c.role?.trim())
    : [];
  const supportLine = support.length
    ? `Secondary background ${support.length === 1 ? "figure" : "figures"} from the storyboard (${support.map((c) => c.role).join(", ")}) stay present and consistent but SILENT — no dialogue; do not add or remove people.`
    : "";
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
  const hasPresenter = Boolean(anchor) || hasPerson;

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

  // The still already fixes appearance/identity/product/wardrobe/lighting/setting,
  // so the prompt's whole job is MOTION. Re-describing what the image carries makes
  // the model re-assert stillness instead of animating (official image-to-video
  // guidance), which is why the old ~600-word writer produced stiff, fake action.
  // This writer is short and spends its words on physically-grounded motion verbs.
  const system = [
    "You write ONE short motion prompt for Seedance 2.0, an image-to-video model.",
    `A film storyboard is attached as ${boardImg} — ${boardPanels === 4 ? "four keyframe panels, 2×2, top-left first" : `${boardPanels} keyframe panels, row-major, top-left first`}. It ALREADY fixes the appearance, identity, product, wardrobe, lighting and setting. Your whole job is to describe the MOTION: one beat per panel, in order.`,
    "FORMAT — return EXACTLY this ONE single-line string:",
    `"Generate a scene using shots in the uploaded film storyboard ${exampleSlices}."`,
    // The realism lever: physically-grounded action, not generic verbs or adjectives.
    `For EACH beat write ONE concrete physical action with its MECHANICS and a natural consequence — how the hands, body${hasProductSheet ? " or product" : ""} actually move: weight, contact, follow-through (e.g. "she lifts the mug, feels its weight, then sips, the cup tilting"). Add ONE camera move or a hold. Present tense, causal order ("as", "then").`,
    'Do NOT re-describe appearance, wardrobe, lighting, the product or the setting — the storyboard carries them and re-describing them REDUCES the motion. No praise adjectives (beautiful, smooth, elegant, cinematic); spend the words on verbs.',
    cuts
      ? "Play the beats as distinct shots with a clean cut between each."
      : "Render ONE continuous take, the beats flowing into one another.",
    hasPresenter && (isUgcLook || isService)
      ? 'Attribute each spoken line to the on-screen person with a speaking verb + DOUBLE quotes so it lip-syncs on camera — `she says: "…"` — never a bare quote.'
      : 'Attribute narration as an off-screen voiceover — `a voiceover narrates: "…"`.',
    isService
      ? "ONE speaker per beat — cut to whoever is talking, never two at once."
      : "",
    supportLine,
    audioLine,
    hookDirective,
    pacingLine,
    lockedStyle ? `Match this locked look across every part of the ad: ${lockedStyle}` : "",
    formatBrand(input.brandText),
    `Frame for ${FRAME_LABEL[aspectRatio].full}. Keep the WHOLE prompt tight — one short clause per beat, about 70-90 words total, front-load the first beat. End with: one full-frame scene.`,
    'Return STRICT JSON only: {"videoPrompt": "<ONE single-line string, NO raw line breaks>"}.',
  ]
    .filter(Boolean)
    .join(" ");

  // Research-validated lip-sync trigger (research/04, 2026 refresh): a speaking
  // VERB attribution ("... says: ...") plus the line in DOUBLE quotes makes
  // Seedance voice + lip-sync it to the on-screen speaker; a "narrates" verb keeps
  // a voiceover OFF-screen. So UGC/service lines are attributed with `says`, VO
  // lines with `narrates` — never the old bare `(spoken:/voiceover:)` label, which
  // the model read as ambient audio.
  const speakVerb = isService || isUgcLook ? "says" : "narrates";
  const slices = buildSliceBrackets(durationSec, scenes.length);
  const sceneLines = scenes
    .map((s, i) => {
      const slice = slices[i] ?? "";
      const desc =
        s.sceneDescription?.trim() ||
        s.actionMovement?.trim() ||
        "continue the scene naturally";
      const said = s.transcript?.trim()
        ? ` — ${speakVerb}: "${s.transcript.trim()}"`
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
  /** Chunk 4b — text-only supporting roles (product types); a brief mention only. */
  supportingCast?: SupportingRole[];
  /** Panels on the attached sheet, for its description. Defaults to `scenes.length`. */
  boardPanelCount?: number;
}, opts?: {
  /**
   * Audio-safe retry mode (the video ladder's `audioMode: "safe"`): the run's
   * previous attempt tripped Seedance's OUTPUT-AUDIO moderation on the verbatim
   * scripted lines. Drop the exact quoted transcript from every shot and tell
   * the model to speak GENERIC brand-safe lines instead, so the re-roll keeps
   * audio without repeating the flagged copy. Visuals/motion are unchanged.
   */
  audioSafe?: boolean;
}): string {
  const { adStyle, adType, scenes, durationSec, aspectRatio } = input;
  const audioSafe = opts?.audioSafe ?? false;
  const def = getAdType(adType);
  const ugc = def.lookFamily === "ugc_authentic";
  // Service ads are a multi-scene skit (clean cuts, synthesized characters
  // speaking, no physical product to hold constant).
  const isService = def.id === "service";
  // Per-look motion mode (same source of truth as buildVideoPrompt + index.ts):
  // cinematic_polished + demo_clean CUT between beats; ugc_authentic is one take.
  const cuts = usesCleanCuts(adType);
  const brandTail = formatBrand(input.brandText)
    ? ` ${formatBrand(input.brandText)}.`
    : "";
  // Chunk 4b — text-only supporting roles (product types). Short mention; the
  // storyboard still carries their look. Gated so no-cast runs are unchanged.
  const support = !isService
    ? (input.supportingCast ?? []).filter((c) => c.role?.trim())
    : [];
  const supportClause = support.length
    ? `Secondary background figures (${support.map((c) => c.role).join(", ")}) stay present and consistent but silent. `
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
  const boardRef = `@Image ${input.hasProductSheet ? 2 : 1}`;
  const voice = anchor
    ? `a natural, real human voice fitting ${anchor}`
    : (def.fragments.videoVoice(fctx)[0] ?? "");
  const count = scenes.length || 1;
  const slices = buildSliceBrackets(durationSec, count);
  // Same research-validated attribution as the LLM path: a speaking VERB (`says`)
  // + double-quoted line triggers on-camera lip-sync; `narrates` keeps a voiceover
  // off-screen. (research/04, 2026 refresh.)
  const speak = isService || ugc ? "says" : "narrates";
  const shots = scenes
    .map((s, i) => {
      const slice = slices[i] ?? "";
      const cam = s.cameraAngle?.trim() || "steady camera";
      const action =
        s.sceneDescription?.trim() ||
        s.actionMovement?.trim() ||
        "continue the scene naturally";
      // Audio-safe retry: omit the verbatim scripted line (it tripped the
      // provider's audio moderation). The generic audio directive below tells
      // the model what to say instead; the visuals/action are untouched.
      const said =
        audioSafe || !s.transcript?.trim()
          ? ""
          : `, ${speak}: "${s.transcript.trim()}"`;
      return `${slice}: ${action} (${cam})${said}`;
    })
    .join("; ");
  // In audio-safe mode the model IMPROVISES short, brand-safe spoken lines (no
  // scripted copy is fed) — the earlier attempt's exact lines were flagged.
  // Full mode is byte-identical to the pre-audioSafe strings (regression-locked).
  const safeAudioTail =
    " Keep the spoken lines short, natural and brand-safe — plain conversational talk about the product; do NOT say any specific numbers, prices, percentages, phone numbers, email addresses, URLs, brand or personal names, or any health, medical, or financial claim.";
  let audio: string;
  if (audioSafe) {
    audio = isService
      ? `Audio: each person speaks a short brand-safe line on camera, lips moving, one speaker per shot.${safeAudioTail}`
      : ugc
        ? `Audio: the on-screen person speaks a short brand-safe line on camera in ${voice}, lips moving; ambient room tone, no music.${safeAudioTail}`
        : `Audio: ${voice} narrates a short brand-safe line as an off-screen voiceover.${safeAudioTail}`;
  } else {
    audio = isService
      ? "Audio: each person says their line on camera, lips moving, one speaker per shot."
      : ugc
        ? `Audio: the on-screen person says each line on camera in ${voice}, lips moving; ambient room tone, no music.`
        : `Audio: ${voice} narrates each line as an off-screen voiceover.`;
  }

  // Deterministic fallback: the storyboard still carries appearance/identity, so
  // this stays lean — the beats + audio, no re-description of look or product, no
  // failure-naming rigidity clause (it fought natural handling). Physical grounding
  // lives in the LLM path; here we keep the shot list functional and short.
  if (isService) {
    return (
      `Generate a short live-action skit from the storyboard ${boardRef}, a clean cut between each distinct scene, one full-frame scene per shot, in the "${adStyle}" style. ` +
      `${shots}. ${audio}${brandTail} ` +
      `Frame for ${FRAME_LABEL[aspectRatio].short}. Keep only the in-scene stat / end-card text legible.`
    );
  }

  // Non-service: cinematic_polished + demo_clean CUT between beats; ugc_authentic
  // is ONE continuous take. Same per-look decision as buildVideoPrompt + index.ts.
  const openLine = cuts
    ? `Generate a scene from the storyboard ${boardRef}, the beats in order as distinct shots with a clean cut between each, one full-frame shot per beat, in the "${adStyle}" style.${def.lookFamily === "demo_clean" ? " The product holds its shape across every cut." : ""}`
    : `Generate a scene from the storyboard ${boardRef} as ONE continuous full-frame live-action take, in the "${adStyle}" style.`;
  return (
    `${openLine} ${supportClause}${shots}. ${audio}${brandTail} ` +
    `Frame for ${FRAME_LABEL[aspectRatio].short}. One full-frame scene${ugc ? "; ambient sound, no music" : ""}.`
  );
}
