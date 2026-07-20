import { describe, it, expect } from "vitest";

import {
  classifyImageSlot,
  deriveCharBudget,
  DEFAULT_SLOT_SIZE,
  MASTER_CLIP_SECONDS,
  estimateFontSizeFromBox,
  gptImageSizeForSlot,
  MAX_CLIP_SEC,
  MIN_CLIP_SEC,
  planFootageSegments,
  SEEDANCE_DURATIONS,
  slotAspectRatio,
  snapUp,
} from "../geometry.js";
import {
  GPT_IMAGE_MAX_EDGE,
  GPT_IMAGE_MIN_TOTAL_PX,
} from "../../../providers/openai/constants.js";

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

// ── the master clip length ───────────────────────────────────────────────────

describe("planFootageSegments — split the full footage into ≤15s Seedance clips", () => {
  const total = (segs: { durationSec: number }[]) =>
    segs.reduce((a, s) => a + s.durationSec, 0);

  it("returns ONE clip for a ≤15s template (no merge)", () => {
    expect(planFootageSegments(8)).toEqual([{ startSec: 0, durationSec: 8 }]);
    expect(planFootageSegments(12)).toEqual([{ startSec: 0, durationSec: 12 }]);
    expect(planFootageSegments(15)).toEqual([{ startSec: 0, durationSec: 15 }]);
  });

  it("splits a >15s template into equal contiguous ≤15s clips", () => {
    // 22.79 → two 12s clips (24s master, AE trims the surplus).
    expect(planFootageSegments(22.79)).toEqual([
      { startSec: 0, durationSec: 12 },
      { startSec: 12, durationSec: 12 },
    ]);
    expect(planFootageSegments(30)).toEqual([
      { startSec: 0, durationSec: 15 },
      { startSec: 15, durationSec: 15 },
    ]);
    // 40 → three 15s clips (45s master, cropped to 40 downstream).
    expect(planFootageSegments(40)).toEqual([
      { startSec: 0, durationSec: 15 },
      { startSec: 15, durationSec: 15 },
      { startSec: 30, durationSec: 15 },
    ]);
    // 60 (the cap) → four 15s clips.
    expect(planFootageSegments(60)).toEqual([
      { startSec: 0, durationSec: 15 },
      { startSec: 15, durationSec: 15 },
      { startSec: 30, durationSec: 15 },
      { startSec: 45, durationSec: 15 },
    ]);
  });

  it("clamps past the max template length", () => {
    // Anything beyond MAX_TEMPLATE_SEC (60) is clamped to it → four 15s clips.
    expect(planFootageSegments(90)).toEqual(planFootageSegments(60));
  });

  it("every segment is a legal Seedance duration and ≤15s", () => {
    for (let d = MIN_CLIP_SEC; d <= 60; d += 0.37) {
      for (const s of planFootageSegments(d)) {
        expect(s.durationSec).toBeLessThanOrEqual(MAX_CLIP_SEC);
        expect(SEEDANCE_DURATIONS).toContain(s.durationSec as never);
      }
    }
  });

  it("is contiguous and covers at least the requested length", () => {
    for (const d of [8, 16, 19, 22.79, 27, 30, 40, 45, 60]) {
      const segs = planFootageSegments(d);
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i]!.startSec).toBeCloseTo(
          segs[i - 1]!.startSec + segs[i - 1]!.durationSec,
          5,
        );
      }
      expect(total(segs)).toBeGreaterThanOrEqual(Math.min(d, 60) - 1e-6);
    }
  });
});

describe("MASTER_CLIP_SECONDS", () => {
  it("is a fixed 15s, whatever the template looks like", () => {
    // The clip is NOT cut to the composition's duration. It is sliced per video
    // slot instead (see slices.ts), so the composition keeps its full runtime
    // and every ad is built from the same amount of footage.
    expect(MASTER_CLIP_SECONDS).toBe(15);
    expect(MASTER_CLIP_SECONDS).toBe(MAX_CLIP_SEC);
    expect(SEEDANCE_DURATIONS).toContain(MASTER_CLIP_SECONDS as never);
  });
});

// ── gptImageSizeForSlot ──────────────────────────────────────────────────────

const parse = (s: string): [number, number] => {
  const [w, h] = s.split("x").map(Number);
  return [w as number, h as number];
};

describe("gptImageSizeForSlot — every output must be legal for gpt-image-2", () => {
  // Every constraint below was probed against the LIVE API, not read from docs.
  const CASES: Array<[number, number]> = [
    [1920, 1080], [1080, 1920], [800, 800], [640, 360],
    [3840, 2160], [180, 60], [1920, 80], [64, 64], [4000, 4000],
    [640, 368], [1200, 120], [500, 1000],
  ];

  it("always returns dimensions divisible by 16", () => {
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      expect(ow % 16, `${w}x${h} → width`).toBe(0);
      expect(oh % 16, `${w}x${h} → height`).toBe(0);
    }
  });

  it("never exceeds the 8,294,400px ceiling, nor a 3840px longest edge", () => {
    // API: "The longest edge must be less than or equal to 3840."
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      expect(ow * oh, `${w}x${h}`).toBeLessThanOrEqual(8_294_400);
      expect(Math.max(ow, oh), `${w}x${h}`).toBeLessThanOrEqual(GPT_IMAGE_MAX_EDGE);
    }
  });

  it("NEVER falls under the minimum pixel budget", () => {
    // API: "Requested resolution is below the current minimum pixel budget."
    // Probed live: 800x800 (640,000px) is REFUSED; 832x832 (692,224px) passes.
    // Requesting a slot at its native size would 400 for most real slots.
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      expect(ow * oh, `${w}x${h} → ${ow}x${oh}`).toBeGreaterThanOrEqual(
        GPT_IMAGE_MIN_TOTAL_PX,
      );
    }
  });

  it("scales a small slot UP rather than requesting a size the API refuses", () => {
    // 800x800 = 640,000px → a hard 400. Must come back larger, still square.
    const [w, h] = parse(gptImageSizeForSlot(800, 800));
    expect(w * h).toBeGreaterThanOrEqual(GPT_IMAGE_MIN_TOTAL_PX);
    expect(w).toBe(h);
    // 640x368 is even smaller; it must also be lifted, keeping ~16:9.
    const [bw, bh] = parse(gptImageSizeForSlot(640, 368));
    expect(bw * bh).toBeGreaterThanOrEqual(GPT_IMAGE_MIN_TOTAL_PX);
    expect(bw / bh).toBeCloseTo(640 / 368, 1);
  });

  it("keeps a slot that already sits in the legal band", () => {
    expect(gptImageSizeForSlot(1280, 720)).toBe("1280x720"); // 921,600px
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

  it("never asks for an aspect wider than 3:1", () => {
    // API: "The maximum supported aspect ratio is 3:1." A 4:1 request is a hard
    // 400, so an extreme layer's aspect must be clamped — `nx:layer-autoscale
    // fill` crops the still into the layer, so a clamped source loses edges,
    // not content.
    for (const [w, h] of CASES) {
      const [ow, oh] = parse(gptImageSizeForSlot(w, h));
      const ar = Math.max(ow / oh, oh / ow);
      expect(ar, `${w}x${h} → ${ow}x${oh}`).toBeLessThanOrEqual(3.0001);
    }
  });

  it("clamps an extreme banner without inverting it", () => {
    const [w, h] = parse(gptImageSizeForSlot(1920, 80)); // 24:1
    expect(w * h).toBeGreaterThanOrEqual(GPT_IMAGE_MIN_TOTAL_PX);
    expect(w).toBeGreaterThan(h); // still landscape
    expect(w / h).toBeCloseTo(3, 2);
  });

  it("clamps an extreme vertical rail the same way", () => {
    const [w, h] = parse(gptImageSizeForSlot(80, 1920)); // 1:24
    expect(h).toBeGreaterThan(w); // still portrait
    expect(h / w).toBeCloseTo(3, 2);
  });

  it("falls back to a legal square when geometry is missing", () => {
    expect(gptImageSizeForSlot(null, null)).toBe(DEFAULT_SLOT_SIZE);
    expect(gptImageSizeForSlot(0, 100)).toBe(DEFAULT_SLOT_SIZE);
    expect(gptImageSizeForSlot(100, Number.NaN)).toBe(DEFAULT_SLOT_SIZE);
    const [w, h] = parse(DEFAULT_SLOT_SIZE);
    expect(w % 16).toBe(0);
    expect(h % 16).toBe(0);
    expect(w * h).toBeGreaterThanOrEqual(GPT_IMAGE_MIN_TOTAL_PX);
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

describe("deriveCharBudget — the placeholder is the ceiling, not the box", () => {
  it("gives the designer's own words a little slack, and no more", () => {
    // "Your Headline Here" is 18 chars → 18 * 1.15 = 20.7 → 21.
    expect(deriveCharBudget("Your Headline Here")).toBe(21);
  });

  it("IGNORES a box that claims a split-text layer holds a sentence", () => {
    // The bug this function exists to prevent. `BOLD` is four glyphs; its layer
    // reports a 1040x71 box because the animation spreads the letters across
    // the frame. The old width/font estimate said 36 characters, the copywriter
    // wrote "This watch just became my daily." and it ran off the screen.
    expect(deriveCharBudget("BOLD", 1040.16, 71.26)).toBe(5);
    expect(deriveCharBudget("OPENER", 388.3, 424.89)).toBe(7);
    expect(deriveCharBudget("MIXKIT", 358.9, 68.23)).toBe(7);
  });

  it("never returns a budget too small for a word", () => {
    expect(deriveCharBudget("Hi", 1200)).toBe(3);
    expect(deriveCharBudget("!")).toBe(3);
  });

  it("falls back to the box ONLY when the placeholder is blank", () => {
    // Nothing else to go on: 900 / (48 * 0.5) = 37.
    expect(deriveCharBudget("   ", 900, 60)).toBe(37);
    expect(deriveCharBudget("", 900, 60)).toBe(37);
  });

  it("errs SHORT on a multi-line blank box, because short copy always renders", () => {
    // A 3-line box overshoots the inferred font size, under-estimating the
    // budget. Clipped layout is unrecoverable; a shorter line is not.
    const oneLine = deriveCharBudget("", 900, 60) ?? 0;
    const threeLine = deriveCharBudget("", 900, 180) ?? 0;
    expect(threeLine).toBeLessThan(oneLine);
  });

  it("is undefined when there is nothing to go on", () => {
    expect(deriveCharBudget(undefined)).toBeUndefined();
    expect(deriveCharBudget("")).toBeUndefined();
    expect(deriveCharBudget("   ")).toBeUndefined();
    expect(deriveCharBudget("", 900, null)).toBeUndefined();
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
