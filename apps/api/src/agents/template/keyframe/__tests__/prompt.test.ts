import { describe, it, expect } from "vitest";

import {
  buildTemplateKeyframePrompt,
  type TemplateKeyframeBeat,
} from "../prompt.js";

const beat = (startSec: number, durationSec: number, scene: string): TemplateKeyframeBeat => ({
  startSec,
  durationSec,
  scene,
});

const base = {
  userPrompt: "A calm promo for a home cleaning service",
  aspectRatio: "16:9",
  clipSeconds: 12,
  hasProduct: false,
  hasPerson: false,
};

/** system + user joined, for keyword assertions. */
const text = (beats: TemplateKeyframeBeat[]): string =>
  buildTemplateKeyframePrompt({ ...base, beats })
    .map((m) => m.content)
    .join("\n");

describe("buildTemplateKeyframePrompt — fixed 4-panel board", () => {
  const three = [
    beat(0, 4, "a messy living room in warm afternoon light"),
    beat(4, 4, "the same room now spotless and tidy"),
    beat(8, 4, "a woman sinks into the clean couch, relieved"),
  ];

  it("always asks for a FIXED four-panel 2×2 board (decoupled from slot count)", () => {
    for (const beats of [
      [beat(0, 12, "one scene")],
      three,
      [
        beat(0, 3, "a"),
        beat(3, 3, "b"),
        beat(6, 3, "c"),
        beat(9, 3, "d"),
        beat(12, 3, "e"),
        beat(15, 3, "f"),
      ],
    ]) {
      const t = text(beats);
      expect(t).toMatch(/four equal-size photographic panels in a 2×2 grid/i);
      expect(t).toMatch(/exactly FOUR entries/i);
      // number badge + caption bar (direction only, cropped before Seedance)
      expect(t).toMatch(/number badge/i);
      expect(t).toMatch(/caption bar/i);
    }
  });

  it("outputs a sheetImagePrompt + a scenes array with panelCaption + spokenLine", () => {
    const t = text(three);
    expect(t).toContain("sheetImagePrompt");
    expect(t).toContain("panelCaption");
    expect(t).toContain("spokenLine");
  });

  it("carries the restored realism scaffolding (lens / soft light / soft skin)", () => {
    const t = text(three);
    expect(t).toMatch(/natural perspective|85mm|35mm/i);
    expect(t).toMatch(/soft.{0,20}(diffused|light)/i);
    expect(t).toMatch(/neutral white balance/i);
    // inverts the over-texture default
    expect(t).toMatch(/waxy|plastic|airbrushed/i);
    expect(t).not.toMatch(/\b8k\b|every pore|hyper-detailed|\bmacro\b/i);
  });

  it("enforces cross-panel consistency (only the camera moves)", () => {
    const t = text(three).toLowerCase();
    expect(t).toMatch(/same place/);
    expect(t).toMatch(/only the camera/);
  });

  it("keeps the footage PLAIN (template composites all graphics)", () => {
    const t = text(three).toLowerCase();
    expect(t).toMatch(/composites all/);
    expect(t).toMatch(/clean live-action|nothing baked on/);
  });

  it("NEVER references an ad type or the ad-type registry", () => {
    const t = text(three).toLowerCase();
    expect(t).not.toContain("ad type");
    expect(t).not.toContain("ad-type");
    expect(t).not.toContain("ugc");
    expect(t).not.toContain("testimonial");
  });

  it("carries the LOCKED look bible into the board when present", () => {
    const t = buildTemplateKeyframePrompt({
      ...base,
      beats: three,
      visualStyle: "soft green + white palette, airy daylight, calm mood",
    })
      .map((m) => m.content)
      .join("\n");
    expect(t).toMatch(/LOCKED LOOK/i);
    expect(t).toContain("soft green + white palette");
  });
});
