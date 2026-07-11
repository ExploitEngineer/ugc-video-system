// Resolve every layer's ABSOLUTE window on the main composition's timeline.
//
// Pure: no I/O, no provider, no DB. The whole template pipeline hangs off this,
// because a slot's position in time is what decides which second of the 15s
// master it receives — and getting it wrong is invisible until you watch the
// finished ad.
//
// WHY THIS EXISTS. A designer's footage placeholder is rarely a top-level layer.
// In a real project it sits three compositions deep:
//
//   Final_1920x1080 → !Post_Production → Scene_2 → PH_2
//
// `PH_2` reports `in_point: 0, out_point: 60` — its own comp's clock, and a
// 60-second placeholder comp at that. What actually reaches the screen is the
// 2.333 seconds `Scene_2` is visible for, starting at 2.167. Only the chain
// knows that.
//
// The three fields this reads (`start_time`, `in_point`, `out_point`) are on
// every layer of Nexrender's v3 response and are absent from its documentation.

import type {
  NexComposition,
  NexLayer,
} from "../../providers/template-render.js";

export interface LayerWindow {
  /** Seconds into the main composition where the layer first appears. */
  startSec: number;
  /** How long it stays on screen. Never negative. */
  durationSec: number;
}

const num = (v: number | undefined, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Map every layer to the window it occupies on the main composition's timeline,
 * keyed by `aeid`.
 *
 * A layer `L` inside composition `C`, where `C` is placed on its parent's
 * timeline by layer `M`, is visible for
 *
 *     [ M.start_time + L.in_point , M.start_time + L.out_point ]  ∩  M's window
 *
 * recursed to the root, whose window is the composition's own duration.
 *
 * A composition used more than once yields several windows for the same layer —
 * `Text_3` is instanced five times to stagger a split-text reveal, so its `BOLD`
 * layer has five. They are UNIONED: earliest start, latest end. That is the span
 * the words are on screen for, which is what a caller means when it asks when a
 * slot appears.
 *
 * Layers that never reach the screen (an out-point before the parent's in-point,
 * or a comp nested but never placed) are simply absent from the map.
 */
export function resolveWindows(
  mainComposition: string,
  comps: NexComposition[],
  layers: NexLayer[],
): Map<number, LayerWindow> {
  const main = comps.find((c) => c.name === mainComposition);
  if (!main) return new Map();

  const layersByComp = new Map<string, NexLayer[]>();
  for (const l of layers) {
    const k = String(l.composition_id);
    const bucket = layersByComp.get(k);
    if (bucket) bucket.push(l);
    else layersByComp.set(k, [l]);
  }

  /** aeid → [earliest start, latest end], merged across every instance. */
  const spans = new Map<number, [number, number]>();
  const record = (aeid: number, start: number, end: number) => {
    const prev = spans.get(aeid);
    if (!prev) spans.set(aeid, [start, end]);
    else spans.set(aeid, [Math.min(prev[0], start), Math.max(prev[1], end)]);
  };

  /**
   * `offset` converts `compId`'s local clock into the main timeline.
   * `clipStart`/`clipEnd` is the window the placing layer is itself visible for —
   * a child can never outlive its parent.
   *
   * `chain` guards a project whose comps nest cyclically. After Effects forbids
   * it, but this walks data we did not author.
   */
  const visit = (
    compId: string,
    offset: number,
    clipStart: number,
    clipEnd: number,
    chain: ReadonlySet<string>,
  ): void => {
    if (chain.has(compId)) return;
    const inner = layersByComp.get(compId);
    if (!inner) return;
    const nextChain = new Set(chain).add(compId);

    for (const l of inner) {
      const inPoint = num(l.in_point, 0);
      const outPoint = num(l.out_point, inPoint);
      const start = Math.max(offset + inPoint, clipStart);
      const end = Math.min(offset + outPoint, clipEnd);
      if (end <= start) continue; // never on screen

      record(l.aeid, start, end);

      if (l.source_comp_id != null) {
        // `start_time` is where the child's t=0 lands on THIS comp's clock, so
        // it composes with the offset we already carry. `in_point` does not:
        // it only says when the layer switches on.
        visit(
          String(l.source_comp_id),
          offset + num(l.start_time, 0),
          start,
          end,
          nextChain,
        );
      }
    }
  };

  visit(String(main.aeid), 0, 0, num(main.duration, 0), new Set());

  const out = new Map<number, LayerWindow>();
  for (const [aeid, [start, end]] of spans) {
    out.set(aeid, {
      startSec: round(start),
      durationSec: round(end - start),
    });
  }
  return out;
}

/** Milliseconds are the finest resolution any of this needs; keep args readable. */
const round = (n: number): number => Math.round(n * 1000) / 1000;
