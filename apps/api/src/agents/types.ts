// Shared plumbing for agent skills.
//
// A skill = a prompt module + a function `(ctx, input) => SkillResult`.
// The OpenAI provider is injected on `ctx` (dependency injection) so skills
// never import the adapter directly and stay unit-testable with a fake.

import type { AspectRatio, Duration } from "@ugc/shared";
import type { HookSelection } from "./ad-types/types.js";
import type { OpenAIProvider } from "../providers/openai/index.js";
import type { VideoProvider } from "../providers/video.js";

/**
 * How a product is REALLY operated, derived ONCE per product (vision over the
 * upload, in `describeProduct`) and threaded into the storyboard STILL so its
 * four keyframes bake the correct causal state machine — the video then inherits
 * that state through the storyboard reference (`@Image 1`). Generic, no
 * hard-coded product list. Items that need no prep (already-worn watch, shoe,
 * sunglasses) leave `accessVerb`/`changedState`/`persistenceCue` empty.
 */
export interface ProductUse {
  /** Enabling prep state-change, e.g. "twists off the cap". "" when none. */
  accessVerb: string;
  /** Persistent state after the prep, e.g. "cap off, set on the counter". "" when none. */
  changedState: string;
  /** Restatement that the changed state persists later, e.g. "cap still off beside her". "" when none. */
  persistenceCue: string;
  /** Visible functioning signal, e.g. "water level visibly drops as she drinks". */
  functionSignal: string;
  /** The actual use, e.g. "drinks from" / "checks the time on" / "wears". */
  useVerb: string;
}

/** Everything a skill needs that isn't skill-specific. Built once per step. */
export interface SkillContext {
  runId: string;
  /** Opaque in F4 (caller supplies it); F7's Creative Direction Agent sets it. */
  adStyle: string;
  /**
   * The OPEN ad-type id (e.g. `testimonial`, `brand-story`, `product-demo`),
   * straight from `runs.ad_type`. The prompt builders resolve it through the
   * ad-type registry (`getAdType`) for per-type fragment dispatch (Chunk F);
   * legacy `ugc`/`inspirational` values resolve via the registry's aliases, so
   * old rows behave identically.
   */
  adType: string;
  /**
   * Resolved hook selection from the detector (Chunk E), parsed from
   * `runs.hooks`. Undefined on legacy/older runs. Consumed by the prompt
   * builders' hook-opening splice in Chunk F.
   */
  hooks?: HookSelection;
  /** Ground-truth: a product / person image was uploaded for this run. */
  hasProduct?: boolean;
  hasPerson?: boolean;
  /**
   * Factual product identity anchor (category / materials / colors / markings),
   * planned once via vision over the upload and persisted to `runs.product_brief`.
   * Empty string until the reference phase fills it. Keeps the product from
   * silently drifting into a different item downstream (storyboard, critic).
   */
  productBrief: string;
  /**
   * Causal use-sequence for the product (how it is operated, what state-change
   * it needs, what it visibly does), derived once via vision and persisted to
   * `runs.product_use`. Threaded into the storyboard STILL only — the video
   * inherits the resulting keyframes. Optional: absent on older runs / vision
   * hiccups, where the storyboard falls back to deriving the sequence itself.
   */
  productUse?: ProductUse;
  /**
   * Product-derived description of the on-camera person (demographics / wardrobe
   * / palette) from `runs.person_brief`. Set when the person is INVENTED from the
   * product; empty when a person photo was uploaded (identity then lives in the
   * image only). Lets the storyboard tailor spoken lines to who is on camera.
   */
  personBrief: string;
  /** User-chosen output shape — sizes the image sheets and the final video. */
  aspectRatio: AspectRatio;
  /**
   * Target ad length (`15s`/`30s`/`45s`/`60s`). Drives the segment count
   * (`segmentCountFor`) for the master storyboard crop + per-segment video fan-out.
   */
  duration: Duration;
  /**
   * Multi-segment only — the locked visual-style bible from `runs.visual_style`.
   * Injected VERBATIM into every segment storyboard + video prompt so all clips
   * share one grade/lighting/palette. Undefined for 15s runs.
   */
  visualStyle?: string;
  openai: OpenAIProvider;
  /** Video provider (Seedance 2.0 via BytePlus). Used by the Video Builder. */
  video: VideoProvider;
}

/**
 * One ~15s segment of a 60s ad, planned by the `narrativeOutline` skill BEFORE
 * any storyboard renders. The four summaries are the continuity glue: each
 * `segment_storyboard`/`segment_video` receives its own summary plus the other
 * three, so the four clips read as ONE cohesive ad (same person/wardrobe,
 * product state carried forward, coherent time/location progression).
 */
export interface SegmentSummary {
  /** Segment position, 0..3. */
  index: number;
  /** The act this segment plays in the arc, e.g. "hook" / "product in use". */
  beat: string;
  /** 2–3 sentences: setting, action, product state, spoken beat for these ~15s. */
  summary: string;
}

/** The 60s narrative arc — exactly four segment summaries, persisted to `runs.narrativeOutline`. */
export interface NarrativeOutline {
  segments: SegmentSummary[];
  /**
   * The ONE locked visual-style bible for the whole 60s ad — color grade, film
   * stock/lens, lighting language, palette, and the time-of-day arc across the
   * four segments. Planned once here and injected VERBATIM into all four
   * storyboard prompts and all four video prompts (8 prompts, identical string)
   * so the four clips share one look. Persisted to `runs.visual_style`.
   */
  visualStyle: string;
}

/** Uniform skill output: the persisted asset + the inserted artifact row. */
export interface SkillResult<TArtifact> {
  assetId: string;
  assetUrl: string;
  artifact: TArtifact;
  promptUsed: string;
}
