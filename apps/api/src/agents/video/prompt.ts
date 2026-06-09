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
  /**
   * Presenter identity (gender/age/hair) to PIN in the first tokens of the
   * prompt — sourced from `runs.person_brief`. Empty for no-person ads and for
   * uploaded persons (no text brief); the scene text + `@Image 1` carry it then.
   */
  characterAnchor?: string;
  critique?: string;
}): ChatMessage[] {
  const {
    adStyle,
    adType,
    userPrompt,
    scenes,
    durationSec,
    aspectRatio,
    critique,
  } = input;
  const anchor = (input.characterAnchor ?? "").trim();

  const ugc = adType === "ugc";
  // Pin the presenter's identity in the FIRST tokens of Segment 1 — Seedance
  // weights early tokens most, and an unpinned subject drifts into a new person.
  const hasPresenter = Boolean(anchor) || ugc;
  const presenterPin = hasPresenter
    ? anchor
      ? `FIRST lock the on-screen presenter: ${anchor}, identity anchored to \`@Image 1 (the presenter)\` — keep this EXACT person (same apparent gender, age, face and hair) for the entire shot. Then lock `
      : "FIRST lock the on-screen presenter exactly as shown in `@Image 1 (the presenter)` — keep this exact person (same apparent gender, age, face and hair) for the entire shot. Then lock "
    : "Lock ";

  // Fit the voice to the on-screen person (age/gender/energy) and push it to
  // sound like a real human, not a synthetic narrator — the gpt-4.1 author has
  // the presenter identity from Segment 1, so it can choose a fitting voice.
  const audioDirective = ugc
    ? `AUDIO — UGC: the on-screen person SPEAKS the lines lip-synced. Give them a voice that FITS their apparent age, gender and energy — a natural, real human voice with conversational pacing, natural intonation and light breaths, the SAME voice throughout; not a flat, robotic or synthetic AI-narrator voice. Quote each line VERBATIM in its slice as \`the presenter says: "<transcript>"\`; keep each line short (≤~10 words). Sip or handle the product and speak in SEPARATE beats, with the mouth visible while speaking. Light room ambience, no music.`
    : `AUDIO — inspirational: the lines are VOICEOVER (not lip-synced on screen). Use a natural, real human narrator voice that fits the ad's tone, the SAME voice throughout; not robotic or synthetic. Quote each line verbatim in its slice and keep each short. A light fitting score/ambience is allowed.`;

  // LIGHT style re-anchor only — the look is inherited from the storyboard still
  // (@Image 1); re-describing the whole aesthetic bloats the prompt and Seedance
  // degrades on long prompts. One short line per ad type.
  const globalLook = ugc
    ? "Render as authentic UGC: a real person filming themselves handheld on a modern phone, natural light, a lived-in everyday setting, candid framing with subtle shake — not a studio commercial."
    : "Render as a polished cinematic commercial: intentional lighting, rich color and depth.";

  const qualityLook = ugc
    ? "real, un-staged phone footage — true skin texture (visible pores, no waxy smoothing), natural light, subtle handheld feel; not a glossy studio commercial"
    : "photorealistic cinematic, real skin texture, natural light, premium brand-film grade";

  // Shared realism floor — ONE concise positive clause (deduped; the bans now
  // live only in the single `avoidTail` below).
  const realismFloor =
    "It must look indistinguishable from real footage on a real camera: the on-screen person moves and emotes like a real human (natural micro-expressions, blinks, relaxed body language), with true anatomy and hands, natural motion and real material physics.";

  // ONE tiny targeted tail — only stubborn artifacts + true model defaults.
  // Per the research, naming specific failures/objects (a cap, packaging, "a
  // second person", "drinking with the cap on") can SUMMON them in Seedance, so
  // identity, product fidelity and causal correctness are carried POSITIVELY
  // above (same single person/product; prep-then-use; state persists) — NOT as
  // bans here. Keep this list to stubborn artifacts + defaults only.
  const avoidTail = ugc
    ? "Avoid: extra or warped fingers, face morphing, on-screen text or captions, watermark, background music."
    : "Avoid: extra or warped fingers, face morphing, on-screen text or captions, watermark.";

  const system = [
    "You are a Seedance 2.0 multimodal video director and prompt engineer for an AI ad-video pipeline.",
    `Author ONE engineered Seedance 2.0 video prompt for a ~${durationSec}s, fully photorealistic live-action ${ugc ? "UGC-style ad" : "commercial ad"} in the "${adStyle}" style.`,
    "A LABELLED storyboard sheet is attached as `@Image 1` — a 2×2 grid of FOUR numbered keyframe panels (01 top-left, 02 top-right, 03 bottom-left, 04 bottom-right). It is the AUTHORITATIVE reference for product/person identity, framing and the ORDERED shot sequence: panel N is the keyframe for time slice N — follow them in number order. Use each panel for identity/framing/composition, but the OUTPUT is ONE continuous live-action shot: never render the grid, panels, badges, caption bars/text or any boxes from the sheet into the video — they are direction only.",
    "Cover ALL EIGHT core elements: subject (who/what), action (what happens), setting/environment (where), light & tone (atmosphere), camera movement (how shot), visual style, image quality, and anti-distortion constraints.",
    "Organize the prompt into THREE labelled segments, written inline as ONE continuous paragraph using the literal labels below — do NOT use any line breaks, newlines, bullet points or list formatting anywhere in the output string.",
    `Segment 1 'Global setup:' — ${presenterPin}the subject (the product${hasPresenter ? " and the on-screen presenter" : ""}), the environment, the visual style, and the overall lighting/mood. ${globalLook} The product is shown WORN or IN REAL USE at its true real-world scale, as the bare real item. Anchor identity to \`@Image 1\`; after any \`@Image 1\` reference immediately add a noun (e.g. \`@Image 1 (the presenter)\`, \`@Image 1 (the product)\`).`,
    `Segment 2 'Timeline:' — walk the full ~${durationSec}s as ordered time slices, ONE per panel in number order, inline like '0-4s: …; 4-8s: …'. For EACH slice: its time range, one concrete ACTION BEAT tied to that panel, EXACTLY ONE camera move (static, dolly, pan, tilt, tracking or push), and the audio. Say what the PRODUCT visibly DOES so it reads as genuinely working (its real motion — e.g. a cap twisted off and the level dropping). Any prep step (e.g. opening) goes in its OWN earlier slice, before the slice that uses it, and the changed state PERSISTS in every later slice. ${audioDirective}`,
    `Segment 3 'Quality & constraints:' — ${qualityLook}. ${realismFloor} Keep the SAME single person and the SAME product identity across all four beats. ${avoidTail}`,
    `Frame for ${FRAME_LABEL[aspectRatio].full}. Keep the prompt TIGHT — aim for roughly 70-100 words TOTAL (Seedance follows short, front-loaded prompts far better than long ones): lead each slice with subject + action + camera, lean on \`@Image 1\` for look/identity instead of re-describing it, and keep the single 'Avoid:' list short and at the very end. Do not pad or restate.`,
    'CRITICAL OUTPUT RULE: return STRICT JSON only — a single object {"videoPrompt": "…"} whose value is ONE single-line string with NO raw line breaks. Escape nothing else; just keep it on one line.',
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
  characterAnchor?: string;
}): string {
  const { adStyle, adType, scenes, durationSec, aspectRatio } = input;
  const ugc = adType === "ugc";
  const anchor = (input.characterAnchor ?? "").trim();
  const presenterPin =
    anchor || ugc
      ? `Lock the on-screen presenter${anchor ? ` (${anchor})` : ""} to @Image 1 (the presenter) and keep this exact person — same apparent gender, age, face and hair — for the whole shot. `
      : "";
  const count = scenes.length || 1;
  const step = durationSec / count;
  const speak = ugc ? "the presenter says" : "voiceover says";
  // Fit the voice to the on-screen person when we have a brief; else the tunable
  // default. Pushed to sound human (not synthetic) in the audio clause below.
  const voice = anchor
    ? `a natural, real human voice fitting ${anchor}`
    : VOICE[adType];
  const globalLook = ugc
    ? "Render as authentic UGC: a real person filming themselves handheld on a modern phone, natural light, a lived-in everyday setting, candid framing with subtle shake — not a studio commercial."
    : "Render as a polished cinematic commercial: intentional lighting, rich color and depth.";
  const quality = ugc
    ? "real, un-staged phone footage — true skin texture (visible pores, no waxy smoothing), natural light, subtle handheld feel; not a glossy studio commercial"
    : "photorealistic cinematic, real skin texture, natural light, premium brand-film grade";
  const timeline = scenes
    .map((s, i) => {
      const a = Math.round(i * step);
      const b = i === count - 1 ? durationSec : Math.round((i + 1) * step);
      const cam = s.cameraAngle?.trim() || "steady camera";
      // The (now short) sceneDescription already captures the beat — use it
      // alone to keep the fallback lean; fall back to actionMovement if empty.
      const action =
        s.sceneDescription?.trim() ||
        s.actionMovement?.trim() ||
        "continue the scene naturally";
      const said = s.transcript?.trim()
        ? `, ${speak} "${s.transcript.trim()}"`
        : "";
      return `${a}-${b}s (panel ${i + 1}): ${action} (${cam})${said}`;
    })
    .join("; ");
  return (
    `Global setup: @Image 1 (the storyboard) is a 2×2 grid of four numbered panels (01–04); render ONE continuous, photorealistic live-action ad in the "${adStyle}" style that follows the panels in order, keeping their identity and framing while showing only the clean live scene (no grid, badges or captions). ${presenterPin}${globalLook} The product is shown worn or in real use at true scale, as the bare real item. ` +
    `Timeline: ${timeline}. Show the product genuinely working (its real motion — e.g. a cap twisted off and the level dropping); any prep (e.g. opening) comes in an EARLIER slice, before the slice that uses it, and the changed state persists. Audio: ${ugc ? `${voice}, lip-synced, light ambience, no music` : `${voice} voiceover, light score allowed`}; sip or handle the product and speak in separate beats, mouth visible while speaking. ` +
    `Quality & constraints: ${quality}; the person moves and emotes like a real human (micro-expressions, blinks, relaxed body language); indistinguishable from real footage — true anatomy, natural motion, real material physics. Keep the SAME person and product across all beats. ${FRAME_LABEL[aspectRatio].short}. Avoid: extra or warped fingers, face morphing, on-screen text or captions, watermark${ugc ? ", background music" : ""}.`
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
