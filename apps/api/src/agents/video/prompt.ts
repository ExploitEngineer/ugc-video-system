import type { AdType } from "@ugc/shared";
import type { ChatMessage } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";

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
  critique?: string;
}): ChatMessage[] {
  const { adStyle, adType, userPrompt, scenes, durationSec, critique } = input;

  const audioDirective =
    adType === "ugc"
      ? 'AUDIO — UGC review: a single on-screen person SPEAKS the transcript lines below in order, natural/conversational/authentic, lip-synced on camera as the primary audio with light realistic ambience. Quote each line verbatim in its time slice so the model speaks it.'
      : 'AUDIO — inspirational ad: the transcript lines below are VOICEOVER NARRATION over the visuals (not lip-synced on screen), evocative tone, layered with fitting music/ambience. Quote each line verbatim in its time slice.';

  const system = [
    "You are a Seedance 2.0 multimodal video director and prompt engineer for an AI ad-video pipeline.",
    `Author ONE engineered Seedance 2.0 video prompt for a ~${durationSec}s, fully photorealistic live-action commercial ad in the "${adStyle}" style.`,
    "A LABELLED storyboard sheet is attached separately as `@Image 1` — a 2×2 grid of FOUR numbered keyframe panels (badge 01 top-left, 02 top-right, 03 bottom-left, 04 bottom-right), each with a bottom caption. It is the AUTHORITATIVE reference for product/person identity, framing and the ORDERED shot sequence: panel 01 is the keyframe for the first time slice, 02 the second, 03 the third, 04 the fourth — follow the panels in number order. Use each panel for identity, framing and composition of its slice, but the OUTPUT is ONE continuous live-action shot: do NOT render the grid, panels, separators, number badges, caption bars, caption text, arrows, subtitles or watermark text into the video — they are direction only.",
    "Cover ALL EIGHT core elements: subject (who/what), action (what happens), setting/environment (where), light & tone (atmosphere), camera movement (how shot), visual style, image quality, and anti-distortion constraints.",
    "Organize the prompt into THREE labelled segments, written inline as ONE continuous paragraph using the literal labels below — do NOT use any line breaks, newlines, bullet points or list formatting anywhere in the output string.",
    "Segment 1 'Global setup:' — lock the subject (the product, and the on-screen presenter when present), the environment, the visual style, and the overall lighting/mood. Explicitly anchor identity to `@Image 1`; after any `@Image 1` reference immediately add a noun (e.g. `@Image 1 (the presenter)`, `@Image 1 (the product)`) — never attach a verb, number or location word directly to `@Image 1`.",
    `Segment 2 'Timeline:' — walk the full ~${durationSec}s as ordered time slices, ONE slice per storyboard panel in number order (panel 01 → first slice, 02 → second, 03 → third, 04 → fourth), written inline like '0-4s: …; 4-8s: …'. For EACH slice give its time range, the on-screen action (matching that panel's keyframe and caption), EXACTLY ONE camera movement (choose a single move — static, dolly in/out, pan, tilt, tracking, or push — NEVER combine moves in one slice), and the synchronized audio. ${audioDirective}`,
    "Segment 3 'Quality & constraints:' — 4K UHD, rich detail, photorealistic real-camera live-action, real lifelike humans with natural skin/hair and true-to-life lighting. Mandatory anti-distortion fallback: faces remain stable and undistorted with clear, consistent facial features; product and person identity stay consistent for the whole shot; no warping, morphing, extra/missing limbs, face jumping, or clipping through objects. State explicitly that NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text appear anywhere in the frame.",
    "Frame for 16:9 widescreen (horizontal). Keep it filmable within the duration.",
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
    "Storyboard scenes (in order, with their spoken/voiceover lines):",
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
}): string {
  const { adStyle, adType, scenes, durationSec } = input;
  const count = scenes.length || 1;
  const step = durationSec / count;
  const speak = adType === "ugc" ? 'the on-screen presenter says' : "voiceover says";
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
    `Global setup: @Image 1 (the labelled storyboard) is a 2×2 grid of four numbered keyframe panels (01–04) for the product and any on-screen presenter; render ONE continuous, fully photorealistic live-action commercial in the "${adStyle}" style that follows the panels in number order, keeping the identity, framing and composition of @Image 1 (the keyframes) but NEVER showing the grid, panels, number badges or caption text. ` +
    `Timeline: ${timeline}. ` +
    "Quality & constraints: 4K UHD, rich detail, photorealistic real-camera live-action with real lifelike humans, natural skin and hair and true-to-life lighting; faces stay stable and undistorted with consistent facial features; product and person identity stay consistent for the whole shot; no warping, morphing, extra or missing limbs, face jumping, or clipping through objects; 16:9 widescreen; NO panel numbers, labels, arrows, callouts, grid lines, borders, split-screen panels, captions, subtitles or watermark text anywhere in the frame."
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
