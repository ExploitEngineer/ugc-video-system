import { describe, it, expect } from "vitest";

import type {
  NexComposition,
  NexLayer,
} from "../../../providers/template-render.js";
import {
  buildMetadata,
  buildStructure,
  classifyPlaceholderSlot,
  countSlots,
  deriveAspectRatio,
  detectMainComposition,
  extractFont,
  extractFontSize,
  extType,
  fillableImageSlots,
} from "../introspect.js";

// Fixture helpers — only the fields the classifier reads.
const comp = (o: Partial<NexComposition> & { aeid: number; name: string }): NexComposition => o;
const layer = (o: Partial<NexLayer> & { composition_id: number; aeid: number; name: string }): NexLayer => ({
  layer_type: "av",
  source_type: "file",
  source_comp_id: null,
  ...o,
});

const MAIN = comp({ aeid: 1, name: "main", width: 1920, height: 1080, duration: 12, frame_rate: 30 });

// ── extType ──────────────────────────────────────────────────────────────────

describe("extType", () => {
  it("reads the media family off the filename", () => {
    expect(extType("clip.mp4")).toBe("VIDEO");
    expect(extType("shot.JPG")).toBe("IMAGE");
    expect(extType("music.wav")).toBe("AUDIO");
    expect(extType("Headline")).toBeNull();
  });
});

// ── classifyPlaceholderSlot — the v1 bug ─────────────────────────────────────

describe("classifyPlaceholderSlot — v1 assumed VIDEO for every placeholder", () => {
  const outer = layer({ composition_id: 1, aeid: 9, name: "PH_1", source_type: "comp", source_comp_id: 2 });

  it("trusts the inner layer's real filename above everything", () => {
    const still = layer({ composition_id: 2, aeid: 20, name: "hero.jpg" });
    const clip = layer({ composition_id: 2, aeid: 20, name: "b-roll.mp4" });
    expect(classifyPlaceholderSlot(outer, still)).toBe("IMAGE");
    expect(classifyPlaceholderSlot(outer, clip)).toBe("VIDEO");
  });

  it("an image filename wins even when the OUTER name says video", () => {
    // This is the exact regression: `PH_VIDEO_1` wrapping `logo.png`.
    const videoish = layer({ composition_id: 1, aeid: 9, name: "PH_VIDEO_1", source_type: "comp", source_comp_id: 2 });
    const still = layer({ composition_id: 2, aeid: 20, name: "logo.png" });
    expect(classifyPlaceholderSlot(videoish, still)).toBe("IMAGE");
  });

  it("falls back to names when the inner layer is a solid", () => {
    const solid = layer({ composition_id: 2, aeid: 20, name: "Placeholder Solid", source_type: "solid" });
    const imgOuter = layer({ composition_id: 1, aeid: 9, name: "PH_IMAGE_2", source_type: "comp", source_comp_id: 2 });
    const vidOuter = layer({ composition_id: 1, aeid: 9, name: "PH_CLIP_2", source_type: "comp", source_comp_id: 2 });
    expect(classifyPlaceholderSlot(imgOuter, solid)).toBe("IMAGE");
    expect(classifyPlaceholderSlot(vidOuter, solid)).toBe("VIDEO");
  });

  it("matches words separated by underscores, not just spaces", () => {
    // `_` is a word character, so a naive /\bimage\b/ never matches `PH_IMAGE_2`
    // and every name silently falls through to the VIDEO default.
    const solid = layer({ composition_id: 2, aeid: 20, name: "Solid 1", source_type: "solid" });
    for (const n of ["PH_IMAGE_2", "ph-image-2", "PH.IMAGE.2", "your_photo_here"]) {
      const outer = layer({ composition_id: 1, aeid: 9, name: n, source_type: "comp", source_comp_id: 2 });
      expect(classifyPlaceholderSlot(outer, solid), n).toBe("IMAGE");
    }
    for (const n of ["PH_CLIP_2", "bg-video-1", "MAIN.FOOTAGE"]) {
      const outer = layer({ composition_id: 1, aeid: 9, name: n, source_type: "comp", source_comp_id: 2 });
      expect(classifyPlaceholderSlot(outer, solid), n).toBe("VIDEO");
    }
  });

  it("defaults to VIDEO when nothing disambiguates", () => {
    // A template must have a video slot to be usable, so an unclassifiable
    // placeholder is more likely the hero clip than a still.
    expect(classifyPlaceholderSlot(outer, undefined)).toBe("VIDEO");
  });
});

// ── buildStructure ───────────────────────────────────────────────────────────

describe("buildStructure — slot discovery, geometry and classification", () => {
  const comps = [MAIN, comp({ aeid: 2, name: "PH_1_comp", width: 640, height: 360 })];
  const layers = [
    layer({ composition_id: 1, aeid: 10, name: "your-clip.mp4", width: 1920, height: 1080 }),
    layer({ composition_id: 1, aeid: 11, name: "Headline", layer_type: "text", source_type: null, width: 1200, height: 120, data: { font: "Montserrat-SemiBold", fontSize: 72 } }),
    layer({ composition_id: 1, aeid: 13, name: "logo.png", width: 180, height: 60 }),
    layer({ composition_id: 1, aeid: 14, name: "background.jpg", width: 1920, height: 1080 }),
    layer({ composition_id: 1, aeid: 15, name: "product-photo.jpg", width: 800, height: 800 }),
    layer({ composition_id: 1, aeid: 16, name: "PH_1", source_type: "comp", source_comp_id: 2, width: 640, height: 360 }),
    layer({ composition_id: 2, aeid: 20, name: "hero-shot.jpg", width: 640, height: 360 }),
    layer({ composition_id: 1, aeid: 30, name: "Guide", layer_type: "shape", source_type: null }),
  ];
  const s = buildStructure(comps, layers);
  const bySlot = (job: string) => s.slots.find((x) => x.jobLayerName === job);

  it("picks the root composition and captures its duration + frame rate", () => {
    expect(s.mainComposition).toBe("main");
    expect(s.mainCompositionDurationSec).toBe(12);
    expect(s.mainCompositionFrameRate).toBe(30);
    expect(s.suggestedAspectRatio).toBe("16:9");
  });

  it("finds exactly one VIDEO slot", () => {
    const videos = s.slots.filter((x) => x.asset === "VIDEO");
    expect(videos).toHaveLength(1);
    expect(videos[0]?.jobLayerName).toBe("your-clip.mp4");
  });

  it("captures each layer's geometry instead of discarding it", () => {
    expect(bySlot("product-photo.jpg")).toMatchObject({ width: 800, height: 800 });
    expect(bySlot("Headline")).toMatchObject({ width: 1200, height: 120 });
  });

  it("classifies image slots so a logo never receives a generated photo", () => {
    expect(bySlot("logo.png")?.imageClass).toBe("brand");
    expect(bySlot("background.jpg")?.imageClass).toBe("decorative");
    expect(bySlot("product-photo.jpg")?.imageClass).toBe("content");
  });

  it("reads a placeholder precomp holding a STILL as an IMAGE slot", () => {
    // v1 called this VIDEO and injected the generated clip into it.
    const ph = bySlot("hero-shot.jpg");
    expect(ph?.asset).toBe("IMAGE");
    expect(ph?.imageClass).toBe("content");
    // Geometry comes from the OUTER placeholder box laid out in the main comp.
    expect(ph).toMatchObject({ width: 640, height: 360 });
  });

  it("derives a char budget and a font for text slots", () => {
    const h = bySlot("Headline");
    expect(h?.currentText).toBe("Headline");
    expect(h?.font).toBe("Montserrat-SemiBold");
    // 1200px / (72 * 0.5) = 33 chars, which beats the 8-char placeholder.
    expect(h?.charBudget).toBe(33);
  });

  it("ignores structure layers rather than dropping them silently", () => {
    expect(s.ignored?.shape).toBe(1);
  });

  it("classifies a placeholder on BOTH names — the intent sits on the outer one", () => {
    // `logo_placeholder` wrapping a meaningless `Solid 1` must still read as
    // brand. Classifying on the inner name alone falls through to geometry, and
    // a large logo box would then be filled with a generated photo.
    const comps2 = [MAIN, comp({ aeid: 3, name: "logo_comp", width: 900, height: 500 })];
    const layers2 = [
      layer({ composition_id: 1, aeid: 10, name: "clip.mp4", width: 1920, height: 1080 }),
      layer({ composition_id: 1, aeid: 40, name: "logo_placeholder", source_type: "comp", source_comp_id: 3, width: 900, height: 500 }),
      layer({ composition_id: 3, aeid: 41, name: "Solid 1", source_type: "solid" }),
    ];
    const s2 = buildStructure(comps2, layers2);
    const slot = s2.slots.find((x) => x.asset === "IMAGE");
    expect(slot?.imageClass).toBe("brand");
    expect(fillableImageSlots(s2.slots)).toHaveLength(0);
  });

  it("counts slots, and only content images are fillable", () => {
    expect(countSlots(s.slots)).toEqual({ video: 1, image: 4, text: 1, audio: 0 });
    const fillable = fillableImageSlots(s.slots);
    expect(fillable.map((x) => x.jobLayerName).sort()).toEqual([
      "hero-shot.jpg",
      "product-photo.jpg",
    ]);
  });
});

// ── buildMetadata ────────────────────────────────────────────────────────────

describe("buildMetadata — the surface the picker + run gate read", () => {
  it("derives clipSeconds from the composition, not a hardcoded 15s", () => {
    const m = buildMetadata(buildStructure([MAIN], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.clipSeconds).toBe(12);
    expect(m.trimComp).toBe(false);
    expect(m.durationSec).toBe(12);
    expect(m.frameRate).toBe(30);
    expect(m.aspectRatio).toBe("16:9");
  });

  it("caps a long composition and flags it for trimming", () => {
    const long = comp({ aeid: 1, name: "main", width: 1080, height: 1920, duration: 25 });
    const m = buildMetadata(buildStructure([long], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.clipSeconds).toBe(15);
    expect(m.trimComp).toBe(true);
    expect(m.aspectRatio).toBe("9:16");
  });

  it("falls back to 15s when the composition reports no duration", () => {
    const noDur = comp({ aeid: 1, name: "main", width: 1920, height: 1080 });
    const m = buildMetadata(buildStructure([noDur], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.clipSeconds).toBe(15);
    expect(m.trimComp).toBe(false);
  });
});

// ── the opaque `data` bag ────────────────────────────────────────────────────

describe("extractFont / extractFontSize — the undocumented data bag", () => {
  it("probes the shapes a parser plausibly emits", () => {
    expect(extractFont({ font: "Inter" })).toBe("Inter");
    expect(extractFont({ fontFamily: "Inter" })).toBe("Inter");
    expect(extractFont({ text: { font: "Inter" } })).toBe("Inter");
    expect(extractFont({ style: { fontFamily: "Inter" } })).toBe("Inter");
    expect(extractFontSize({ fontSize: 48 })).toBe(48);
    expect(extractFontSize({ text: { fontSize: "48" } })).toBe(48);
  });

  it("returns undefined rather than guessing", () => {
    expect(extractFont(undefined)).toBeUndefined();
    expect(extractFont({})).toBeUndefined();
    expect(extractFont({ font: "   " })).toBeUndefined();
    expect(extractFont({ font: 42 as unknown as string })).toBeUndefined();
    expect(extractFontSize({ fontSize: 0 })).toBeUndefined();
    expect(extractFontSize({ fontSize: -3 })).toBeUndefined();
  });
});

// ── unchanged behaviour, re-pinned ───────────────────────────────────────────

describe("deriveAspectRatio / detectMainComposition", () => {
  it("splits landscape from portrait", () => {
    expect(deriveAspectRatio(1920, 1080)).toBe("16:9");
    expect(deriveAspectRatio(1080, 1920)).toBe("9:16");
    expect(deriveAspectRatio(null, 1080)).toBeNull();
  });

  it("prefers a root comp nobody nests, by name then by area", () => {
    const a = comp({ aeid: 1, name: "final", width: 1920, height: 1080 });
    const b = comp({ aeid: 2, name: "nested", width: 3840, height: 2160 });
    const ls = [layer({ composition_id: 1, aeid: 5, name: "x", source_type: "comp", source_comp_id: 2 })];
    expect(detectMainComposition([a, b], ls)?.name).toBe("final");
  });
});
