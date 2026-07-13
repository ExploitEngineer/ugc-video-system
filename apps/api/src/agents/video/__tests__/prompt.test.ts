import { describe, it, expect } from "vitest";

import type { StoryboardScene } from "../../image/storyboard/prompt.js";
import {
  buildDeterministicVideoPrompt,
  videoRenderDirective,
} from "../prompt.js";

const scene = (i: number): StoryboardScene => ({
  index: i,
  cameraAngle: "steady",
  actionMovement: "",
  sceneDescription: `beat ${i}`,
  panelCaption: "",
  transcript: "",
  adStyle: "warm",
});

const scenes = (n: number) => Array.from({ length: n }, (_, i) => scene(i));

// A cut-style look, so the forced-continuous override is observable.
const CUTS_TYPE = "lifestyle";

describe("buildDeterministicVideoPrompt — shot-list brackets", () => {
  it("even-splits by scene count when no windows are given (unchanged path)", () => {
    const out = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: "ugc",
      scenes: scenes(4),
      durationSec: 15,
      aspectRatio: "16:9",
    });
    // 15s / 4 panels → the historical even split.
    expect(out).toContain("[0:00-0:04]");
    expect(out).toContain("[0:04-0:08]");
    expect(out).toContain("[0:08-0:11]");
    expect(out).toContain("[0:11-0:15]");
  });

  it("uses the slot windows for the brackets when given, clamped to the clip", () => {
    const out = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: "ugc",
      scenes: scenes(4),
      durationSec: 15,
      aspectRatio: "16:9",
      slotWindows: [
        { startSec: 0, durationSec: 2 },
        { startSec: 2, durationSec: 3 },
        { startSec: 5, durationSec: 4 },
        { startSec: 9, durationSec: 6 },
      ],
    });
    expect(out).toContain("[0:00-0:02]");
    expect(out).toContain("[0:02-0:05]");
    expect(out).toContain("[0:05-0:09]");
    expect(out).toContain("[0:09-0:15]");
    // The generic even-split brackets must NOT appear.
    expect(out).not.toContain("[0:04-0:08]");
  });

  it("forces ONE continuous take even for a cut-style look when windows are present", () => {
    const withWindows = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: CUTS_TYPE,
      scenes: scenes(3),
      durationSec: 15,
      aspectRatio: "16:9",
      slotWindows: [
        { startSec: 0, durationSec: 5 },
        { startSec: 5, durationSec: 5 },
        { startSec: 10, durationSec: 5 },
      ],
    });
    expect(withWindows).toMatch(/ONE continuous/i);
    expect(withWindows).not.toMatch(/clean CUT/i);
    // The board description reflects the real panel count, not a hard "2×2 four".
    expect(withWindows).toContain("grid of 3 keyframe panels");
    expect(withWindows).not.toContain("2×2 of four");
  });

  it("keeps the 2×2 four-panel board wording for a normal 4-scene clip", () => {
    const out = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: "ugc",
      scenes: scenes(4),
      durationSec: 15,
      aspectRatio: "16:9",
    });
    expect(out).toContain("2×2 of four keyframe panels");
  });

  it("still cuts for a cut-style look with no windows (regression lock)", () => {
    const noWindows = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: CUTS_TYPE,
      scenes: scenes(4),
      durationSec: 15,
      aspectRatio: "16:9",
    });
    expect(noWindows).toMatch(/clean CUT/i);
  });
});

describe("videoRenderDirective — continuous override", () => {
  it("returns the continuous directive when asked, regardless of ad type", () => {
    const cut = videoRenderDirective(CUTS_TYPE);
    const forced = videoRenderDirective(CUTS_TYPE, { continuous: true });
    expect(cut).toMatch(/clean CUT/i);
    expect(forced).toMatch(/ONE continuous/i);
    expect(forced).not.toMatch(/clean CUT/i);
  });
});
