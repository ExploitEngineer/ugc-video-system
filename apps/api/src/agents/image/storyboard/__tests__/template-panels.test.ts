import { describe, it, expect } from "vitest";

import { buildStoryboardPrompt } from "../prompt.js";

const base = {
  adStyle: "warm morning light",
  adType: "lifestyle",
  productBrief: "A matte ceramic mug.",
  personBrief: "",
  userPrompt: "A calm promo for a ceramic mug.",
  hasPerson: false,
  aspectRatio: "16:9" as const,
};

const sys = (beats?: { scene: string }[]) =>
  buildStoryboardPrompt({ ...base, templateBeats: beats })[0]?.content ?? "";

describe("storyboard prompt — template N-panel mode", () => {
  it("renders one panel per beat and lists the PLANNED BEATS", () => {
    const s = sys([
      { scene: "the empty mug on a sunlit counter" },
      { scene: "coffee pours in, steam rising" },
      { scene: "hands lift the mug to a smile" },
    ]);
    expect(s).toContain("PLANNED BEATS");
    expect(s).toContain("the empty mug on a sunlit counter");
    expect(s).toContain("hands lift the mug to a smile");
    // THREE scenes, badges 01 through 03, a 2×2 grid (panelGrid(3) = 2×2).
    expect(s).toContain("exactly THREE scenes");
    expect(s).toContain("01 through 03");
    expect(s).toContain("a 2×2 grid");
    expect(s).toContain("`scenes` MUST have exactly 3 entries");
    // The trailing empty cell must be called out (3 beats in a 4-cell grid).
    expect(s).toMatch(/unused trailing cell/i);
  });

  it("uses a single row for two beats", () => {
    const s = sys([{ scene: "wide establishing shot" }, { scene: "close payoff" }]);
    expect(s).toContain("exactly TWO scenes");
    expect(s).toContain("01 through 02");
    expect(s).toContain("a single row of 2");
    // Two beats fill a 1×2 grid exactly — no empty-cell note.
    expect(s).not.toMatch(/unused trailing cell/i);
  });

  it("stays the legacy 4-panel sheet when no beats are given", () => {
    const s = sys();
    expect(s).toContain("exactly FOUR scenes");
    expect(s).toContain("2×2 grid");
    expect(s).not.toContain("PLANNED BEATS");
  });

  it("stays legacy for a single video slot (fewer than 2 beats)", () => {
    // deriveTemplateBeats never emits <2, but guard the prompt anyway.
    const s = sys([{ scene: "only one" }]);
    expect(s).toContain("exactly FOUR scenes");
    expect(s).not.toContain("PLANNED BEATS");
  });
});
