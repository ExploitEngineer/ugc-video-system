import { describe, it, expect } from "vitest";

import { templateKeyframePanels } from "../../geometry.js";
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
  hasProduct: false,
  hasPerson: false,
};

/** system + user joined, for keyword assertions — panels derived from `sec`. */
const text = (beats: TemplateKeyframeBeat[], sec = 15): string => {
  const { panelCount, rows, cols } = templateKeyframePanels(sec);
  return buildTemplateKeyframePrompt({ ...base, clipSeconds: sec, beats, panelCount, rows, cols })
    .map((m) => m.content)
    .join("\n");
};

const three = [
  beat(0, 4, "a messy living room in warm afternoon light"),
  beat(4, 4, "the same room now spotless and tidy"),
  beat(8, 4, "a woman sinks into the clean couch, relieved"),
];

describe("buildTemplateKeyframePrompt — duration-derived panels", () => {
  it("asks for the duration's panel count + grid + scene count, not a fixed 4", () => {
    // 15s → 4 (2×2), 22.79s → 6 (2×3), 30s → 9 (3×3), 60s → 16 (4×4).
    const cases: [number, number, string][] = [
      [15, 4, "2×2"],
      [22.79, 6, "2×3"],
      [30, 9, "3×3"],
      [60, 16, "4×4"],
    ];
    for (const [sec, panels, grid] of cases) {
      const t = text(three, sec);
      expect(t).toMatch(
        new RegExp(`exactly ${panels} equal-size photographic panels in a ${grid} grid`, "i"),
      );
      expect(t).toMatch(new RegExp(`exactly ${panels} entries`, "i"));
      // number badge + caption bar (direction only, cropped before Seedance)
      expect(t).toMatch(/number badge/i);
      expect(t).toMatch(/caption bar/i);
    }
  });

  it("templateKeyframePanels scales 4-per-15s, snapped to a full grid", () => {
    expect(templateKeyframePanels(15)).toEqual({ panelCount: 4, rows: 2, cols: 2 });
    expect(templateKeyframePanels(22.79)).toEqual({ panelCount: 6, rows: 2, cols: 3 });
    expect(templateKeyframePanels(30)).toEqual({ panelCount: 9, rows: 3, cols: 3 });
    expect(templateKeyframePanels(45)).toEqual({ panelCount: 12, rows: 3, cols: 4 });
    expect(templateKeyframePanels(60)).toEqual({ panelCount: 16, rows: 4, cols: 4 });
    // clamped: an 8s template never drops below the proven 4 panels.
    expect(templateKeyframePanels(8).panelCount).toBe(4);
  });

  it("outputs a sheetImagePrompt + a scenes array with panelCaption + spokenLine", () => {
    const t = text(three);
    expect(t).toContain("sheetImagePrompt");
    expect(t).toContain("panelCaption");
    expect(t).toContain("spokenLine");
  });

  it("asks WHO speaks each line, via a cast authored once", () => {
    // Without this the LLM is never asked who talks, so a two-character ad reaches
    // Seedance as "four lines, all voiceover, one voice" — and it guesses, which is
    // how a woman's voice landed on a man.
    const t = text(three);
    expect(t).toContain("`cast`");
    expect(t).toContain("`speaker`");
    expect(t).toContain('"voice"');
    expect(t).toMatch(/Every non-empty `speaker` MUST be the `id` of a listed cast member/i);
  });

  it("binds every voice to that person's own gender and age", () => {
    const t = text(three);
    expect(t).toMatch(/NEVER give a\s+man a woman's voice or a woman a man's voice/i);
    expect(t).toMatch(/Exactly ONE speaker per panel/i);
  });

  it("pins cast A to the described on-camera person, so the cast can't contradict the board", () => {
    const { panelCount, rows, cols } = templateKeyframePanels(15);
    const t = buildTemplateKeyframePrompt({
      ...base,
      clipSeconds: 15,
      beats: three,
      panelCount,
      rows,
      cols,
      hasPerson: true,
      personBrief: "A woman in her late 20s with dark curly hair.",
    })
      .map((m) => m.content)
      .join("\n");
    expect(t).toMatch(/Cast member A IS this exact person/i);
    expect(t).toMatch(/never contradict it/i);
  });

  it("draws supporting cast into the board AND lets them speak", () => {
    // The board and the cast come from the SAME block on purpose: authored apart,
    // the board draws one person while two voices are directed.
    const { panelCount, rows, cols } = templateKeyframePanels(15);
    const t = buildTemplateKeyframePrompt({
      ...base,
      clipSeconds: 15,
      beats: three,
      panelCount,
      rows,
      cols,
      supportingCast: [{ role: "her partner", appearance: "a man in a maroon shirt" }],
    })
      .map((m) => m.content)
      .join("\n");
    expect(t).toMatch(/ALSO ON SCREEN/i);
    expect(t).toContain("her partner: a man in a maroon shirt");
    expect(t).toMatch(/their own cast entry/i);
  });

  it("has no supporting-cast block when there is none", () => {
    expect(text(three)).not.toMatch(/ALSO ON SCREEN/i);
  });

  it("spells shot types out — the caption bar is read by a human", () => {
    // MCU / OTS / CU are nowhere in this repo: asking for "a shot type" in "a few
    // words" let the model compress to film shorthand to fit the budget.
    const t = text(three);
    expect(t).toMatch(/FULL PLAIN ENGLISH/i);
    expect(t).toMatch(/NEVER abbreviate/i);
    expect(t).toMatch(/no MCU, no CU, no OTS/i);
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
    const { panelCount, rows, cols } = templateKeyframePanels(15);
    const t = buildTemplateKeyframePrompt({
      ...base,
      clipSeconds: 15,
      beats: three,
      panelCount,
      rows,
      cols,
      visualStyle: "soft green + white palette, airy daylight, calm mood",
    })
      .map((m) => m.content)
      .join("\n");
    expect(t).toMatch(/LOCKED LOOK/i);
    expect(t).toContain("soft green + white palette");
  });
});
