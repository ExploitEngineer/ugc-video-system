// Template Blueprint prompt — the FIRST step of a template run, before any image
// or video spend.
//
// The model is shown TWO things: (1) a deterministic STRUCTURAL INVENTORY of the
// template's slots + their timeline windows (what/where/at which second — exact,
// not sampled), and (2) VISUAL FRAMES of the template playing its OWN placeholder
// content. From those it produces a BLUEPRINT: a per-slot plan PLUS a template-
// wide look bible and an on-screen-text-ownership decision, so the copy, the
// stills and the clip all match the SAME template.
//
// No ad-type, no ad-style-as-authority anywhere: the template dictates the look.
// The model NEVER sees `brand`/`decorative` image slots (removed upstream by
// `classifyImageSlot`); it only arbitrates ambiguous `content` slots.

import { formatBrand } from "../../../lib/brand.js";

export interface PlanSlotInput {
  jobLayerName: string;
  asset: "VIDEO" | "IMAGE" | "TEXT";
  /** TEXT: the template's own placeholder wording — the strongest hint of purpose. */
  currentText?: string;
  /** TEXT: the hard character ceiling this box can render. */
  charBudget?: number;
  /** IMAGE/VIDEO: the layer's pixel box, so the model knows hero vs. inset. */
  width?: number | null;
  height?: number | null;
  /** VIDEO: seconds into the master where this slot's piece begins. */
  startSec?: number | null;
  /** VIDEO: how long this slot is on screen, in seconds. */
  durationSec?: number | null;
}

export interface TemplateBlueprintPromptInput {
  userPrompt: string;
  brandText?: string;
  productBrief?: string;
  /** The clip length this template's composition asks for. */
  clipSeconds: number;
  aspectRatio: string;
  slots: PlanSlotInput[];
  /** Whether frame 1 is the preview poster (vs. the first sampled frame). */
  hasPoster: boolean;
  /** Seconds each sampled frame was taken at, in attach order (after the poster). */
  frameTimestampsSec: number[];
  /**
   * The whole preview CLIP is attached (Gemini video-vision), not stills. Changes
   * the intro to "you are watching the clip" and drops the frame legend — the
   * model sees real timestamps, so it never needs a still-to-second mapping.
   */
  videoMode?: boolean;
  /** Ground-truth `#rrggbb` swatches sampled from the preview poster (may be empty). */
  palette?: string[];
}

/** `1200x120` / `size unknown` when the layer reports no box. */
const box = (w?: number | null, h?: number | null): string =>
  w && h ? `${w}x${h}px` : "size unknown";

/** `0:02` — minutes:seconds, rounded, for a sub-minute clip. */
const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** `plays 0:02–0:05 (2.3s)` — a VIDEO slot's window on the master, when known. */
const videoWindow = (s: PlanSlotInput): string | null => {
  if (s.startSec == null || s.durationSec == null) return null;
  const end = s.startSec + s.durationSec;
  return `plays ${clock(s.startSec)}–${clock(end)} (${s.durationSec.toFixed(1)}s)`;
};

function describeSlot(s: PlanSlotInput, i: number): string {
  const head = `${i + 1}. jobLayerName="${s.jobLayerName}"  [${s.asset}]`;
  if (s.asset === "TEXT") {
    const parts = [head];
    if (s.currentText) parts.push(`placeholder: "${s.currentText}"`);
    if (s.charBudget) parts.push(`MAX ${s.charBudget} characters`);
    return parts.join(" — ");
  }
  const parts = [`${head} — ${box(s.width, s.height)}`];
  if (s.asset === "VIDEO") {
    const w = videoWindow(s);
    if (w) parts.push(w);
  }
  return parts.join(" — ");
}

/** "Frame 1 = poster … Frame 2 = template at 0:02 …" — ties pixels to seconds. */
function frameLegend(input: TemplateBlueprintPromptInput): string[] {
  const lines: string[] = [];
  let n = 1;
  if (input.hasPoster) {
    lines.push(`Frame ${n++} = the preview POSTER (a representative still).`);
  }
  for (const ts of input.frameTimestampsSec) {
    lines.push(`Frame ${n++} = the template at ${clock(ts)}.`);
  }
  return lines;
}

/**
 * Returns the system + user strings for the vision-analysis call. The provider
 * attaches the poster + frames itself, so this only DESCRIBES what the model is
 * looking at (the frame legend) and what to produce.
 */
export function buildTemplateBlueprintPrompt(
  input: TemplateBlueprintPromptInput,
): { system: string; user: string } {
  const hasImages = input.slots.some((s) => s.asset === "IMAGE");
  const hasText = input.slots.some((s) => s.asset === "TEXT");
  const hasFrames = input.hasPoster || input.frameTimestampsSec.length > 0;

  // What the model is looking at, in order of fidelity: the whole clip (Gemini),
  // sampled stills (Claude), or nothing (text-only degrade).
  const visualIntro = input.videoMode
    ? "You are WATCHING the actual rendered template clip end to end (with audio).\nREAD THE LOOK — palette, lighting, mood, pacing, camera and graphic motion — and\nread EXACTLY WHAT HAPPENS at each timestamp: real motion and pacing, observed not\ninferred. The clip shows the template's OWN placeholder content, so read its STYLE\nand timing, and never copy the placeholder's subject."
    : hasFrames
      ? "You are shown VISUAL FRAMES of the template playing its OWN placeholder\ncontent. READ THE LOOK from them — palette, lighting, mood, pacing, camera and\ngraphic motion — and READ WHAT HAPPENS at each second. The frames show the\ntemplate's STYLE, not this ad's subject: never copy the placeholder's subject."
      : "No preview frames are available, so reason about the look from the slot\ninventory and the brief alone.";

  const system = [
    "You are analyzing a designer's finished After Effects template to produce a",
    "production BLUEPRINT for ONE specific ad. The template has slots: video slots",
    "the ad clip fills, image slots for stills, and text slots for on-screen copy.",
    "",
    visualIntro,
    "",
    "Decide, for each slot, what it should contain — so the clip, the stills and the",
    "copy all describe the SAME ad. Be concrete and specific to THIS product.",
    "",
    "Rules:",
    "- `visualStyle`: ONE compact look-bible string capturing the template's palette,",
    "  lighting, mood, pacing and motion, read from the frames. Every downstream",
    "  agent matches this, so the generated footage and stills look like the template.",
    input.palette?.length
      ? "  A sampled colour palette is given below — your `visualStyle` MUST reflect those exact hues."
      : "",
    "- `onScreenText`: decide who owns on-screen text. If the template has TEXT slots",
    '  it owns them → set `owner:"template"` and `requireCleanFootage:true` (the',
    "  generated footage must carry NO text, captions, logos or end-cards — the",
    '  template composites those). No TEXT slots → `owner:"none"`.',
    hasText
      ? "- TEXT slots: write `copyIntent` — what the line should SAY and why. Not the\n  final words. Respect the character ceiling: an 18-char slot cannot hold a sentence."
      : "",
    hasImages
      ? "- IMAGE slots: set `fill` true when the slot should hold a photographic still of\n  this ad's product/world, and write `imageSubject`. Set `fill` false when it is\n  clearly not a photo, and omit `imageSubject`. When unsure, prefer false —\n  the template's own artwork is the safe fallback."
      : "",
    `- VIDEO slots: the whole ad is ONE continuous ~${input.clipSeconds}s take. For`,
    "  EACH video slot write `videoScene` (what is on screen during its window),",
    "  `cameraAction` (one move or a hold) and `onScreenMoment` (what visibly happens",
    "  in those seconds) — as consecutive beats of that single take. Keep the SAME",
    "  place, person, product and look across every beat; only framing and the small",
    "  moment advance. They are slices of one shot, not separate scenes.",
    "- `audio`: `voiceover` = what the spoken line should convey (intent, not verbatim);",
    "  `tone` = the voice character (age/gender/energy). Keep both short.",
    "",
    "Return STRICT JSON only (no prose, no markdown fences):",
    "{",
    '  "conceptSummary": "<one sentence: the through-line all slots share>",',
    '  "visualStyle": "<the look bible>",',
    `  "onScreenText": { "owner": "${hasText ? "template" : "none"}", "requireCleanFootage": true },`,
    '  "audio": { "voiceover": "<what the VO conveys>", "tone": "<voice character>" },',
    '  "slots": [',
    `    { "jobLayerName": "<exact id from the list>", "asset": "${[
      hasText ? "TEXT" : "",
      hasImages ? "IMAGE" : "",
      "VIDEO",
    ]
      .filter(Boolean)
      .join("|")}",`,
    '      "role": "<what it is for>",',
    hasText ? '      "copyIntent": "<TEXT only>",' : "",
    hasImages
      ? '      "fill": true, "imageSubject": "<IMAGE only, when fill is true>",'
      : "",
    '      "videoScene": "<VIDEO only>", "cameraAction": "<VIDEO only>", "onScreenMoment": "<VIDEO only>" }',
    "  ]",
    "}",
    "Include exactly one entry per slot listed below, using its exact jobLayerName.",
  ]
    .filter(Boolean)
    .join("\n");

  const legend = frameLegend(input);
  const user = [
    `AD PROMPT: ${input.userPrompt}`,
    input.productBrief ? `Product: ${input.productBrief}` : "",
    formatBrand(input.brandText),
    `Output shape: ${input.aspectRatio}, clip length ${input.clipSeconds}s`,
    input.palette?.length
      ? `TEMPLATE COLOUR PALETTE (sampled from the preview — the look you produce MUST use these hues): ${input.palette.join(", ")}`
      : "",
    "",
    ...(legend.length
      ? ["FRAME LEGEND (the images attached to this message, in order):", ...legend, ""]
      : []),
    "TEMPLATE SLOTS:",
    ...input.slots.map(describeSlot),
    "",
    "Produce the blueprint now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
