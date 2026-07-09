// The 4 shared LOOK bases. A def whose `lookFamily` matches reuses these for the
// LOOK-DRIVEN seams (keyframeLook, shotDirection, pacing, captionStyle) instead
// of re-authoring them, so all `ugc_authentic` types share one phone-captured
// block, all `cinematic_polished` types share one polished block, etc.
//
// Provenance:
//   ugc_authentic       - keyframeLook began VERBATIM from the storyboard UGC
//                         branch (legacy `ugc` look); the appended photoreal-skin
//                         block (Fix 3) was REPLACED in the Phase-1 skin/colour
//                         refactor by a softened skin + neutral-white-balance +
//                         controlled-lighting block (drop pore/film-grain/oil-sheen
//                         language, add a redness kill-switch), and the legacy
//                         fixtures were re-baselined. The other LOOK seams had no
//                         inline legacy ternary, so they return [] (no-op).
//   cinematic_polished  - keyframeLook began VERBATIM from the storyboard
//                         inspirational branch (legacy `inspirational` look); the
//                         same photoreal-skin block was REPLACED by the Phase-1
//                         softened skin/colour/lighting block.
//   graphic_text        — NET-NEW. No legacy string exists; authored from the
//                         look definition (kinetic typography, no live footage).
//   demo_clean          — NET-NEW. Authored from the look definition (clean
//                         studio/tabletop product photography).
//
// Each method returns RAW string[] — callers join.

import type { FragmentCtx, LookFamily, LookStrategy } from "../types.js";

const ugc_authentic: LookStrategy = {
  // VERBATIM-MOVE: image/storyboard/prompt.ts `keyframeLook` (adType === "ugc").
  keyframeLook: (_ctx: FragmentCtx): string[] => [
    "- UGC LOOK - render every panel as an AUTHENTIC, phone-captured moment, NOT",
    "  a glossy studio commercial: a real lived-in everyday setting with ordinary",
    "  background detail, candid handheld-style framing, the person relaxed and",
    "  real (talking to camera where it fits). Soft natural window/room light,",
    "  gentle and even. Keep product/person IDENTITY faithful to the reference",
    "  sheets - only lighting, setting and framing read as real UGC. Neutral white",
    "  balance, true-to-life colour, no warm/sepia/orange cast.",
    "- SKIN on any face: natural, healthy skin with soft realistic texture, even",
    "  complexion, true-to-life colour, balanced skin tone, no redness, no",
    "  blotchiness, no heavy retouching - candid but clean, NOT a smoothed/waxy/",
    "  airbrushed uncanny AI face or 3D render.",
  ],
  // No legacy inline ternary for these seams → [] keeps the legacy path identical.
  shotDirection: (_ctx) => [],
  pacing: (_ctx) => [],
  captionStyle: (_ctx) => [],
  // VERBATIM-MOVE: image/storyboard/prompt.ts closing look clause (adType === "ugc").
  closingLookClause: (_ctx) => [
    "the authentic UGC phone-captured look (natural light, real setting, candid framing).",
  ],
};

const cinematic_polished: LookStrategy = {
  // VERBATIM-MOVE: image/storyboard/prompt.ts `keyframeLook` (else / inspirational).
  keyframeLook: (_ctx) => [
    "- CINEMATIC LOOK - render every panel as a polished, cinematic keyframe:",
    "  soft directional key light with gentle fill, flattering and low-contrast on",
    "  faces, rich colour and depth, shallow depth of field, a still lifted straight",
    "  from a high-end commercial. Keep skin and faces PHOTOGRAPHIC. True-to-life",
    "  colour and a neutral white balance - no heavy warm/sepia/orange cast.",
    "- SKIN on any face: smooth, healthy, even skin with soft editorial retouching,",
    "  soft flattering light, balanced skin tone, even complexion, no redness, no",
    "  blotchiness - a real photographed frame, NOT a waxy/plastic/over-retouched",
    "  AI portrait or 3D render.",
  ],
  shotDirection: (_ctx) => [
    "- Vary the framing across panels for cinematic rhythm — mix WIDE, MEDIUM,",
    "  CLOSE-UP, OVER-THE-SHOULDER and POV; do not repeat the same flat front-on",
    "  framing in every panel.",
    "- RECURRING SET & PROPS — any location or object that appears in more than one",
    "  panel (a towel, mug, counter, desk, chair, device, fixture, signage) renders",
    "  IDENTICALLY each time: the SAME colour, material, style, condition and",
    "  placement. Vary only the camera angle and framing, never the props or the",
    "  set dressing.",
    "- SCREENS & DEVICES — when a character looks at a phone, tablet, laptop, POS or",
    "  app screen, frame it OVER-THE-SHOULDER or POV from behind or beside them so",
    "  the screen sits at a natural viewing angle; never turn a screen flat to the",
    "  camera just to show its contents. Keep any on-screen text small and abstract.",
  ],
  pacing: (_ctx) => [],
  captionStyle: (_ctx) => [],
  // VERBATIM-MOVE: image/storyboard/prompt.ts closing look clause (else / inspirational).
  closingLookClause: (_ctx) => ["the polished cinematic keyframe look."],
};

// NET-NEW look. No legacy source. Authored to match the demo_clean definition.
const demo_clean: LookStrategy = {
  keyframeLook: (_ctx) => [
    "- DEMO/CLEAN LOOK — render every panel as crisp studio/tabletop product",
    "  photography on a seamless white or soft neutral-gradient sweep: the single",
    "  hero product is the visual subject, centred with generous negative space, lit",
    "  by soft even softbox light from the upper-left with a gentle realistic contact",
    "  shadow and a subtle reflection. Crisp focus edge-to-edge, accurate materials",
    "  and TRUE colour, macro-sharp on the label and texture. Tabletop minimalism —",
    "  no props, no clutter — a commercial catalog look. Never a busy lived-in scene,",
    "  never glossy HDR over-processing that distorts the real material; no extra",
    "  objects, no invented text, no morphing product.",
    "- If any hands appear, render natural clean skin with balanced tone, neutral",
    "  white balance, no redness.",
  ],
  shotDirection: (_ctx) => [
    "- Controlled product angles — clean front / three-quarter / top-down flat-lay /",
    "  macro detail shots, the product centred and unobstructed, lighting and",
    "  background held identical across panels; vary only the angle and framing.",
    "  Camera moves (in video) stay minimal and precise — locked, or a slow",
    "  orbit/push.",
  ],
  pacing: (_ctx) => [
    "- Deliberate reveal-and-hold pacing: let each product shot land and breathe with",
    "  smooth, confident moves and crisp interaction SFX where the product is used;",
    "  no frantic cutting.",
  ],
  captionStyle: (_ctx) => [
    "- Minimal, clean sans captions stating ONE spec or benefit at a time, rendered",
    "  legibly; the product, not the text, owns the frame.",
  ],
  closingLookClause: (_ctx) => [
    "the clean studio/tabletop product look (seamless sweep, soft even light, sharp macro product detail, true colour, uncluttered).",
  ],
};

export const LOOKS: Record<LookFamily, LookStrategy> = {
  ugc_authentic,
  cinematic_polished,
  demo_clean,
};

/** Convenience: get the LookStrategy base for a def's lookFamily. */
export const lookBase = (family: LookFamily): LookStrategy => LOOKS[family];

/**
 * Per-LOOK Seedance negatives — short, failure-tied, positive-rigidity phrasing
 * (Seedance follows positive constraints more reliably than failure-naming, and
 * long negative lists get ignored). Appended ONCE to the final video prompt in
 * `video/index.ts`, after the LLM (or deterministic) prompt body. Tailored per
 * look family because the failure modes differ: product morph for studio/demo,
 * warped hands for phone-shot UGC, identity drift for cinematic, garbled type
 * for motion-graphics.
 */
export function videoNegatives(family: LookFamily): string {
  // SHORT, positive-leaning tails (Seedance ignores long prompts and a 2×2 grid
  // named repeatedly only PRIMES it to render the grid). ONE "full-frame scene"
  // cue per look does the anti-grid work without re-describing the layout.
  // Positive-rigidity LEAD (Seedance follows positive constraints more reliably
  // than failure-naming) + a SHORT per-look failure tail (2–3 terms) for the
  // failures actually seen in that look — per the seedance-2.0-prompting skill.
  switch (family) {
    case "demo_clean":
      return "The product stays rigid and dimensionally fixed — silhouette, proportions and printed label identical every frame; smooth, slow, stable motion; each frame is one full-frame scene. No morphing product, no garbled label, no jitter.";
    case "ugc_authentic":
      return "One real person and one product, identity constant every frame, with natural well-formed hands; stable handheld motion; one continuous full-frame scene. No music, no on-screen text, no warped hands.";
    case "cinematic_polished":
      return "One consistent face and product, identity constant and stable every frame; smooth motion; each frame is one full-frame scene. No identity drift, no on-screen text, no warped face.";
  }
}
