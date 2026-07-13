// Template Plan prompt — the FIRST step of a template run, before any image or
// video spend.
//
// One cheap call reads the template's slot inventory (what kinds, how big, what
// the placeholder says) plus the ad brief, and decides what each slot should
// contain. Every downstream agent then reads that plan, which is what keeps the
// copy, the generated images and the clip describing the SAME ad instead of
// three unrelated ones.
//
// The model NEVER sees `brand` or `decorative` image slots: the deterministic
// `classifyImageSlot` heuristic removed them before this prompt is built, and it
// cannot promote them back. It only arbitrates the ambiguously-named `content`
// slots (`PH_2`, `Media_3` — which is most real templates).

import { formatBrand } from "../../../lib/brand.js";
import type { ChatMessage } from "../../../providers/openai/index.js";

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
  /** VIDEO: seconds into the 15s master where this slot's piece begins. */
  startSec?: number | null;
  /** VIDEO: how long this slot is on screen, in seconds. */
  durationSec?: number | null;
}

export interface TemplatePlanPromptInput {
  userPrompt: string;
  adType: string;
  adStyle: string;
  brandText?: string;
  productBrief?: string;
  /** The clip length this template's composition asks for. */
  clipSeconds: number;
  aspectRatio: string;
  slots: PlanSlotInput[];
}

/** `1200x120` / `—` when the layer reports no box. */
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

export function buildTemplatePlanPrompt(
  input: TemplatePlanPromptInput,
): ChatMessage[] {
  const hasImages = input.slots.some((s) => s.asset === "IMAGE");
  const hasText = input.slots.some((s) => s.asset === "TEXT");

  const system = [
    "You are planning how to fill a designer's After Effects template for ONE",
    "specific ad. The template has slots: one or more video slots the ad clip",
    "fills, image slots for stills, and text slots for on-screen copy.",
    "",
    "Your job is to decide, for each slot, what it should contain — so that the",
    "clip, the stills and the copy all describe the SAME ad. This plan is read by",
    "every agent downstream, so be concrete and specific to THIS product.",
    "",
    "Rules:",
    "- `role`: name what the slot is FOR in this ad, in a few words (\"the hero",
    '  headline", "the closing CTA", "the product on a kitchen counter").',
    hasText
      ? "- TEXT slots: write `copyIntent` — what the line should SAY and why. Do not\n  write the final words here; the copywriter does that. Respect the character\n  ceiling: a slot capped at 18 characters cannot hold a sentence."
      : "",
    hasImages
      ? [
          "- IMAGE slots: set `fill` true when the slot should hold a photographic",
          "  still of this ad's product or its world, and write `imageSubject`",
          "  describing exactly what to depict. Set `fill` false when the slot is",
          "  clearly NOT a photo — decorative furniture, a texture, a placeholder",
          "  the design does not really use — and omit `imageSubject`. When unsure,",
          "  prefer false: the template's own artwork is always a safe fallback,",
          "  while a wrong generated image is not.",
        ].join("\n")
      : "",
    `- VIDEO slots: the whole ad is ONE continuous ~${input.clipSeconds}s take.`,
    "  Write `videoScene` for EACH video slot — what is on screen during the",
    "  window shown next to it — as consecutive beats of that single take. Keep",
    "  the SAME place, person, product and look across every beat; only the",
    "  framing and the small moment advance (a hand lifts the product, the camera",
    "  pushes in). They are slices of one shot, not separate scenes, so they must",
    "  run together seamlessly in the order listed.",
    "",
    "Return STRICT JSON only (no prose, no markdown fences):",
    "{",
    '  "conceptSummary": "<one sentence: the through-line all slots share>",',
    '  "slots": [',
    // Only describe the fields this template can actually use — naming
    // `imageSubject` to a template with no image slots is noise the model has
    // to reason past.
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
    '      "videoScene": "<VIDEO only>" }',
    "  ]",
    "}",
    "Include exactly one entry per slot listed below, using its exact jobLayerName.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `AD PROMPT: ${input.userPrompt}`,
    input.adStyle ? `Style: ${input.adStyle}` : "",
    `Ad type: ${input.adType}`,
    input.productBrief ? `Product: ${input.productBrief}` : "",
    formatBrand(input.brandText),
    `Output shape: ${input.aspectRatio}, clip length ${input.clipSeconds}s`,
    "",
    "TEMPLATE SLOTS:",
    ...input.slots.map(describeSlot),
    "",
    "Plan the fills now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
