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

  it("cuts for a cut-style look (regression lock)", () => {
    const cut = buildDeterministicVideoPrompt({
      adStyle: "warm",
      adType: CUTS_TYPE,
      scenes: scenes(4),
      durationSec: 15,
      aspectRatio: "16:9",
    });
    expect(cut).toMatch(/clean CUT/i);
  });
});

describe("videoRenderDirective — per-look motion", () => {
  it("cuts for a cut-style look", () => {
    expect(videoRenderDirective(CUTS_TYPE)).toMatch(/clean CUT/i);
  });

  it("runs one continuous take for a ugc look", () => {
    const ugc = videoRenderDirective("ugc");
    expect(ugc).toMatch(/ONE continuous/i);
    expect(ugc).not.toMatch(/clean CUT/i);
  });
});
