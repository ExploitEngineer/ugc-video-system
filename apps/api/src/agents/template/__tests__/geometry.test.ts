import { describe, it, expect } from "vitest";

import {
  classifyImageSlot,
  clipLengthForComp,
  compNeedsTrim,
  deriveCharBudget,
  DEFAULT_SLOT_SIZE,
  estimateFontSizeFromBox,
  gptImageSizeForSlot,
  MAX_CLIP_SEC,
  MIN_CLIP_SEC,
  SEEDANCE_DURATIONS,
  slotAspectRatio,
  snapUp,
} from "../geometry.js";

// ── snapUp ───────────────────────────────────────────────────────────────────

describe("snapUp — Seedance accepts a discrete duration set, not a range", () => {
  it("returns the set's own values unchanged", () => {
    for (const d of SEEDANCE_DURATIONS) expect(snapUp(d)).toBe(d);
  });

  it("snaps UP to the next allowed value, never down", () => {
    // A clip SHORTER than its layer ends on a freeze frame; a longer one is
    // simply trimmed by After Effects. Always overshoot.
    expect(snapUp(7)).toBe(8); // 7 is rejected by ModelArk
    expect(snapUp(9)).toBe(10);
    expect(snapUp(11)).toBe(12);
    expect(snapUp(13)).toBe(15);
    expect(snapUp(14)).toBe(15);
  });

  it("rounds fractional seconds up before snapping", () => {
    expect(snapUp(4.1)).toBe(5);
    expect(snapUp(7.2)).toBe(8);
    expect(snapUp(12.5)).toBe(15);
    expect(snapUp(14.9)).toBe(15);
  });

  it("treats a whole number as exact despite float error", () => {
    expect(snapUp(12.0000001)).toBe(12);
    expect(snapUp(5.0)).toBe(5);
  });

  it("clamps below the floor and above the ceiling", () => {
    expect(snapUp(0)).toBe(MIN_CLIP_SEC);
    expect(snapUp(1)).toBe(MIN_CLIP_SEC);
    expect(snapUp(3.9)).toBe(MIN_CLIP_SEC);
    expect(snapUp(20)).toBe(MAX_CLIP_SEC);
    expect(snapUp(999)).toBe(MAX_CLIP_SEC);
  });

  it("never returns a value outside the allowed set", () => {
    for (let s = 0; s <= 30; s += 0.25) {
      expect(SEEDANCE_DURATIONS).toContain(snapUp(s) as never);
    }
  });
});

// ── clipLengthForComp / compNeedsTrim ────────────────────────────────────────

describe("clipLengthForComp — the clip is as long as the template", () => {
  it("matches an exactly-supported composition", () => {
    expect(clipLengthForComp(10)).toBe(10);
    expect(clipLengthForComp(12)).toBe(12);
  });

  it("snaps a 7s template up to an 8s clip (AE trims the extra second)", () => {
    expect(clipLengthForComp(7)).toBe(8);
  });

  it("clamps a 3s template up to Seedance's 4s floor", () => {
    expect(clipLengthForComp(3)).toBe(4);
  });

  it("caps a 25s template at 15s (and the comp gets trimmed)", () => {
    expect(clipLengthForComp(25)).toBe(15);
    expect(compNeedsTrim(25)).toBe(true);
  });

  it("falls back to the maximum when the duration is unknown", () => {
    // Better to generate a clip that gets trimmed than one that ends on a freeze.
    expect(clipLengthForComp(null)).toBe(MAX_CLIP_SEC);
    expect(clipLengthForComp(undefined)).toBe(MAX_CLIP_SEC);
    expect(clipLengthForComp(0)).toBe(MAX_CLIP_SEC);
    expect(clipLengthForComp(Number.NaN)).toBe(MAX_CLIP_SEC);
    expect(clipLengthForComp(-5)).toBe(MAX_CLIP_SEC);
  });
});

describe("compNeedsTrim — only when the comp outruns Seedance", () => {
  it("is false at or under the ceiling", () => {
    expect(compNeedsTrim(15)).toBe(false);
    expect(compNeedsTrim(12)).toBe(false);
    expect(compNeedsTrim(15.0000001)).toBe(false); // float slack
  });
  it("is true above it", () => {
    expect(compNeedsTrim(15.5)).toBe(true);
    expect(compNeedsTrim(30)).toBe(true);
  });
  it("is false when unknown", () => {
    expect(compNeedsTrim(null)).toBe(false);
    expect(compNeedsTrim(undefined)).toBe(false);
  });
});

// ── gptImageSizeForSlot ──────────────────────────────────────────────────────

const parse = (s: string): [number, number] => {
  const [w, h] = s.split("x").map(Number);
  return [w as number, h as number];
};

describe("gptImageSizeForSlot — every output must be legal for gpt-image-2", () => {
  const CASES: Array<[number, number]> = [
    [1920, 1080], [1080, 1920], [800, 800], [640, 360],
    [3840, 2160], [180, 60], [1920, 80], [64, 64], [4000, 4000],
  ];

  it("always returns dimensions divisible by 16", () => {
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      expect(ow % 16, `${w}x${h} → width`).toBe(0);
      expect(oh % 16, `${w}x${h} → height`).toBe(0);
    }
  });

  it("never exceeds the 8,294,400px hard ceiling", () => {
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      expect(ow * oh, `${w}x${h}`).toBeLessThanOrEqual(8_294_400);
    }
  });

  it("keeps a slot that already fits, at its native size when that is legal", () => {
    expect(gptImageSizeForSlot(800, 800)).toBe("800x800");
    expect(gptImageSizeForSlot(1280, 720)).toBe("1280x720");
  });

  it("nudges 1080 to 1088, because 1080 is NOT divisible by 16", () => {
    // 1080 / 16 = 67.5. gpt-image-2 physically cannot render 1920x1080 — which
    // is why constants.ts reaches for 2160 and 1440 instead. We round UP and let
    // nx:layer-autoscale `fill` crop the extra 8px rather than letterbox.
    expect(1080 % 16).not.toBe(0);
    expect(gptImageSizeForSlot(1920, 1080)).toBe("1920x1088");
  });

  it("scales an oversized slot down under the soft ceiling", () => {
    const [w, h] = parse(gptImageSizeForSlot(3840, 2160));
    expect(w * h).toBeLessThanOrEqual(2560 * 1440);
    expect(w / h).toBeCloseTo(16 / 9, 1); // aspect survives
  });

  it("lifts an extreme banner off the quality floor without inverting it", () => {
    const [w, h] = parse(gptImageSizeForSlot(1920, 80));
    expect(h).toBeGreaterThanOrEqual(256);
    expect(w).toBeGreaterThan(h); // still landscape
  });

  it("falls back to a legal square when geometry is missing", () => {
    expect(gptImageSizeForSlot(null, null)).toBe(DEFAULT_SLOT_SIZE);
    expect(gptImageSizeForSlot(0, 100)).toBe(DEFAULT_SLOT_SIZE);
    expect(gptImageSizeForSlot(100, Number.NaN)).toBe(DEFAULT_SLOT_SIZE);
    const [w, h] = parse(DEFAULT_SLOT_SIZE);
    expect(w % 16).toBe(0);
    expect(h % 16).toBe(0);
  });
});

describe("slotAspectRatio", () => {
  it("collapses to the only two ratios Seedance accepts", () => {
    expect(slotAspectRatio(1920, 1080)).toBe("16:9");
    expect(slotAspectRatio(1080, 1920)).toBe("9:16");
    expect(slotAspectRatio(1000, 1000)).toBe("16:9"); // square → landscape
  });
  it("is null when the box is unknown", () => {
    expect(slotAspectRatio(null, 1080)).toBeNull();
    expect(slotAspectRatio(1920, 0)).toBeNull();
  });
});

// ── classifyImageSlot ────────────────────────────────────────────────────────

const COMP = { compWidth: 1920, compHeight: 1080 };

describe("classifyImageSlot — a generated photo in a logo layer is always wrong", () => {
  it("names a brand slot by its word, whatever the separator", () => {
    for (const n of ["logo", "LOGO_1", "brand-mark", "Client Logo", "app_icon", "watermark"]) {
      expect(classifyImageSlot({ layerName: n, ...COMP }), n).toBe("brand");
    }
  });

  it("names a decorative slot by its word", () => {
    for (const n of ["bg", "BG_2", "background", "texture-01", "gradient overlay", "vignette"]) {
      expect(classifyImageSlot({ layerName: n, ...COMP }), n).toBe("decorative");
    }
  });

  it("names a content slot by its word", () => {
    for (const n of ["product_shot", "hero photo", "PRODUCT-1", "lifestyle still", "screenshot"]) {
      expect(classifyImageSlot({ layerName: n, ...COMP }), n).toBe("content");
    }
  });

  it("lets brand beat decorative — a 'logo background' is still a logo", () => {
    expect(classifyImageSlot({ layerName: "logo_background", ...COMP })).toBe("brand");
  });

  it("lets decorative beat content — a 'background photo' is still the backdrop", () => {
    expect(classifyImageSlot({ layerName: "background_photo", ...COMP })).toBe("decorative");
  });

  it("does NOT treat the ambiguous words image/img/media as content", () => {
    // "background image" must not classify as content on the word "image".
    expect(classifyImageSlot({ layerName: "background image", ...COMP })).toBe("decorative");
    // A bare `image` name has no signal → geometry / ambiguous.
    expect(
      classifyImageSlot({ layerName: "image_1", width: 800, height: 600, ...COMP }),
    ).toBe("content");
  });

  it("uses geometry for unnamed placeholders: tiny → brand, full-bleed → decorative", () => {
    // 100×40 of a 1920×1080 comp = 0.19% → icon-sized.
    expect(classifyImageSlot({ layerName: "PH_2", width: 100, height: 40, ...COMP })).toBe("brand");
    // Full-bleed backdrop.
    expect(classifyImageSlot({ layerName: "PH_3", width: 1920, height: 1080, ...COMP })).toBe(
      "decorative",
    );
    // A normal mid-size box is content — the plan agent arbitrates from here.
    expect(classifyImageSlot({ layerName: "PH_4", width: 800, height: 600, ...COMP })).toBe(
      "content",
    );
  });

  it("defaults ambiguous-and-geometry-less slots to content, for the LLM to arbitrate", () => {
    expect(classifyImageSlot({ layerName: "Media_3" })).toBe("content");
    expect(classifyImageSlot({ layerName: "PH_1", width: null, height: null })).toBe("content");
  });

  it("lets an explicit name override geometry", () => {
    // Full-bleed, but the designer called it a hero shot.
    expect(
      classifyImageSlot({ layerName: "hero_shot", width: 1920, height: 1080, ...COMP }),
    ).toBe("content");
    // Tiny, but the designer called it a product photo.
    expect(
      classifyImageSlot({ layerName: "product_photo", width: 60, height: 60, ...COMP }),
    ).toBe("content");
  });
});

// ── deriveCharBudget ─────────────────────────────────────────────────────────

describe("deriveCharBudget — the box is the constraint, not the placeholder", () => {
  it("uses the placeholder's own length when that is all we have", () => {
    expect(deriveCharBudget("Your Headline Here")).toBe(18);
  });

  it("takes the larger of the placeholder length and the box estimate", () => {
    // 1200px wide at 72px font ≈ 33 chars, which beats a short placeholder.
    expect(deriveCharBudget("Hi", 1200, 72)).toBe(33);
    // A long placeholder in a narrow box keeps its own length (28 chars).
    const long = "A very long placeholder line";
    expect(deriveCharBudget(long, 200, 72)).toBe(long.length);
  });

  it("falls back to the layer HEIGHT when no font size is exposed", () => {
    // Caught by a live prompt dump, not by a unit test: a 900x60 layer whose
    // placeholder is the single word "Subhead" was being capped at 7 characters.
    // It is not a 7-character slot; it is a 900px box that says "Subhead" today.
    // Nexrender's `data` bag is undocumented, so a missing font size is the
    // COMMON case, and the height is the only signal left.
    expect(deriveCharBudget("Subhead", 900, null, 60)).toBe(37);
    expect(deriveCharBudget("Subhead", 900, null, null)).toBe(7); // nothing to go on
  });

  it("prefers a real font size over the height estimate", () => {
    // 1200 / (72 * 0.5) = 33, not the height-derived 1200 / (96 * 0.5) = 25.
    expect(deriveCharBudget("Hi", 1200, 72, 120)).toBe(33);
  });

  it("errs SHORT on a multi-line box, because short copy always renders", () => {
    // A 3-line box overshoots the inferred font size, under-estimating the
    // budget. Clipped layout is unrecoverable; a shorter line is not.
    const oneLine = deriveCharBudget("x", 900, null, 60) ?? 0;
    const threeLine = deriveCharBudget("x", 900, null, 180) ?? 0;
    expect(threeLine).toBeLessThan(oneLine);
  });

  it("is undefined when there is nothing to go on", () => {
    expect(deriveCharBudget(undefined)).toBeUndefined();
    expect(deriveCharBudget("")).toBeUndefined();
    expect(deriveCharBudget("   ")).toBeUndefined();
  });
});

describe("estimateFontSizeFromBox", () => {
  it("inverts the line-height ratio", () => {
    expect(estimateFontSizeFromBox(60)).toBeCloseTo(48, 0);
  });
  it("is undefined for a missing or degenerate box", () => {
    expect(estimateFontSizeFromBox(null)).toBeUndefined();
    expect(estimateFontSizeFromBox(0)).toBeUndefined();
    expect(estimateFontSizeFromBox(-10)).toBeUndefined();
  });
});
