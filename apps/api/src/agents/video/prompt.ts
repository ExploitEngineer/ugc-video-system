import type { AdType, AspectRatio } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

/** Per-ratio frame-orientation labels baked into the Seedance directive. */
const FRAME_LABEL: Record<AspectRatio, { full: string; short: string }> = {
  "16:9": { full: "16:9 widescreen (horizontal)", short: "16:9 widescreen" },
  "9:16": { full: "9:16 vertical (portrait)", short: "9:16 vertical" },
};

/**
 * Build the Video Builder messages. The LLM turns the ordered storyboard scenes
 * + per-scene transcripts into ONE engineered Seedance 2.0 directive, authored
 * to the Seedance 2.0 prompt-optimizer rules (see `.claude/skills/seedance-prompt`):
 *
 *   • THREE inline labelled segments — global setup · timeline · quality +
 *     constraints. Emitted as ONE single-line string (no raw newlines) so the
 *     `{ "videoPrompt": "…" }` JSON always parses.
 *   • EIGHT core elements — subject, action, setting, light/tone, camera
 *     movement, visual style, image quality, constraints.
 *   • ONE camera movement per time slice (no pan+dolly+zoom at once).
 *   • Mandatory anti-distortion fallback (stable faces, consistent identity,
 *     no clipping/morphing) so the clip comes out clean and realistic.
 *
 * Division of labour: the LABELLED storyboard sheet is attached separately as
 * `@Image 1` (a 2×2 grid of four numbered keyframe panels — the authoritative
 * identity + framing reference AND the ordered shot sequence, panel N → time
 * slice N); this prompt translates the scene plan into motion, single-move
 * camera grammar, mood and synchronized spoken/voiceover audio, and tells the
 * model to follow the panels in order while rendering ONE clean continuous shot
 * that never shows the grid/badges/captions. Spoken lines come from each scene's
 * `transcript` — for UGC the on-screen person says them; for inspirational ads
 * they are voiceover narration over the visuals.
 */
export function buildVideoPrompt(input: {
  adStyle: string;
  adType: AdType;
  userPrompt: string;
  scenes: StoryboardScene[];
  durationSec: number;
  aspectRatio: AspectRatio;
  critique?: string;
}): ChatMessage[] {
  const { adStyle, adType, userPrompt, scenes, durationSec, aspectRatio, critique } =
    input;

  const ugc = adType === "ugc";

  const audioDirective = ugc
    ? 'AUDIO — UGC review: a single on-screen person SPEAKS the transcript lines below in order, natural/conversational/authentic, lip-synced on camera as the primary audio with light realistic ambience and NO background/library music. Quote each line verbatim in its time slice so the model speaks it.'
    : 'AUDIO — inspirational ad: the transcript lines below are VOICEOVER NARRATION over the visuals (not lip-synced on screen), evocative tone, layered with fitting music/ambience. Quote each line verbatim in its time slice.';

  // Ad-type-conditional rendering aesthetic. UGC must read as authentic phone
  // footage, NOT the glossy cinematic polish forced on every type before.
  const globalLook = ugc
    ? "Render as AUTHENTIC UGC: real selfie-style creator footage shot handheld on a modern phone (front or back camera), natural / available light from real windows or lamps, a real lived-in everyday setting with ordinary background clutter, slightly imperfect candid framing with subtle handheld micro-shake and natural reframing, a real everyday person talking directly to camera — NOT a glossy studio commercial, NOT a model on a set."
    : "Render as a polished, cinematic commercial: intentional lighting, rich color and depth, a full-frame cinematic live-action look.";

  const qualityLook = ugc
    ? "it must look like REAL, un-staged phone footage and be INDISTINGUISHABLE from a real person's video — true skin texture with visible pores, fine lines and minor blemishes (NOT smoothed, waxy, airbrushed or plastic), natural hair flyaways, real eyes with natural micro-expressions and blinking, true-to-life available lighting with natural shadows, a subtle phone-camera look (mild sensor grain, natural motion blur, realistic shallow-ish depth of field); authentic handheld feel; NOT studio-polished, NOT a glossy commercial, NO heavy cinematic color grade, NO uncanny/over-symmetric AI face, NO over-saturated HDR sheen"
    : "4K UHD, rich detail, photorealistic real-camera cinematic live-action, real lifelike humans with natural skin/hair and true-to-life lighting";

  // Product-realism negatives — shared, kills the box/unboxing/seam-morph artifacts.
  const productNegatives =
    'NO invented packaging, boxes, cartons, gift boxes, pouches or unboxing, NO "product box", NO duplicated copies of the product, NO opening / unfolding / transforming the product or any container, NO seam-morph or warping of the product — it stays ONE real solid item, worn or in real use; show ONLY the product and the presenter\'s own wardrobe from the reference sheets — NO invented extra accessories or props, and NO other item (especially one the SAME COLOR as the product, e.g. a matching wristband/band) on or near it that could read as part of the product';

  const onScreenNegatives = ugc
    ? "NO background or library music (only the spoken voice and light natural ambience), and NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles, logos or watermark text anywhere in the frame"
    : "NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles, logos or watermark text anywhere in the frame";

  const system = [
    "You are a Seedance 2.0 multimodal video director and prompt engineer for an AI ad-video pipeline.",
    `Author ONE engineered Seedance 2.0 video prompt for a ~${durationSec}s, fully photorealistic live-action ${ugc ? "UGC-style ad" : "commercial ad"} in the "${adStyle}" style.`,
    "A LABELLED storyboard sheet is attached separately as `@Image 1` — a 2×2 grid of FOUR numbered keyframe panels (badge 01 top-left, 02 top-right, 03 bottom-left, 04 bottom-right), each with a bottom caption. It is the AUTHORITATIVE reference for product/person identity, framing and the ORDERED shot sequence: panel 01 is the keyframe for the first time slice, 02 the second, 03 the third, 04 the fourth — follow the panels in number order. Use each panel for identity, framing and composition of its slice, but the OUTPUT is ONE continuous live-action shot: do NOT render the grid, panels, separators, number badges, caption bars, caption text, arrows, subtitles or watermark text into the video — they are direction only.",
    "Cover ALL EIGHT core elements: subject (who/what), action (what happens), setting/environment (where), light & tone (atmosphere), camera movement (how shot), visual style, image quality, and anti-distortion constraints.",
    "Organize the prompt into THREE labelled segments, written inline as ONE continuous paragraph using the literal labels below — do NOT use any line breaks, newlines, bullet points or list formatting anywhere in the output string.",
    `Segment 1 'Global setup:' — lock the subject (the product, and the on-screen presenter when present), the environment, the visual style, and the overall lighting/mood. ${globalLook} The product is shown WORN or IN REAL USE, never as packaging or a box. Explicitly anchor identity to \`@Image 1\`; after any \`@Image 1\` reference immediately add a noun (e.g. \`@Image 1 (the presenter)\`, \`@Image 1 (the product)\`) — never attach a verb, number or location word directly to \`@Image 1\`.`,
    `Segment 2 'Timeline:' — walk the full ~${durationSec}s as ordered time slices, ONE slice per storyboard panel in number order (panel 01 → first slice, 02 → second, 03 → third, 04 → fourth), written inline like '0-4s: …; 4-8s: …'. For EACH slice give its time range, the on-screen action (matching that panel's keyframe and caption, with the product worn or in real use), EXACTLY ONE camera movement (choose a single move — static, dolly in/out, pan, tilt, tracking, or push — NEVER combine moves in one slice), and the synchronized audio. ${audioDirective}`,
    `Segment 3 'Quality & constraints:' — ${qualityLook}. Mandatory anti-distortion fallback: faces remain stable and undistorted with clear, consistent facial features; product and person identity stay consistent for the whole shot; no warping, morphing, extra/missing limbs, face jumping, or clipping through objects. ${productNegatives}. State explicitly that ${onScreenNegatives}.`,
    `Frame for ${FRAME_LABEL[aspectRatio].full}. Keep it filmable within the duration.`,
    "CRITICAL OUTPUT RULE: return STRICT JSON only — a single object {\"videoPrompt\": \"…\"} whose value is ONE single-line string with NO raw line breaks. Escape nothing else; just keep it on one line.",
  ].join(" ");

  const speakerLabel = adType === "ugc" ? "spoken" : "voiceover";
  const sceneLines = scenes
    .map((s) => {
      const line = `Scene ${s.index} — camera: ${s.cameraAngle}; action: ${s.actionMovement}; ${s.sceneDescription}`;
      return s.transcript?.trim()
        ? `${line}\n  ${speakerLabel}: "${s.transcript.trim()}"`
        : line;
    })
    .join("\n");

  const sliceHint = buildSliceHints(durationSec, scenes.length);

  const critiqueBlock = critique
    ? `\n\nA prior attempt was rejected. Fix exactly this, keeping the three labelled segments: ${critique}`
    : "";

  const user = [
    `Ad prompt: ${userPrompt}`,
    `Ad type: ${adType}`,
    `Target duration: ~${durationSec}s`,
    sliceHint ? `Suggested time slices (one per scene): ${sliceHint}` : "",
    "Storyboard scenes (in order) — honor each scene's DETAILED description and its",
    "spoken/voiceover line in the matching time slice, together with `@Image 1`:",
    sceneLines,
    'Return JSON: { "videoPrompt": "<the engineered prompt as ONE single-line string with the three inline labelled segments, NO line breaks>" }',
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
 * newlines), same three labelled segments as the LLM target.
 */
export function buildDeterministicVideoPrompt(input: {
  adStyle: string;
  adType: AdType;
  scenes: StoryboardScene[];
  durationSec: number;
  aspectRatio: AspectRatio;
}): string {
  const { adStyle, adType, scenes, durationSec, aspectRatio } = input;
  const ugc = adType === "ugc";
  const count = scenes.length || 1;
  const step = durationSec / count;
  const speak = ugc ? "the on-screen presenter says" : "voiceover says";
  const globalLook = ugc
    ? "Render as authentic UGC: handheld modern-phone footage with subtle natural shake, natural available light, a real lived-in everyday setting, slightly imperfect candid framing, a real person talking directly to camera — not a glossy studio commercial."
    : "Render as a polished cinematic commercial: intentional lighting, rich color and depth, a full-frame cinematic live-action look.";
  const quality = ugc
    ? "looks like real, un-staged phone footage indistinguishable from a real person's video — true skin texture with visible pores and minor imperfections (not smoothed, waxy or airbrushed), natural hair flyaways, real micro-expressions, true-to-life available lighting, a subtle phone-camera look (mild grain, natural motion blur) and an authentic handheld feel; not studio-polished, no heavy color grade, no uncanny AI face"
    : "4K UHD, rich detail, photorealistic real-camera live-action with real lifelike humans, natural skin and hair and true-to-life lighting";
  const timeline = scenes
    .map((s, i) => {
      const a = Math.round(i * step);
      const b = i === count - 1 ? durationSec : Math.round((i + 1) * step);
      const cam = s.cameraAngle?.trim() || "steady camera";
      const action =
        [s.actionMovement?.trim(), s.sceneDescription?.trim()]
          .filter(Boolean)
          .join(", ") || "continue the scene naturally";
      const said = s.transcript?.trim() ? `, ${speak} "${s.transcript.trim()}"` : "";
      return `${a}-${b}s (panel ${i + 1}): ${action} (${cam})${said}`;
    })
    .join("; ");
  return (
    `Global setup: @Image 1 (the labelled storyboard) is a 2×2 grid of four numbered keyframe panels (01–04) for the product and any on-screen presenter; render ONE continuous, fully photorealistic live-action ad in the "${adStyle}" style that follows the panels in number order, keeping the identity, framing and composition of @Image 1 (the keyframes) but NEVER showing the grid, panels, number badges or caption text. ${globalLook} The product is shown worn or in real use — never as packaging, a box or an unboxing. ` +
    `Timeline: ${timeline}. ` +
    `Quality & constraints: ${quality}; faces stay stable and undistorted with consistent facial features; product and person identity stay consistent for the whole shot; no warping, morphing, extra or missing limbs, face jumping, or clipping through objects; ONE real solid product — no duplicated copies, no invented packaging or boxes, no opening or transforming the product or any container, no seam-morph; ${FRAME_LABEL[aspectRatio].short}; ${ugc ? "no background or library music (only the spoken voice and light natural ambience); " : ""}NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles, logos or watermark text anywhere in the frame.`
  );
}

/** Even time-slice boundaries across the duration — a hint the LLM finalizes. */
function buildSliceHints(durationSec: number, count: number): string {
  if (count <= 0) return "";
  const step = durationSec / count;
  return Array.from({ length: count }, (_, i) => {
    const start = Math.round(i * step);
    const end = i === count - 1 ? durationSec : Math.round((i + 1) * step);
    return `${start}–${end}s → Scene ${i + 1}`;
  }).join(", ");
}
