// The 4 shared LOOK bases. A def whose `lookFamily` matches reuses these for the
// LOOK-DRIVEN seams (keyframeLook, shotDirection, pacing, captionStyle) instead
// of re-authoring them, so all `ugc_authentic` types share one phone-captured
// block, all `cinematic_polished` types share one polished block, etc.
//
// Provenance:
//   ugc_authentic       — keyframeLook began VERBATIM from the storyboard UGC
//                         branch (legacy `ugc` look); a photoreal-skin block was
//                         APPENDED (Fix 3) and the legacy fixtures re-baselined,
//                         so it is no longer byte-identical to the pre-refactor
//                         string. The other LOOK seams had no inline legacy
//                         ternary, so they return [] (no-op).
//   cinematic_polished  — keyframeLook began VERBATIM from the storyboard
//                         inspirational branch (legacy `inspirational` look); the
//                         same photoreal-skin block was APPENDED (Fix 3).
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
    "- UGC LOOK — render every panel as an AUTHENTIC, phone-captured moment, NOT",
    "  a glossy studio commercial: natural / available light from real windows",
    "  or lamps, a real lived-in everyday setting with ordinary background",
    "  detail, candid handheld-style framing, the person relaxed and real",
    "  (talking to camera where it fits) with TRUE skin texture — visible pores,",
    "  fine lines, natural hair flyaways, NOT smoothed, waxy, airbrushed or an",
    "  uncanny AI face. Keep product/person IDENTITY faithful to the reference",
    "  sheets — only lighting, setting and framing read as real UGC, never",
    "  plastic, never over-polished, no glossy magazine retouch or HDR sheen.",
    "  Neutral 5500-6000K white balance, true-to-life colour, NO warm / sepia /",
    "  orange cast. Every panel must look indistinguishable from a real candid",
    "  phone photo — never a 3D render, a glossy commercial or a polished AI portrait.",
    "- PHOTOREAL SKIN on any face: visible pores, fine micro-texture, peach fuzz,",
    "  fine flyaway hairs, slight natural asymmetry, subtle natural redness, a",
    "  natural oil sheen on the high points, faint 35mm film grain — and NO beauty",
    "  filter, NO AI glow, NO porcelain finish, NO over-smoothing, NO perfect",
    "  symmetry, NO toothpaste-ad teeth.",
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
    "- CINEMATIC LOOK — render every panel as a polished, cinematic keyframe:",
    "  intentional lighting, rich colour and depth, shallow depth of field, a still",
    "  lifted straight from a high-end commercial. Keep skin and faces PHOTOGRAPHIC",
    "  with real texture (visible pores, fine lines) — never waxy, plastic, smoothed",
    "  or over-retouched, never an uncanny AI face. True-to-life colour and a",
    "  neutral white balance — no heavy warm / sepia / orange cast. It must read as",
    "  a real photographed frame, not a 3D render or a glossy AI portrait.",
    "- PHOTOREAL SKIN on any face: visible pores, fine micro-texture, peach fuzz,",
    "  fine flyaway hairs, slight natural asymmetry, subtle natural redness, a",
    "  natural oil sheen on the high points, faint 35mm film grain — and NO beauty",
    "  filter, NO AI glow, NO porcelain finish, NO over-smoothing, NO perfect",
    "  symmetry, NO toothpaste-ad teeth.",
  ],
  shotDirection: (_ctx) => [],
  pacing: (_ctx) => [],
  captionStyle: (_ctx) => [],
  // VERBATIM-MOVE: image/storyboard/prompt.ts closing look clause (else / inspirational).
  closingLookClause: (_ctx) => ["the polished cinematic keyframe look."],
};

// NET-NEW look. No legacy source. Authored to match the graphic_text definition.
const graphic_text: LookStrategy = {
  keyframeLook: (_ctx) => [
    "- GRAPHIC/TEXT LOOK — render every panel as a flat motion-graphics /",
    "  kinetic-typography design, NOT live photography: a bold geometric sans-serif",
    "  headline is the hero element on a solid brand-colour (or color-blocked)",
    "  background, crisp clean kerning, high contrast, generous safe margins. Add",
    "  only simple vector shapes, flat icons and subtle gradient accents; NO live",
    "  photography, NO real product, NO people. Punchy, modern, broadcast-style",
    "  layout. Render ALL text and numbers VERBATIM and perfectly legible —",
    "  legibility is the #1 priority. No watermark, no stock-photo imagery, no 3D",
    "  realism, no garbled or duplicated letters.",
  ],
  shotDirection: (_ctx) => [
    "- Each panel is a COMPOSED GRAPHIC LAYOUT, not a camera shot: deliberate type",
    "  hierarchy, ONE focal headline per frame, balanced negative space, the brand",
    "  palette held constant across panels. Vary scale/weight/position of the type,",
    "  not a camera angle.",
  ],
  pacing: (_ctx) => [
    "- Snappy, beat-synced kinetic typography: words and numbers punch in and out on",
    "  the rhythm with quick clean transitions. Only the MOTION and cuts may be fast —",
    "  never a camera move (there is no camera). Keep every word readable as it animates.",
  ],
  captionStyle: (_ctx) => [
    "- Typography IS the visual: the on-frame words are the hero layer in bold kinetic",
    "  type, rendered verbatim and perfectly legible — not a thin caption bar tucked",
    "  at the bottom.",
  ],
  closingLookClause: (_ctx) => [
    "the bold motion-graphics / kinetic-typography look (flat designed frames, brand colour, verbatim legible text, no live footage, no people).",
  ],
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
  graphic_text,
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
  switch (family) {
    case "graphic_text":
      return "Animated text and shapes only — no people, no camera; every word and number legible, no garbled letters; one full-frame design at a time, no panel grid or caption bars.";
    case "demo_clean":
      return "ONE product, fixed shape and markings every frame — no morph, duplicate or garbled label; smooth stable motion; one full-frame scene.";
    case "ugc_authentic":
      return "ONE real person and ONE product, consistent every frame; natural stable motion, no warped or extra hands; one full-frame scene, no on-screen text.";
    case "cinematic_polished":
      return "ONE consistent face and product, stable every frame; smooth motion, no identity drift or warping; one full-frame scene, no on-screen text.";
  }
}
