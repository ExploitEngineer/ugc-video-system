import { describe, it, expect } from "vitest";

import type {
  NexComposition,
  NexLayer,
} from "../../../providers/template-render.js";
import { resolveWindows } from "../timeline.js";

const comp = (
  aeid: number,
  name: string,
  duration: number,
): NexComposition => ({ aeid, name, width: 1920, height: 1080, duration });

const layer = (
  compositionId: number,
  aeid: number,
  name: string,
  times: { start?: number; in: number; out: number },
  sourceCompId: number | null = null,
): NexLayer => ({
  composition_id: compositionId,
  aeid,
  name,
  layer_type: "av",
  source_type: sourceCompId ? "comp" : "file",
  source_comp_id: sourceCompId,
  start_time: times.start ?? times.in,
  in_point: times.in,
  out_point: times.out,
});

/**
 * Transcribed from the real `mixkit-split-text-intro-617` project, whose
 * introspection is what exposed every bug this module exists to fix.
 *
 *   Final_1920x1080 (12.033s)
 *     └ !Post_Production (12.033s)
 *         ├ Scene_1 [0.000 → 2.167] └ PH_1 (empty comp, claims 60s)
 *         ├ Scene_2 [2.167 → 4.500] └ PH_2 (empty comp, claims 60s)
 *         └ Text_Design_3 [6.0 → 7.633] └ Text_3 ×5 (staggered) └ BOLD
 */
const COMPS = [
  comp(6936, "Final_1920x1080", 12.033),
  comp(508, "!Post_Production", 12.033),
  comp(76, "Scene_1", 60),
  comp(480, "Scene_2", 60),
  comp(5, "PH_1", 60),
  comp(494, "PH_2", 60),
  comp(6706, "Text_Design_3", 10.033),
  comp(6722, "Text_3", 10.033),
];

const LAYERS: NexLayer[] = [
  layer(6936, 1, "!Post_Production", { in: 0, out: 12.033 }, 508),

  layer(508, 2, "Scene_1", { in: 0, out: 2.167 }, 76),
  layer(508, 3, "Scene_2", { start: 2.167, in: 2.167, out: 4.5 }, 480),
  layer(508, 4, "Text_Design_3", { start: 6, in: 6, out: 7.633 }, 6706),

  // The placeholder claims 60 seconds inside its own scene.
  layer(76, 5, "PH_1", { in: 0, out: 60 }, 5),
  layer(480, 6, "PH_2", { in: 0, out: 60 }, 494),

  // One comp, instanced five times, each a frame later — a split-text reveal.
  ...[0, 0.033, 0.067, 0.1, 0.133].map((offset, i) =>
    layer(6706, 10 + i, "Text_3", { start: offset, in: offset, out: 5 + offset }, 6722),
  ),
  { ...layer(6722, 20, "BOLD", { in: 0, out: 10.033 }), layer_type: "text", source_type: null },
];

describe("resolveWindows — the real project", () => {
  const w = resolveWindows("Final_1920x1080", COMPS, LAYERS);

  it("clips a placeholder to the scene that places it, not its own duration", () => {
    // PH_1 says 60 seconds. It is on screen for 2.167.
    expect(w.get(5)).toEqual({ startSec: 0, durationSec: 2.167 });
  });

  it("carries the parent's start_time down into the child's clock", () => {
    // PH_2's own in_point is 0, but Scene_2 starts at 2.167.
    expect(w.get(6)).toEqual({ startSec: 2.167, durationSec: 2.333 });
  });

  it("unions the windows of a composition instanced several times", () => {
    // BOLD lives in Text_3, which appears 5× inside Text_Design_3 [6 → 7.633].
    const bold = w.get(20);
    expect(bold?.startSec).toBe(6);
    expect(bold?.durationSec).toBeCloseTo(1.633, 3);
  });

  it("gives the root's own layer the composition's full length", () => {
    expect(w.get(1)).toEqual({ startSec: 0, durationSec: 12.033 });
  });

  it("orders the scenes the way the ad plays", () => {
    const starts = [5, 6].map((aeid) => w.get(aeid)?.startSec);
    expect(starts).toEqual([0, 2.167]);
  });
});

describe("resolveWindows — edges", () => {
  it("returns nothing when the main composition is not in the list", () => {
    expect(resolveWindows("Nope", COMPS, LAYERS).size).toBe(0);
  });

  it("drops a layer whose window falls entirely outside its parent's", () => {
    const comps = [comp(1, "main", 10), comp(2, "child", 10)];
    const layers = [
      layer(1, 10, "child", { in: 0, out: 2 }, 2),
      // Starts at 5s inside a child that is only visible for its first 2s.
      layer(2, 11, "late", { in: 5, out: 8 }),
    ];
    const w = resolveWindows("main", comps, layers);
    expect(w.has(10)).toBe(true);
    expect(w.has(11)).toBe(false);
  });

  it("never lets a child outlive its parent", () => {
    const comps = [comp(1, "main", 10), comp(2, "child", 60)];
    const layers = [
      layer(1, 10, "child", { in: 1, out: 3 }, 2),
      layer(2, 11, "inner", { in: 0, out: 60 }),
    ];
    const inner = resolveWindows("main", comps, layers).get(11);
    expect(inner).toEqual({ startSec: 1, durationSec: 2 });
  });

  it("survives a cyclic nesting rather than recursing forever", () => {
    const comps = [comp(1, "main", 5), comp(2, "loop", 5)];
    const layers = [
      layer(1, 10, "loop", { in: 0, out: 5 }, 2),
      layer(2, 11, "back", { in: 0, out: 5 }, 1), // points at main
    ];
    expect(() => resolveWindows("main", comps, layers)).not.toThrow();
  });

  it("treats a layer with no time fields as starting at zero", () => {
    const comps = [comp(1, "main", 8)];
    const layers: NexLayer[] = [
      {
        composition_id: 1,
        aeid: 10,
        name: "bare",
        layer_type: "av",
        source_type: "file",
        source_comp_id: null,
      },
    ];
    // in=0, out=in → zero-length → never on screen, so it is simply absent.
    expect(resolveWindows("main", comps, layers).has(10)).toBe(false);
  });
});
