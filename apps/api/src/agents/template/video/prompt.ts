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
import type { SceneSpeaker } from "../../image/storyboard/prompt.js";

/** One beat of the single continuous take. */
export interface TemplateVideoScene {
  /** What the master shows during this beat's window. */
  sceneDescription: string;
  /** Spoken/voiceover line for this beat (empty ⇒ no line). */
  transcript: string;
  /** Optional single camera move for this beat. */
  cameraAction?: string;
  /** Who says `transcript`. Absent ⇒ unattributed ⇒ the single-voice path. */
  speaker?: SceneSpeaker;
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
  /**
   * Everyone who speaks, deduped RUN-wide — drives the voicing mode.
   *
   * Run-level, never derived from this segment's own scenes: a segment where only
   * one person happens to talk must still carry the same block, or the ad flips
   * voicing mode halfway through.
   */
  cast?: SceneSpeaker[];
}

/**
 * The distinct speakers who actually SAY something, in first-appearance order.
 * Only a speaker with a line earns a voice — describing a silent extra spends
 * tokens and invites the model to voice them.
 */
export function castOf(scenes: TemplateVideoScene[]): SceneSpeaker[] {
  const out = new Map<string, SceneSpeaker>();
  for (const s of scenes) {
    if (!s.speaker?.id || !s.transcript?.trim()) continue;
    if (!out.has(s.speaker.id)) out.set(s.speaker.id, s.speaker);
  }
  return [...out.values()];
}

/**
 * The FROZEN voice block — built ONCE per run and reused UNCHANGED in every
 * segment's prompt.
 *
 * Deliberately NOT routed through the LLM. `composeVideoBody` rewrites the shot
 * list into `videoPrompt`, and it WOULD paraphrase a descriptor placed there —
 * segment 1 "a warm woman in her late 20s", segment 2 "a friendly young female
 * voice" — which is exactly the cross-segment drift a merged ad must not have.
 * `research/04` is explicit that an IDENTICAL VERBATIM descriptor per segment is
 * the only mitigation, so this is emitted as a deterministic prefix alongside
 * `rolesText`, which is byte-identical across segments for the same reason.
 *
 * Returns "" when nobody speaks ⇒ the prompt is unchanged from before speakers.
 */
export function buildVoiceBlock(cast: SceneSpeaker[]): string {
  if (cast.length === 0) return "";
  if (cast.length === 1) {
    const only = cast[0] as SceneSpeaker;
    return `Voice — ${only.role}: ${only.voice}. ONE single voice for the whole clip, mouth visible while speaking, never overlapping voices. `;
  }
  const legend = cast.map((c) => `${c.role}: ${c.voice}`).join("; ");
  return `Voices — ${legend}. Each quoted line is spoken ONLY by the person named before it, in exactly that voice — never swap these voices between them; one voice at a time, never overlapping, mouth visible while that person speaks. `;
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
    // The speaker's `role` IS the per-line key — a self-describing noun phrase
    // ("the woman"), not an opaque symbol, so the model binds it straight to the
    // person on screen with no legend lookup. Costs the same ~2 tokens the old
    // hardcoded "voiceover" did, and an unattributed line still renders that exact
    // legacy string.
    const who = s.speaker?.role?.trim() || "voiceover";
    const said = s.transcript?.trim() ? ` (${who}: "${s.transcript.trim()}")` : "";
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
    // The voices themselves are described by the FROZEN block in `index.ts`, never
    // here: this text goes to the LLM, which paraphrases, and a second competing
    // descriptor would contradict the block and drift between segments.
    (input.cast?.length ?? 0) > 1
      ? 'Put every spoken line in double quotes, 5-10 words, and KEEP its speaker prefix EXACTLY as written in the beat (e.g. `the woman: "..."`) — never drop a prefix, never reassign a line to a different speaker, never let two people speak at once. Do NOT describe what any voice sounds like.'
      : "Put any spoken line in double quotes, 5-10 words; ONE single voice for the whole clip, mouth visible while speaking, never overlapping voices. Do NOT describe what the voice sounds like.",
    `HARD LIMIT — the whole videoPrompt is ${(input.cast?.length ?? 0) > 1 ? "60–90" : "60–100"} words; front-load the first beat, one short clause per beat (one action + one smooth camera move).`,
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
    // No voice clause here: `index.ts` prepends the frozen voice block to THIS body
    // too, so restating it would double up and, for a two-speaker ad, contradict it.
    `Keep the same product, person and overall look/setting across the take while framing and action advance; one smooth camera move per beat; put any spoken line in double quotes.${brandTail} ` +
    `Frame for ${frameLabel(aspectRatio)}. Soft natural light, neutral white balance. Plain live-action footage only — the template adds every caption, logo and graphic on top, so keep the frame free of on-screen text, UI and end-cards.`
  );
}
