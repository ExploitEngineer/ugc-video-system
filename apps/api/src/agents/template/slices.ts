// Decide which piece of the 15s master clip fills each of the template's video
// slots. Pure: no I/O, no ffmpeg, no provider — so every rule here is pinned by
// a test rather than discovered in a finished render.
//
// WHY THIS EXISTS. A template's video slots have different lengths (7s at the
// top, then two 2s cutaways). Nexrender cannot help: a job asset REPLACES the
// footage item and carries no in-point, and `nx:layer-start-set` moves a layer
// on the composition timeline rather than seeking its source. So injecting one
// master URL into three slots plays the same opening seconds three times.
//
// Instead we cut a slice per slot, each showing a DIFFERENT moment of the same
// continuous shot. The composition is never trimmed: it keeps its full runtime
// and its graphics fill the rest of the timeline.

import type { TemplateSlot } from "@ugc/shared";

import { MASTER_CLIP_SECONDS } from "./geometry.js";

export interface SlicePlan {
  jobLayerName: string;
  /** Seconds into the master where this slot's footage begins. */
  startSec: number;
  /** How long the slice runs. Never longer than the master. */
  durationSec: number;
  /**
   * True when this slice is the whole master, unmodified. The caller skips
   * ffmpeg entirely and injects the master URL directly.
   */
  wholeMaster: boolean;
  /**
   * True for the ONE slice that carries the voiceover, used only when the
   * template has no audio layer to receive the full track. Assigned to the
   * longest slice, where the most speech survives.
   */
  keepAudio: boolean;
}

/** Round to whole frames-ish, so ffmpeg args stay readable and stable. */
const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Plan a slice for every video slot.
 *
 * `slots` must already be filtered to fillable VIDEO slots, in the order they
 * appear in the template's layer list. Nexrender exposes no layer START times,
 * so layer order is our only proxy for time order — a documented heuristic, not
 * a fact. If the `data`-bag probe ever surfaces an in-point, sort by it first.
 *
 * `hasAudioLayer` tells us whether the master's voiceover has somewhere better
 * to live than inside one of the slices.
 */
export function planClipSlices(
  slots: TemplateSlot[],
  opts: { masterSec?: number; hasAudioLayer?: boolean } = {},
): SlicePlan[] {
  const master = opts.masterSec ?? MASTER_CLIP_SECONDS;
  if (slots.length === 0) return [];

  const n = slots.length;

  // A slot with no length of its own falls back to an even share of the master.
  // With ONE unknown slot that share is the whole master, which is also the
  // right answer: After Effects trims it to whatever the layer actually needs.
  const evenShare = master / n;
  const lengths = slots.map((s) => {
    const want = s.durationSec ?? evenShare;
    // A slot longer than the master gets the whole master. After Effects holds
    // its last frame for the remainder — a brief freeze beats a hard loop back
    // to the opening frame mid-shot.
    return Math.min(Math.max(want, 0), master);
  });

  const total = lengths.reduce((a, b) => a + b, 0);

  // The longest slice keeps the audio when there is no audio layer to take it.
  const longestIdx = lengths.reduce(
    (best, len, i) => (len > (lengths[best] ?? 0) ? i : best),
    0,
  );

  const starts =
    total <= master + 1e-6
      ? // Everything fits: lay the windows end to end. The slots then read as
        // one continuous take, chopped up by the design.
        lengths.reduce<number[]>((acc, len, i) => {
          acc.push(i === 0 ? 0 : (acc[i - 1] ?? 0) + (lengths[i - 1] ?? 0));
          return acc;
        }, [])
      : // Over budget: spread the windows across the master so the first starts
        // at 0 and the last ends at 15. They overlap, but every slot still shows
        // different footage, and the order still reads as forward motion.
        lengths.map((len, i) =>
          n === 1 ? 0 : ((master - len) * i) / (n - 1),
        );

  return slots.map((slot, i) => {
    const durationSec = round(lengths[i] ?? master);
    const startSec = round(Math.max(0, Math.min(starts[i] ?? 0, master - durationSec)));
    return {
      jobLayerName: slot.jobLayerName,
      startSec,
      durationSec,
      // No cut needed: it is the master, whole.
      wholeMaster: startSec === 0 && durationSec >= master - 1e-6,
      keepAudio: !opts.hasAudioLayer && i === longestIdx,
    };
  });
}
