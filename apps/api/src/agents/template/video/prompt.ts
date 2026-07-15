// Template-owned Seedance video prompt.
//
// Deliberately SEPARATE from the normal `video/prompt.ts`: a template run's
// footage is PLAIN live action - the After Effects template composites every
// piece of text, caption, logo and graphic on top afterwards, so the clip must
// carry NONE of that baked in. This module imports nothing from `../../ad-types`
// or `../../video/prompt.js`; the whole prompt is authored from the template's
// own plan + storyboard beats.
//
// The clip is ONE continuous full-frame take (the template slices it 1:1 by
// composition time, `slices.ts`), whose consecutive beats are aligned to the
// per-slot time windows. Conventions follow the Seedance 2.0 guide
// (`.claude/skills/seedance-2.0-prompting`, `research/04`): 60-100 words,
// front-loaded, explicit motion in causal order, short positive phrasing, one
// camera move per beat, spoken lines in double quotes, constraints LAST.

import type { ChatMessage } from "../../../providers/openai/index.js";
import { formatBrand } from "../../../lib/brand.js";

/** One beat of the single continuous take. */
export interface TemplateVideoScene {
  /** What the master shows during this beat's window. */
  sceneDescription: string;
  /** Spoken/voiceover line for this beat (empty ⇒ no line). */
  transcript: string;
  /** Optional single camera move for this beat. */
  cameraAction?: string;
}

export interface TemplateVideoPromptInput {
  userPrompt: string;
  /** Optional user-typed brand guidelines (`runs.brand_text`), injected verbatim. */
  brandText?: string;
  /** Factual product identity anchor (`runs.product_brief`) - pins what it IS. */
  productBrief?: string;
  /** The plan's one-line concept, as look/story context. */
  conceptSummary?: string;
  /** Phase-2 look bible (may be empty in Phase 1). Matched EXACTLY when present. */
  visualStyle?: string;
  /** Output aspect ratio (e.g. `16:9` / `9:16`). */
  aspectRatio: string;
  /** Target clip length in seconds - the master covers ~this long. */
  durationSec: number;
  /** Whether a consistent on-screen person appears. */
  hasPerson: boolean;
  /** Presenter identity (gender/age/hair) to PIN, from `runs.person_brief`. */
  characterAnchor?: string;
  /** Ordered beats of the single take (index-aligned with `slotWindows`). */
  scenes: TemplateVideoScene[];
  /** Per-beat timeline windows into the master (index-aligned with `scenes`). */
  slotWindows: { startSec: number; durationSec: number }[];
}

/**
 * The short negative tail forbidding any baked graphics - the template owns all
 * on-screen text and overlays, so the footage must be clean live action. Kept
 * short and positive-leading per the Seedance guide (long negative lists get
 * ignored). Appended by `template/video/index.ts` after the prompt body.
 */
export const TEMPLATE_VIDEO_NEGATIVES =
  "Plain live-action footage only — one clean full-frame take; the template adds every caption, logo and graphic on top afterwards, so keep the frame free of on-screen text, UI screens and end-cards.";

/** `M:SS` timestamp for the bracketed Seedance shot list. */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Readable frame-orientation label for the Seedance directive. */
function frameLabel(aspectRatio: string): string {
  if (aspectRatio === "9:16") return "9:16 vertical (portrait)";
  if (aspectRatio === "16:9") return "16:9 widescreen (horizontal)";
  return aspectRatio;
}

/**
 * The timestamped shot list, one entry per beat, built from the beats' real
 * timeline windows (clamped to the clip). Falls back to an even split for any
 * beat missing a window so the list is always complete.
 */
function shotList(input: TemplateVideoPromptInput): string[] {
  const { scenes, slotWindows, durationSec } = input;
  const n = scenes.length || 1;
  return scenes.map((s, i) => {
    const w = slotWindows[i];
    const start = w ? w.startSec : (i / n) * durationSec;
    const end = w
      ? Math.min(durationSec, w.startSec + w.durationSec)
      : i === n - 1
        ? durationSec
        : ((i + 1) / n) * durationSec;
    const bracket = `[${fmtTime(start)}-${fmtTime(end)}]`;
    const desc = s.sceneDescription?.trim() || "continue the scene naturally";
    const cam = s.cameraAction?.trim() ? ` ${s.cameraAction.trim()}.` : "";
    const said = s.transcript?.trim()
      ? ` (voiceover: "${s.transcript.trim()}")`
      : "";
    return `${bracket} ${desc}${cam}${said}`;
  });
}

/**
 * Build the template Video Builder messages. The LLM turns the plan's per-slot
 * beats + windows into ONE short Seedance shot-list directive for a single
 * continuous PLAIN take. Appearance/identity ride in the reference images (the
 * clean look-still, the product sheet, and the face when present); the prompt is
 * about motion, camera, pacing, audio and the plain-footage constraints.
 */
export function buildTemplateVideoPrompt(
  input: TemplateVideoPromptInput,
): ChatMessage[] {
  const {
    userPrompt,
    brandText,
    productBrief,
    conceptSummary,
    visualStyle,
    aspectRatio,
    durationSec,
    hasPerson,
    characterAnchor,
  } = input;
  const anchor = (characterAnchor ?? "").trim();
  const hasPresenter = hasPerson || Boolean(anchor);
  const shotLines = shotList(input).join("\n");

  const system = [
    "You are a prompt writer for Seedance 2.0, a photorealistic live-action AI video model.",
    `Write ONE short video prompt for a ~${durationSec}s clip — the raw FOOTAGE for an After Effects template that composites all text, captions, logos and graphics on top afterwards, so the footage stays plain live action with none of that baked in.`,
    "Render ONE continuous full-frame take (no hard cuts) that moves smoothly through the beats below; each beat is a DISTINCT moment of that take — vary the framing (wide / medium / close) and let the camera travel between beats, one smooth camera move per beat.",
    hasPresenter
      ? `Keep ONE consistent on-screen person${anchor ? ` (${anchor})` : ""} — same face, hair and wardrobe — throughout; never re-cast or restyle them.`
      : "",
    "Keep the same product and overall look/setting across the take: identity and materials stay constant while framing and action advance.",
    productBrief?.trim()
      ? `The product is ${productBrief.trim()} — keep its exact shape, colour, finish and markings in every beat.`
      : "",
    visualStyle?.trim()
      ? `Match this look and colour palette: ${visualStyle.trim()}.`
      : "",
    conceptSummary?.trim() ? `Concept: ${conceptSummary.trim()}.` : "",
    formatBrand(brandText),
    `Frame for ${frameLabel(aspectRatio)}. Soft natural light, neutral white balance, real photographic motion.`,
    "Put any spoken line in double quotes, 5-10 words; ONE single voice for the whole clip, mouth visible while speaking, never overlapping voices.",
    "HARD LIMIT — the whole videoPrompt is 60–100 words; front-load the first beat, one short clause per beat (one action + one smooth camera move).",
    'Return STRICT JSON only: {"videoPrompt": "<ONE single-line string, NO raw line breaks>"}.',
  ]
    .filter(Boolean)
    .join(" ");

  const user = [
    `Ad prompt: ${userPrompt}`,
    `Target duration: ~${durationSec}s - ONE continuous take, no cuts.`,
    "Beats of the single take (write ONE short timestamped clause per beat, honoring its description, camera action and spoken line, keeping the same place/person/product/look throughout):",
    shotLines,
    'Return JSON: { "videoPrompt": "<one single-line string in the timestamped shot-list format>" }',
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Deterministic, LLM-free fallback - built straight from the beats + windows
 * with the SAME rules as the LLM target, so the template video step never fails
 * on a prompt/parse hiccup. ONE single-line string, no raw newlines.
 */
export function buildDeterministicTemplateVideoPrompt(
  input: TemplateVideoPromptInput,
): string {
  const {
    durationSec,
    hasPerson,
    characterAnchor,
    productBrief,
    visualStyle,
    conceptSummary,
    brandText,
    aspectRatio,
  } = input;
  const anchor = (characterAnchor ?? "").trim();
  const hasPresenter = hasPerson || Boolean(anchor);
  const shots = shotList(input).join("; ");
  const personPin = hasPresenter
    ? `Keep ONE consistent on-screen person${anchor ? ` (${anchor})` : ""} - the same face, hair and wardrobe - throughout. `
    : "";
  const productPin = productBrief?.trim()
    ? `Keep the product (${productBrief.trim()}) identical in every beat - same shape, colour, finish and markings. `
    : "";
  const stylePin = visualStyle?.trim()
    ? `Match this look exactly: ${visualStyle.trim()}. `
    : conceptSummary?.trim()
      ? `${conceptSummary.trim()}. `
      : "";
  const brandTail = formatBrand(brandText) ? ` ${formatBrand(brandText)}.` : "";
  return (
    `Generate ONE continuous, photorealistic live-action take (~${durationSec}s, no hard cuts) that fills the whole frame throughout and moves smoothly through the beats below, each a distinct moment. ` +
    `${personPin}${productPin}${stylePin}` +
    `${shots}. ` +
    `Keep the same product, person and overall look/setting across the take while framing and action advance; one smooth camera move per beat; put any spoken line in double quotes with ONE single voice throughout, never overlapping voices.${brandTail} ` +
    `Frame for ${frameLabel(aspectRatio)}. Soft natural light, neutral white balance. Plain live-action footage only — the template adds every caption, logo and graphic on top, so keep the frame free of on-screen text, UI and end-cards.`
  );
}
