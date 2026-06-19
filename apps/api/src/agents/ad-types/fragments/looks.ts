// The 4 shared LOOK bases. A def whose `lookFamily` matches reuses these for the
// LOOK-DRIVEN seams (keyframeLook, shotDirection, pacing, captionStyle) instead
// of re-authoring them, so all `ugc_authentic` types share one phone-captured
// block, all `cinematic_polished` types share one polished block, etc.
//
// Provenance:
//   ugc_authentic       — keyframeLook is VERBATIM from the storyboard UGC branch
//                         (legacy `ugc` look). The other LOOK seams had no inline
//                         legacy ternary, so they return [] (no-op) to keep the
//                         legacy path byte-identical.
//   cinematic_polished  — keyframeLook is VERBATIM from the storyboard
//                         inspirational branch (legacy `inspirational` look).
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
    "  intentional lighting, rich color and depth, a still lifted straight from a",
    "  high-end commercial.",
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
    "- GRAPHIC/TEXT LOOK — render every panel as a bold motion-graphics frame, NOT",
    "  live photography: clean kinetic typography as the primary subject, large",
    "  legible headline words and numbers in a confident sans, designed layouts on",
    "  flat or subtly-textured brand-colour backgrounds, with simple iconography and",
    "  shape accents. Product or person imagery, when present, sits as a clean",
    "  cut-out or inset supporting the type — the words carry the frame. Crisp, high",
    "  contrast, intentional; never a photographic scene, never cluttered.",
  ],
  shotDirection: (_ctx) => [
    "- Compose each panel as a designed graphic layout, not a camera shot:",
    "  deliberate type hierarchy, generous margins, ONE focal headline per frame.",
  ],
  pacing: (_ctx) => [
    "- Snappy, type-driven cuts synced to the beat — words and numbers punch in and",
    "  out; quick, rhythmic, energetic transitions between frames.",
  ],
  captionStyle: (_ctx) => [
    "- Typography IS the visual: the on-frame words are the hero layer in bold",
    "  kinetic type, not a thin caption bar tucked at the bottom.",
  ],
  closingLookClause: (_ctx) => [
    "the bold motion-graphics / kinetic-typography look (clean designed frames, brand colour, no live footage).",
  ],
};

// NET-NEW look. No legacy source. Authored to match the demo_clean definition.
const demo_clean: LookStrategy = {
  keyframeLook: (_ctx) => [
    "- DEMO/CLEAN LOOK — render every panel as crisp studio/tabletop product",
    "  photography: the product is the clear hero on a clean, uncluttered surface or",
    "  seamless backdrop, controlled even lighting, accurate colour, sharp macro",
    "  detail on its key parts and markings, shallow depth where it helps. Polished",
    "  and precise — a high-end product shot — never a busy lived-in scene, never",
    "  glossy HDR over-processing that distorts the real material.",
  ],
  shotDirection: (_ctx) => [
    "- Controlled product angles — clean front / three-quarter / macro detail shots,",
    "  the product centred and unobstructed, camera moves minimal and precise.",
  ],
  pacing: (_ctx) => [
    "- Deliberate reveal-and-hold pacing: let each product shot land and breathe;",
    "  smooth, confident moves, no frantic cutting.",
  ],
  captionStyle: (_ctx) => [
    "- Minimal, clean sans captions stating ONE spec or benefit at a time; the",
    "  product, not the text, owns the frame.",
  ],
  closingLookClause: (_ctx) => [
    "the clean studio/tabletop product look (crisp lighting, sharp product detail, uncluttered backdrop).",
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
