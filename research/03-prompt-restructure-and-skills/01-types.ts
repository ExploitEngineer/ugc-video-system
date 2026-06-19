// apps/api/src/agents/ad-types/types.ts
//
// Core type model for the ad-type registry/strategy. This file replaces the
// scattered `if (adType === "ugc") … else …` branches with a data model where
// each ad type contributes its own prompt fragments.
//
// HARD CONSTRAINTS encoded here:
//  - There is NO `Record<AdType, …>` anywhere. Ad-type ids are an OPEN string
//    set (validated by Zod at the wire boundary, like `runErrorCode`), so
//    widening the set can never produce a non-exhaustive-record compile error.
//    The ONLY exhaustive record in the system is keyed by `LookFamily`, which is
//    a deliberately CLOSED set of 4. All open-set variation is routed through
//    (closed) look bases + per-def fragments.
//  - Fragment methods return RAW `string[]`. They never join. Each builder keeps
//    its own joiner (the video builder has two call sites that join with " " and
//    "\n" respectively — see registry usage notes).
//  - `FragmentCtx` carries `hasProduct` / `hasPerson` as EXPLICIT params computed
//    by the pipeline from assetPolicy + the actual upload; fragments must not
//    re-derive them from the briefs.

// ---------------------------------------------------------------------------
// Look families — CLOSED set of 4. Safe to key an exhaustive Record on this.
// ---------------------------------------------------------------------------
export type LookFamily =
  | "ugc_authentic" // phone-captured, handheld, native (legacy `ugc` look)
  | "cinematic_polished" // produced, color-graded, VO-led (legacy `inspirational` look)
  | "graphic_text" // motion-graphics / kinetic type; runs with no live footage
  | "demo_clean"; // clean studio/tabletop product photography

export const LOOK_FAMILIES: readonly LookFamily[] = [
  "ugc_authentic",
  "cinematic_polished",
  "graphic_text",
  "demo_clean",
] as const;

// ---------------------------------------------------------------------------
// Asset policy
// ---------------------------------------------------------------------------
export type AssetRequirement = "required" | "optional" | "forbidden";

export interface AssetPolicy {
  product: AssetRequirement;
  person: AssetRequirement;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Hook selection (resolved by hooks/compose.ts). Defined here because
// FragmentCtx references it; hooks/* import FROM this file (one-directional).
// ---------------------------------------------------------------------------
export type HookRole = "visual_lead" | "overlay";

export interface ResolvedHook {
  id: string; // HookDef id, e.g. "problem-solution"
  role: HookRole; // exactly one visual_lead; optional one overlay
  openingDirective: string; // drop-in directive prose from HookDef
}

export interface HookSelection {
  visualLead: ResolvedHook; // always present (>=1 hook)
  overlay: ResolvedHook | null; // present iff a valid 2nd hook survived collapse
}

// ---------------------------------------------------------------------------
// FragmentCtx — pure data passed to every fragment method. No model calls.
// ---------------------------------------------------------------------------
export interface FragmentCtx {
  adStyle: string; // ~20-word creative brief (field unchanged by this refactor)
  productBrief: string | null; // from describeProduct; null when no product
  personBrief: string | null; // from plan/derivePersonBrief; null when no person
  hasProduct: boolean; // EXPLICIT — pipeline computed it (assetPolicy + upload)
  hasPerson: boolean; // EXPLICIT — pipeline computed it
  hooks: HookSelection; // resolved hook(s) for this run
  duration: 15 | 30 | 45 | 60;
  segmentIndex: number | null; // null for 15s; 0-based for master-sheet segments
  segmentCount: number; // 1 for 15s; N for 30/45/60
}

// ---------------------------------------------------------------------------
// FragmentSet — one method per varying seam. Returns RAW string[] (no join).
//
// Each method is tagged:
//   SPEC   = explicitly named in the research prompt's seam map. Move verbatim.
//   INFER  = a likely additional inline ternary that the briefing references but
//            does not name ("several inline adType==='ugc' ternaries"). Wire it
//            to the real ternary during the verbatim-move pass, OR delete the
//            method if no such ternary exists. Marked SEAM-VERIFY in the defs.
//
// LOOK-DRIVEN methods can delegate to the def's LookStrategy base (see looks.ts)
// so types that share a look reuse one block. TYPE-DRIVEN methods are authored
// per def.
// ---------------------------------------------------------------------------
export interface FragmentSet {
  // ---- storyboard seams (image/storyboard/prompt.ts, ~713 lines) ----
  /** SPEC ← `typeBlock`. TYPE-driven: how the product is presented (on-camera demo vs cinematic scene). */
  storyboardTypeBlock(ctx: FragmentCtx): string[];
  /** SPEC ← `keyframeLook`. LOOK-driven: authentic phone-captured vs polished cinematic. */
  storyboardKeyframeLook(ctx: FragmentCtx): string[];
  /** SPEC ← "the on-screen person" vs "the voiceover". TYPE/ASSET-driven. */
  storyboardSpeakerLabel(ctx: FragmentCtx): string[];
  /** INFER ← panel-caption ternary (casual UGC captions vs minimal cinematic). LOOK-driven. SEAM-VERIFY. */
  storyboardCaptionStyle(ctx: FragmentCtx): string[];
  /** INFER ← transcript-line ternary (first-person spoken review vs VO narration). TYPE-driven. SEAM-VERIFY. */
  storyboardTranscriptStyle(ctx: FragmentCtx): string[];
  /** INFER ← per-panel camera/shot ternary (handheld vs composed). LOOK-driven. SEAM-VERIFY. */
  storyboardShotDirection(ctx: FragmentCtx): string[];

  // ---- video seams (video/prompt.ts) ----
  /** SPEC ← `VOICE[adType]`. The `Record<AdType,string> VOICE` is DELETED; this method replaces it. TYPE-driven. */
  videoVoice(ctx: FragmentCtx): string[];
  /** SPEC ← the UGC-vs-voiceover audio line. TYPE-driven. */
  videoAudioLine(ctx: FragmentCtx): string[];
  /** INFER ← shot-rhythm/pacing ternary (quick handheld cuts vs smooth cinematic). LOOK-driven. SEAM-VERIFY. */
  videoPacing(ctx: FragmentCtx): string[];

  // ---- narrative seams (narrative-outline/prompt.ts, 30/45/60s only) ----
  /** SPEC ← the `isUgc` script-treatment branch. TYPE-driven. */
  narrativeTreatment(ctx: FragmentCtx): string[];
}

// The set of seam method names, for the structural test and for documenting
// completeness. Keep in sync with FragmentSet above (the test asserts every def
// implements exactly these).
export const FRAGMENT_SEAMS = [
  "storyboardTypeBlock",
  "storyboardKeyframeLook",
  "storyboardSpeakerLabel",
  "storyboardCaptionStyle",
  "storyboardTranscriptStyle",
  "storyboardShotDirection",
  "videoVoice",
  "videoAudioLine",
  "videoPacing",
  "narrativeTreatment",
] as const satisfies readonly (keyof FragmentSet)[];

// ---------------------------------------------------------------------------
// LookStrategy — coarse, shared base for the LOOK-DRIVEN seams. One per family.
// A def reuses its family base by delegating (e.g. `look.keyframeLook(ctx)`).
// This is an exhaustive Record — allowed, because LookFamily is CLOSED.
// ---------------------------------------------------------------------------
export interface LookStrategy {
  keyframeLook(ctx: FragmentCtx): string[];
  shotDirection(ctx: FragmentCtx): string[];
  pacing(ctx: FragmentCtx): string[];
  captionStyle(ctx: FragmentCtx): string[];
}

// ---------------------------------------------------------------------------
// AdTypeDef — one per ad type. `id` is an OPEN string (no union).
// ---------------------------------------------------------------------------
export interface AdTypeDef {
  id: string; // stable kebab-case id; OPEN set
  displayName: string;
  description: string; // classifier-facing, discriminative (used by interpretAdStyle)
  whenToUse: string; // funnel stage(s)
  assetPolicy: AssetPolicy;
  lookFamily: LookFamily; // which of the 4 shared bases this type uses
  defaultHooks: string[]; // HookDef ids (subset of allowedHooks)
  allowedHooks: string[]; // HookDef ids permitted for this type
  legacyMapping?: "ugc" | "inspirational"; // present ONLY on the two seed types
  fragments: FragmentSet;
}
