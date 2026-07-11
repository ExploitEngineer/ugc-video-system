import { describe, it, expect } from "vitest";

import type { TemplateSlot } from "@ugc/shared";

import { MASTER_CLIP_SECONDS } from "../geometry.js";
import { planClipSlices } from "../slices.js";

/** A slot that knows where it sits on the template's timeline. */
const at = (
  jobLayerName: string,
  startSec: number,
  durationSec: number,
): TemplateSlot =>
  ({
    asset: "VIDEO",
    composition: "main",
    layerName: jobLayerName,
    jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    startSec,
    durationSec,
  }) as TemplateSlot;

/** A slot from an older snapshot: no resolved window. */
const untimed = (jobLayerName: string, durationSec: number | null): TemplateSlot =>
  ({
    asset: "VIDEO",
    composition: "main",
    layerName: jobLayerName,
    jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    startSec: null,
    durationSec,
  }) as TemplateSlot;

const M = MASTER_CLIP_SECONDS; // 15

describe("planClipSlices — the real mixkit template this change exists for", () => {
  // Final_1920x1080 runs 12.033s; its four scenes occupy these windows.
  const SCENES = [
    at("PH_1", 0, 2.167),
    at("PH_2", 2.167, 2.333),
    at("PH_3", 4.767, 2.267),
    at("PH_4", 7.033, 2.033),
  ];

  it("cuts each slot from the second of the master it actually plays at", () => {
    expect(planClipSlices(SCENES)).toEqual([
      { jobLayerName: "PH_1", startSec: 0, durationSec: 2.167 },
      { jobLayerName: "PH_2", startSec: 2.167, durationSec: 2.333 },
      { jobLayerName: "PH_3", startSec: 4.767, durationSec: 2.267 },
      { jobLayerName: "PH_4", startSec: 7.033, durationSec: 2.033 },
    ]);
  });

  it("gives every slot DIFFERENT footage — the entire point", () => {
    const starts = planClipSlices(SCENES).map((p) => p.startSec);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it("keeps the footage in sync with the voiceover muxed over the render", () => {
    // A 1:1 mapping means master[t] plays at composition time t. Anything else
    // and a talking head's lips stop matching the words.
    for (const p of planClipSlices(SCENES)) {
      const slot = SCENES.find((s) => s.jobLayerName === p.jobLayerName);
      expect(p.startSec).toBe(slot?.startSec);
    }
  });
});

describe("planClipSlices — a composition longer than the master", () => {
  it("maps 1:1 and leaves a past-master slot for the 15s crop to drop", () => {
    // The master is 15s and the ad is cropped to 15s downstream, so a slot the
    // design places at 20s is never shown. It is NOT compressed onto the master
    // (that would desync every earlier slot from the linear voiceover): the
    // visible slot stays 1:1, the past-master slot clamps to the master's tail.
    const plan = planClipSlices([at("a", 0, 4), at("b", 20, 4)]);
    expect(plan[0]).toEqual({ jobLayerName: "a", startSec: 0, durationSec: 4 });
    expect(plan[1]?.startSec).toBeCloseTo(M - 0.1, 5); // 14.9 — a tail sliver, cropped away
  });

  it("never lets a slice run past the end of the master", () => {
    const plan = planClipSlices([at("a", 0, 4), at("b", 28, 4)]);
    for (const p of plan) {
      expect(p.startSec + p.durationSec).toBeLessThanOrEqual(M + 1e-6);
    }
  });

  it("shortens — never slides back — a slot that straddles the master's end", () => {
    // A slot at 13s running 4s would end at 17s; keep its true start (sync) and
    // shorten to what the master has left, rather than sliding the start back.
    const [p] = planClipSlices([at("a", 13, 4)]);
    expect(p).toEqual({ jobLayerName: "a", startSec: 13, durationSec: M - 13 });
  });

  it("gives a slot longer than the master the whole master (AE holds the last frame)", () => {
    const [only] = planClipSlices([at("a", 0, 20)]);
    expect(only).toEqual({ jobLayerName: "a", startSec: 0, durationSec: M });
  });
});

describe("planClipSlices — no timeline (older snapshots)", () => {
  it("lays the windows end to end when they fit", () => {
    const plan = planClipSlices([untimed("a", 7), untimed("b", 2), untimed("c", 2)]);
    expect(plan).toEqual([
      { jobLayerName: "a", startSec: 0, durationSec: 7 },
      { jobLayerName: "b", startSec: 7, durationSec: 2 },
      { jobLayerName: "c", startSec: 9, durationSec: 2 },
    ]);
  });

  it("spreads windows across the master when the slots want more than 15s", () => {
    const plan = planClipSlices([untimed("a", 7), untimed("b", 7), untimed("c", 7)]);
    expect(plan.map((p) => p.startSec)).toEqual([0, 4, 8]);
    expect((plan[2]?.startSec ?? 0) + (plan[2]?.durationSec ?? 0)).toBe(M);
  });

  it("splits the master evenly across slots with no duration at all", () => {
    const plan = planClipSlices([untimed("a", null), untimed("b", null), untimed("c", null)]);
    expect(plan.map((p) => p.durationSec)).toEqual([5, 5, 5]);
    expect(plan.map((p) => p.startSec)).toEqual([0, 5, 10]);
  });

  it("takes the whole master for a lone slot of unknown length", () => {
    expect(planClipSlices([untimed("a", null)])).toEqual([
      { jobLayerName: "a", startSec: 0, durationSec: M },
    ]);
  });

  it("falls back for the whole template when ANY slot lacks a window", () => {
    // A half-resolved timeline is not a timeline: mixing absolute starts with
    // guessed ones would stack two slices on the same second.
    const plan = planClipSlices([at("a", 0, 2), untimed("b", 2)]);
    expect(plan.map((p) => p.startSec)).toEqual([0, 2]);
  });
});

describe("planClipSlices — invariants that must hold for ANY template", () => {
  const TIMED: Array<Array<[number, number]>> = [
    [[0, 2.167], [2.167, 2.333], [4.767, 2.267], [7.033, 2.033]],
    [[0, 15]], [[0, 20]], [[0, 4], [20, 4]], [[11, 1], [0, 1]],
    [[0, 0.5], [14.5, 0.5]], [[0, 3], [3, 3], [6, 3], [9, 3], [12, 3]],
  ];
  const UNTIMED: Array<Array<number | null>> = [
    [7, 2, 2], [7, 7, 7], [2], [20], [null], [null, null], [15, 15],
    [1, 1, 1, 1, 1, 1, 1, 1], [0.5, 14.5], [30, 1], [null, 4, null],
  ];

  it("never runs past the end of the master, never starts before it", () => {
    const all = [
      ...TIMED.map((w) => w.map(([s, d], i) => at(`s${i}`, s, d))),
      ...UNTIMED.map((l) => l.map((d, i) => untimed(`s${i}`, d))),
    ];
    for (const slots of all) {
      for (const p of planClipSlices(slots)) {
        const label = `${JSON.stringify(slots.map((s) => s.durationSec))} → ${p.jobLayerName}`;
        expect(p.startSec, label).toBeGreaterThanOrEqual(0);
        expect(p.durationSec, label).toBeGreaterThan(0);
        expect(p.startSec + p.durationSec, label).toBeLessThanOrEqual(M + 1e-6);
      }
    }
  });

  it("emits exactly one plan per slot, in order", () => {
    for (const lens of UNTIMED) {
      const slots = lens.map((d, i) => untimed(`s${i}`, d));
      const plan = planClipSlices(slots);
      expect(plan.map((p) => p.jobLayerName)).toEqual(slots.map((s) => s.jobLayerName));
    }
  });

  it("handles the empty case", () => {
    expect(planClipSlices([])).toEqual([]);
  });
});
