// apps/api/src/agents/ad-types/fragments/looks.ts
//
// The 4 shared LOOK bases. A def whose `lookFamily` matches reuses these for the
// LOOK-DRIVEN seams (keyframeLook, shotDirection, pacing, captionStyle) instead
// of re-authoring them, so all `ugc_authentic` types share one phone-captured
// block, all `cinematic_polished` types share one polished block, etc.
//
// Provenance:
//   ugc_authentic       — keyframeLook MOVES VERBATIM from the storyboard UGC
//                         branch (legacy `ugc` look). Other methods may also have
//                         a UGC source if the corresponding inline ternary exists.
//   cinematic_polished  — keyframeLook MOVES VERBATIM from the storyboard
//                         inspirational branch (legacy `inspirational` look).
//   graphic_text        — NET-NEW. No legacy string exists; author from the
//                         look definition + the brand-awareness/explainer skills.
//   demo_clean          — NET-NEW. Author from the look definition + the
//                         product-showcase/demo skills.
//
// Each method returns RAW string[] — callers join.

import type { FragmentCtx, LookFamily, LookStrategy } from "../types";

const ugc_authentic: LookStrategy = {
  keyframeLook: (_ctx: FragmentCtx): string[] => [
    // VERBATIM-MOVE: image/storyboard/prompt.ts:<KEYFRAME_LOOK_UGC_START>-<...END>
    // (the "authentic phone-captured look" block from the keyframeLook ternary)
  ],
  shotDirection: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<UGC handheld shot ternary>
    // SEAM-VERIFY: if no per-panel camera ternary exists, return [] (no-op).
  ],
  pacing: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: video/prompt.ts:<UGC pacing ternary>
    // SEAM-VERIFY: quick handheld cuts. If no pacing ternary exists, return [].
  ],
  captionStyle: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<UGC caption ternary>
    // SEAM-VERIFY: casual on-screen captions. If none, return [].
  ],
};

const cinematic_polished: LookStrategy = {
  keyframeLook: (_ctx) => [
    // VERBATIM-MOVE: image/storyboard/prompt.ts:<KEYFRAME_LOOK_INSP_START>-<...END>
    // (the "polished cinematic look" block from the keyframeLook ternary)
  ],
  shotDirection: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<inspirational shot ternary>
    // SEAM-VERIFY: composed/controlled camera. If none, return [].
  ],
  pacing: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: video/prompt.ts:<inspirational pacing ternary>
    // SEAM-VERIFY: smooth cinematic pacing. If none, return [].
  ],
  captionStyle: (_ctx) => [
    // VERBATIM-MOVE-IF-EXISTS: image/storyboard/prompt.ts:<inspirational caption ternary>
    // SEAM-VERIFY: minimal/elegant text. If none, return [].
  ],
};

// NET-NEW look. No legacy source. Author to match the graphic_text definition.
const graphic_text: LookStrategy = {
  keyframeLook: (_ctx) => [
    // NEW LOOK — author: motion-graphics / kinetic typography keyframes; animated
    // overlays in brand colors; CAN run with no live product/person footage.
  ],
  shotDirection: (_ctx) => [
    // NEW LOOK — author: frames are composed graphic layouts, not camera shots.
  ],
  pacing: (_ctx) => [
    // NEW LOOK — author: snappy type-driven transitions synced to beats.
  ],
  captionStyle: (_ctx) => [
    // NEW LOOK — author: typography IS the visual; bold kinetic text as primary layer.
  ],
};

// NET-NEW look. No legacy source. Author to match the demo_clean definition.
const demo_clean: LookStrategy = {
  keyframeLook: (_ctx) => [
    // NEW LOOK — author: clean studio/tabletop product photography; crisp close-ups;
    // minimal set; product is the visual subject.
  ],
  shotDirection: (_ctx) => [
    // NEW LOOK — author: controlled product angles, macro/close detail shots.
  ],
  pacing: (_ctx) => [
    // NEW LOOK — author: deliberate reveal-and-hold on the product.
  ],
  captionStyle: (_ctx) => [
    // NEW LOOK — author: minimal spec/benefit captions, clean sans type.
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
