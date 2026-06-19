import { describe, it, expect } from "vitest";

import {
  assetImpliedDefault,
  clampAdType,
  clampHooks,
  confidenceGate,
  downgradeTarget,
  reconcile,
} from "../reconcile.js";
import { CONFUSABLE_RULES, renderAdTypeMenu, renderHookMenu } from "../menu.js";

describe("assetImpliedDefault", () => {
  it("product → product-showcase, none → brand-awareness", () => {
    expect(assetImpliedDefault(true)).toBe("product-showcase");
    expect(assetImpliedDefault(false)).toBe("brand-awareness");
  });
});

describe("clampAdType", () => {
  it("passes a canonical id through", () => {
    expect(clampAdType("testimonial", true)).toBe("testimonial");
    expect(clampAdType("brand-story", false)).toBe("brand-story");
  });

  it("resolves a legacy alias to its canonical id", () => {
    expect(clampAdType("ugc", true)).toBe("testimonial");
    expect(clampAdType("inspirational", false)).toBe("brand-story");
  });

  it("snaps a near-miss (edit distance ≤2) to the registered id", () => {
    expect(clampAdType("testimonal", true)).toBe("testimonial"); // missing 'i'
  });

  it("falls back to the asset-implied default for garbage", () => {
    expect(clampAdType("totally-unknown-xyz", false)).toBe("brand-awareness");
    expect(clampAdType("totally-unknown-xyz", true)).toBe("product-showcase");
    expect(clampAdType("", true)).toBe("product-showcase");
  });
});

describe("confidenceGate", () => {
  it("keeps the pick above the floor", () => {
    expect(confidenceGate("testimonial", 0.9, true, true)).toBe("testimonial");
  });

  it("overrides a low-confidence pick of a different look family", () => {
    // testimonial (ugc_authentic) vs the no-asset default (brand-awareness → cinematic_polished fallback)
    expect(confidenceGate("testimonial", 0.3, false, false)).toBe(
      "brand-awareness",
    );
  });

  it("keeps a low-confidence pick that shares the default's look + is asset-compatible", () => {
    // explainer shares the graphic_text look of the no-asset default
    // (brand-awareness) and needs no assets → kept, not overridden.
    expect(confidenceGate("explainer", 0.3, false, false)).toBe("explainer");
  });
});

describe("downgradeTarget (look-preserving chain)", () => {
  it("routes product-demo → explainer", () => {
    expect(downgradeTarget("product-demo", false, false)).toBe("explainer");
  });
  it("routes lifestyle → brand-story", () => {
    expect(downgradeTarget("lifestyle", false, false)).toBe("brand-story");
  });
  it("routes before-after → social-proof", () => {
    expect(downgradeTarget("before-after", false, false)).toBe("social-proof");
  });
  it("falls to brand-awareness for an unknown source", () => {
    expect(downgradeTarget("no-such-type", false, false)).toBe(
      "brand-awareness",
    );
  });
});

describe("clampHooks", () => {
  it("strips a person-only hook when no person, seeds a compatible default", () => {
    const sel = clampHooks("testimonial", ["testimonial"], true, false);
    expect(sel.visualLead.id).toBe("problem-solution");
  });
});

describe("reconcile", () => {
  it("person-required + no person → synthesize, type unchanged, person-hook kept", () => {
    const out = reconcile(
      { adType: "testimonial", hooks: ["testimonial"], confidence: 0.9 },
      true,
      false,
    );
    expect(out.adType).toBe("testimonial");
    expect(out.synthesizePerson).toBe(true);
    // synthesized person makes the testimonial hook valid again
    expect(out.hooks.visualLead.id).toBe("testimonial");
  });

  it("both-optional type with no assets → no synth, no downgrade", () => {
    const out = reconcile(
      { adType: "brand-story", hooks: ["curiosity-gap"], confidence: 0.8 },
      false,
      false,
    );
    expect(out.adType).toBe("brand-story");
    expect(out.synthesizePerson).toBe(false);
  });

  it("low confidence garbage with a product lands on the product default", () => {
    const out = reconcile(
      { adType: "???", hooks: [], confidence: 0.2 },
      true,
      false,
    );
    expect(out.adType).toBe("product-showcase");
  });
});

describe("detector menus", () => {
  it("renderAdTypeMenu lists the registered types", () => {
    const menu = renderAdTypeMenu();
    expect(menu).toContain("testimonial");
    expect(menu).toContain("brand-story");
    expect(menu).toContain("look:");
  });

  it("renderHookMenu lists all 16 hooks", () => {
    const menu = renderHookMenu();
    expect(menu.split("\n").length).toBe(16);
    expect(menu).toContain("problem-solution");
    expect(menu).toContain("confession");
  });

  it("CONFUSABLE_RULES is non-empty", () => {
    expect(CONFUSABLE_RULES.length).toBeGreaterThan(0);
  });
});
