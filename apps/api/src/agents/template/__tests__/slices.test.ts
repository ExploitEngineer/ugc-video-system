import { describe, it, expect } from "vitest";

import type { TemplateSlot } from "@ugc/shared";

import { MASTER_CLIP_SECONDS } from "../geometry.js";
import { planClipSlices } from "../slices.js";

const vid = (jobLayerName: string, durationSec: number | null): TemplateSlot =>
  ({
    asset: "VIDEO",
    composition: "main",
    layerName: jobLayerName,
    jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    durationSec,
  }) as TemplateSlot;

const M = MASTER_CLIP_SECONDS; // 15

describe("planClipSlices — the 7s/2s/2s case this whole change exists for", () => {
  it("lays the windows end to end, so the slots read as one continuous take", () => {
    const plan = planClipSlices([vid("a", 7), vid("b", 2), vid("c", 2)]);
    expect(plan).toEqual([
      { jobLayerName: "a", startSec: 0, durationSec: 7, wholeMaster: false, keepAudio: true },
      { jobLayerName: "b", startSec: 7, durationSec: 2, wholeMaster: false, keepAudio: false },
      { jobLayerName: "c", startSec: 9, durationSec: 2, wholeMaster: false, keepAudio: false },
    ]);
  });

  it("gives every slot DIFFERENT footage — the entire point", () => {
    const plan = planClipSlices([vid("a", 7), vid("b", 2), vid("c", 2)]);
    const starts = plan.map((p) => p.startSec);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it("hands the voiceover to the LONGEST slice when there is no audio layer", () => {
    const plan = planClipSlices([vid("a", 2), vid("b", 7), vid("c", 2)]);
    expect(plan.map((p) => p.keepAudio)).toEqual([false, true, false]);
  });

  it("mutes every slice when the template has an audio layer to take the track", () => {
    const plan = planClipSlices([vid("a", 7), vid("b", 2)], { hasAudioLayer: true });
    expect(plan.every((p) => !p.keepAudio)).toBe(true);
  });
});

describe("planClipSlices — over budget", () => {
  it("spreads windows across the master when the slots want more than 15s", () => {
    // 3 x 7s = 21s of footage from a 15s master.
    const plan = planClipSlices([vid("a", 7), vid("b", 7), vid("c", 7)]);
    expect(plan.map((p) => p.startSec)).toEqual([0, 4, 8]);
    // First starts at 0, last ends exactly at the master's end.
    expect(plan[0]?.startSec).toBe(0);
    expect((plan[2]?.startSec ?? 0) + (plan[2]?.durationSec ?? 0)).toBe(M);
  });

  it("still gives each slot a distinct window", () => {
    const plan = planClipSlices([vid("a", 10), vid("b", 10), vid("c", 10)]);
    expect(new Set(plan.map((p) => p.startSec)).size).toBe(3);
  });
});

describe("planClipSlices — single slot", () => {
  it("takes the whole master when the slot's length is unknown", () => {
    const [only] = planClipSlices([vid("a", null)]);
    expect(only).toMatchObject({ startSec: 0, durationSec: M, wholeMaster: true });
  });

  it("cuts the opening seconds when the slot is shorter than the master", () => {
    const [only] = planClipSlices([vid("a", 6)]);
    expect(only).toMatchObject({ startSec: 0, durationSec: 6, wholeMaster: false });
  });

  it("gives a slot LONGER than the master the whole master (AE holds the last frame)", () => {
    const [only] = planClipSlices([vid("a", 20)]);
    expect(only).toMatchObject({ startSec: 0, durationSec: M, wholeMaster: true });
  });
});

describe("planClipSlices — unknown lengths", () => {
  it("splits the master evenly across slots with no duration", () => {
    const plan = planClipSlices([vid("a", null), vid("b", null), vid("c", null)]);
    expect(plan.map((p) => p.durationSec)).toEqual([5, 5, 5]);
    expect(plan.map((p) => p.startSec)).toEqual([0, 5, 10]);
  });

  it("mixes known and unknown without breaking the budget", () => {
    const plan = planClipSlices([vid("a", 9), vid("b", null)]);
    // b falls back to an even share (7.5), so 9 + 7.5 > 15 → spread.
    for (const p of plan) {
      expect(p.startSec + p.durationSec).toBeLessThanOrEqual(M + 1e-6);
    }
  });
});

describe("planClipSlices — invariants that must hold for ANY template", () => {
  const CASES: Array<Array<number | null>> = [
    [7, 2, 2], [7, 7, 7], [2], [20], [null], [null, null], [15, 15],
    [1, 1, 1, 1, 1, 1, 1, 1], [0.5, 14.5], [30, 1], [null, 4, null],
    [10, 10, 10, 10],
  ];

  it("never runs past the end of the master, never starts before it", () => {
    for (const lens of CASES) {
      const slots = lens.map((d, i) => vid(`s${i}`, d));
      for (const p of planClipSlices(slots)) {
        const label = `${JSON.stringify(lens)} → ${p.jobLayerName}`;
        expect(p.startSec, label).toBeGreaterThanOrEqual(0);
        expect(p.durationSec, label).toBeGreaterThan(0);
        expect(p.startSec + p.durationSec, label).toBeLessThanOrEqual(M + 1e-6);
      }
    }
  });

  it("emits exactly one plan per slot, in order", () => {
    for (const lens of CASES) {
      const slots = lens.map((d, i) => vid(`s${i}`, d));
      const plan = planClipSlices(slots);
      expect(plan.map((p) => p.jobLayerName)).toEqual(slots.map((s) => s.jobLayerName));
    }
  });

  it("marks at most one slice as carrying the audio", () => {
    for (const lens of CASES) {
      const slots = lens.map((d, i) => vid(`s${i}`, d));
      const kept = planClipSlices(slots).filter((p) => p.keepAudio).length;
      expect(kept, JSON.stringify(lens)).toBe(1);
    }
  });

  it("handles the empty case", () => {
    expect(planClipSlices([])).toEqual([]);
  });
});
