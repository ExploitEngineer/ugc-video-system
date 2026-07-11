// Decide which piece of the 15s master clip fills each of the template's video
// slots. Pure: no I/O, no ffmpeg, no provider — so every rule here is pinned by
// a test rather than discovered in a finished render.
//
// WHY THIS EXISTS. A template's video slots are windows on a timeline: a scene
// at 0.0s running 2.2s, another at 2.2s running 2.3s, and so on. Nexrender
// cannot cut footage to them: a job asset REPLACES the footage item and carries
// no in-point, and `nx:layer-start-set` moves a layer on the composition's
// timeline rather than seeking its source. So injecting one master URL into four
// slots plays the same opening seconds four times.
//
// Instead we cut a slice per slot 1:1 — from the SAME second of the master that
// the slot occupies in the finished ad. A slot at composition-time t is cut from
// master second t, so the footage plays in lockstep with the voiceover we lay
// over the whole render (video-time == audio-time == in sync), and the scenes
// read as one continuous take that the design happens to cut up.
//
// Every slice is MUTED. The master's audio is one continuous voiceover; playing
// a fragment of it under each scene, with silence in the gaps, is not an ad.
// `clips.ts` extracts the whole track instead, and it is muxed over the finished
// render.
//
// The master is 15s. A composition longer than that is CROPPED to 15s downstream
// (`capVideoDuration`), so a slot the design places after the 15s mark has no
// footage to show and is dropped by that crop — we never compress the footage to
// fit a longer composition, because compressing is exactly what desyncs it.

import type { TemplateSlot } from "@ugc/shared";

import { MASTER_CLIP_SECONDS } from "./geometry.js";

export interface SlicePlan {
  jobLayerName: string;
  /** Seconds into the master where this slot's footage begins. */
  startSec: number;
  /** How long the slice runs. Never longer than the master. */
  durationSec: number;
}

/** Round to milliseconds, so ffmpeg args stay readable and stable. */
const round = (n: number): number => Math.round(n * 1000) / 1000;

const EPSILON = 1e-6;

/** `sliceClip` needs a positive duration; a slot past the master's end is cropped away regardless. */
const MIN_SLICE = 0.1;

/**
 * Plan a slice for every video slot.
 *
 * `slots` must already be filtered to VIDEO slots (`fillableVideoSlots`) and
 * sorted by `startSec`, which `buildStructure` guarantees.
 *
 * When the slots know their windows (`startSec` + `durationSec`, resolved by
 * `timeline.ts`) each is cut 1:1 from exactly the second it plays — a slot at
 * composition-time t is cut from master second t — so the footage stays in sync
 * with the voiceover laid over the render. A composition longer than the 15s
 * master is cropped to 15s downstream, so a slot placed past the master's end is
 * dropped by that crop; here it just clamps to the master's tail (a valid slice
 * that is never shown). We never compress the cut points to span a longer
 * composition — compressing is what pulls the footage off the voiceover.
 *
 * Slots with no window — an older snapshot, or a template whose layers Nexrender
 * could not place — fall back to laying the slices end to end, and spreading
 * them across the master when they do not fit.
 */
export function planClipSlices(
  slots: TemplateSlot[],
  opts: { masterSec?: number } = {},
): SlicePlan[] {
  const master = opts.masterSec ?? MASTER_CLIP_SECONDS;
  if (slots.length === 0) return [];

  const timed = slots.every(
    (s) => s.startSec != null && s.durationSec != null && s.durationSec > 0,
  );

  const lengths = timed
    ? // A slot longer than the whole master gets the whole master. After Effects
      // holds its last frame — a brief freeze beats looping back mid-shot.
      slots.map((s) => Math.min(s.durationSec ?? master, master))
    : fallbackLengths(slots, master);

  // 1:1 — a slot's own composition-time start IS its offset into the master.
  const starts = timed
    ? slots.map((s) => Math.max(0, s.startSec ?? 0))
    : fallbackStarts(lengths, master);

  return slots.map((slot, i) => {
    // Keep the TRUE start so the footage stays locked to the linear voiceover;
    // only SHORTEN the slice when it would overrun the master (After Effects
    // holds the last frame), never slide the start back — that is the desync.
    const startSec = round(Math.max(0, Math.min(starts[i] ?? 0, master - MIN_SLICE)));
    const durationSec = round(
      Math.max(MIN_SLICE, Math.min(lengths[i] ?? master, master - startSec)),
    );
    return { jobLayerName: slot.jobLayerName, startSec, durationSec };
  });
}

/** No timing at all: an even share of the master each. */
function fallbackLengths(slots: TemplateSlot[], master: number): number[] {
  const evenShare = master / slots.length;
  return slots.map((s) =>
    Math.min(Math.max(s.durationSec ?? evenShare, 0), master),
  );
}

/**
 * No timing at all: lay the windows end to end, so the slots still read as one
 * continuous take. If they do not fit, spread them so the first starts at 0 and
 * the last ends at the master's end — they overlap, but every slot still shows
 * different footage.
 */
function fallbackStarts(lengths: number[], master: number): number[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  const n = lengths.length;
  if (total <= master + EPSILON) {
    return lengths.reduce<number[]>((acc, _len, i) => {
      acc.push(i === 0 ? 0 : (acc[i - 1] ?? 0) + (lengths[i - 1] ?? 0));
      return acc;
    }, []);
  }
  return lengths.map((len, i) => (n === 1 ? 0 : ((master - len) * i) / (n - 1)));
}
