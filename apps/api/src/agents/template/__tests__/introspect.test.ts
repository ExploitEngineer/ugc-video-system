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
  extType,
  fillableImageSlots,
  fillableVideoSlots,
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
    layer({ composition_id: 1, aeid: 11, name: "Headline", layer_type: "text", source_type: null, width: 1200, height: 120 }),
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

  it("budgets a text slot from the designer's own words, not its 1200px box", () => {
    const h = bySlot("Headline");
    expect(h?.currentText).toBe("Headline");
    // "Headline" is 8 chars → 8 * 1.15 = 9.2 → 9. The box would have said 33,
    // and 33 characters is how the copy ended up off the screen.
    expect(h?.charBudget).toBe(9);
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
  it("reports the composition's own length, which is what the ad runs for", () => {
    const m = buildMetadata(buildStructure([MAIN], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.durationSec).toBe(12);
    expect(m.frameRate).toBe(30);
    expect(m.aspectRatio).toBe("16:9");
  });

  it("does NOT cap or trim a composition longer than the 15s master", () => {
    // The clip is sliced per video slot instead. A 25s template renders 25
    // seconds, its graphics filling whatever the footage does not cover.
    const long = comp({ aeid: 1, name: "main", width: 1080, height: 1920, duration: 25 });
    const m = buildMetadata(buildStructure([long], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.durationSec).toBe(25);
    expect(m.aspectRatio).toBe("9:16");
    expect(m).not.toHaveProperty("clipSeconds");
    expect(m).not.toHaveProperty("trimComp");
  });

  it("tolerates a composition that reports no duration", () => {
    const noDur = comp({ aeid: 1, name: "main", width: 1920, height: 1080 });
    const m = buildMetadata(buildStructure([noDur], [layer({ composition_id: 1, aeid: 1, name: "c.mp4" })]));
    expect(m.durationSec).toBeNull();
  });
});

// ── the empty placeholder comp: why the first real render had no video ───────

describe("buildStructure — an EMPTY placeholder composition", () => {
  // `Final → Scene_1 → PH_1`, where `PH_1` is an empty 60s comp. This is what a
  // real designer ships: you are meant to drop your own footage into it.
  const comps = [
    comp({ aeid: 1, name: "Final", width: 1920, height: 1080, duration: 12 }),
    comp({ aeid: 2, name: "Scene_1", width: 1920, height: 1080, duration: 60 }),
    comp({ aeid: 3, name: "PH_1", width: 1920, height: 1080, duration: 60 }),
  ];
  const layers = [
    layer({ composition_id: 1, aeid: 10, name: "Scene_1", source_type: "comp", source_comp_id: 2, in_point: 0, out_point: 2.167, start_time: 0 }),
    // The outer layer's BOX is smaller than its source: the designer scaled it.
    layer({ composition_id: 2, aeid: 11, name: "PH_1", source_type: "comp", source_comp_id: 3, width: 640, height: 360, in_point: 0, out_point: 60, start_time: 0 }),
    // PH_1 (aeid 3) has NO layers at all.
  ];
  const video = buildStructure(comps, layers).slots.find((s) => s.asset === "VIDEO");

  it("targets the OUTER layer, in the comp that places it", () => {
    // There is no layer inside `PH_1` to replace. Nexrender's ExtendScript calls
    // `layer.replaceSource(theImport, true)` with no guard on the old source
    // type, so the `av/comp` layer itself is a legal target.
    expect(video).toMatchObject({
      composition: "Scene_1",
      jobLayerName: "PH_1",
      layerName: "PH_1",
    });
  });

  it("addresses an UNNAMED placeholder by stacking index, never by name", () => {
    // `PH_1` is the name of the layer's SOURCE. The layer itself is unnamed, and
    // Nexrender matches stored names — aiming a media asset at `PH_1` fails with
    // "Couldn't find any layers by provided name (PH_1)".
    const aep = { "11": { index: 2, name: "", composition: "Scene_1" } };
    const slot = buildStructure(comps, layers, aep).slots.find((s) => s.asset === "VIDEO");
    expect(slot).toMatchObject({ targetBy: "index", layerIndex: 2 });
  });

  it("addresses a placeholder the designer DID name by name", () => {
    const aep = { "11": { index: 2, name: "Hero Footage", composition: "Scene_1" } };
    const slot = buildStructure(comps, layers, aep).slots.find((s) => s.asset === "VIDEO");
    expect(slot).toMatchObject({ targetBy: "name", layerIndex: 2 });
  });

  it("falls back to name targeting when the project could not be parsed", () => {
    expect(video).toMatchObject({ targetBy: "name", layerIndex: null });
  });

  it("sizes the slot to the placeholder comp, not the outer layer's box", () => {
    // `replaceSource` keeps the layer's authored transform, and an index-targeted
    // layer cannot be autoscaled — so the footage must arrive at the size the
    // original source had.
    expect(video).toMatchObject({ width: 1920, height: 1080 });
  });

  it("emits the slot as fillable rather than skipping it", () => {
    // The bug: the slot existed, was marked `empty`, and the render step dropped
    // it — so the job carried zero video assets and the ad had no footage.
    expect(fillableVideoSlots(buildStructure(comps, layers).slots)).toHaveLength(1);
  });

  it("takes the slot's length from the scene, not the placeholder's 60s", () => {
    expect(video?.startSec).toBe(0);
    expect(video?.durationSec).toBe(2.167);
  });
});

// ── a placeholder comp that holds TEXT, not footage ──────────────────────────

describe("buildStructure — a placeholder comp whose only layer is TEXT", () => {
  // Transcribed from the real `water-template`: `Placeholder _Text` is a comp
  // holding one text layer, `'placeholder '`. Its NAME matches `isPlaceholder`,
  // so v1 followed it in, found no media layer, fell back to `inner[0]` (the
  // text layer) and emitted a VIDEO slot pointing at it. Nexrender then called
  // `replaceSource` on a text layer and After Effects died:
  //
  //   Error: After Effects error: layer does not have a source.
  const comps = [
    comp({ aeid: 1, name: "main", width: 1920, height: 1080, duration: 12 }),
    comp({ aeid: 2, name: "Placeholder _Text", width: 1920, height: 1080, duration: 12 }),
  ];
  const layers = [
    layer({ composition_id: 1, aeid: 10, name: "Placeholder _Text", source_type: "comp", source_comp_id: 2, in_point: 0, out_point: 3, start_time: 0 }),
    layer({ composition_id: 2, aeid: 11, name: "placeholder ", layer_type: "text", source_type: null, width: 882, height: 88 }),
  ];
  const slots = buildStructure(comps, layers).slots;

  it("emits NO video slot — a text layer has no source to replace", () => {
    expect(slots.filter((s) => s.asset === "VIDEO")).toHaveLength(0);
  });

  it("still emits the text layer's own TEXT slot", () => {
    // The text branch already claimed this layer. The placeholder branch was
    // claiming it a SECOND time, so one layer carried two slots.
    const text = slots.filter((s) => s.asset === "TEXT");
    expect(text).toHaveLength(1);
    // Never trim: After Effects stores the trailing space, and Nexrender's
    // `nx:text-params-set` matches the stored name exactly.
    expect(text[0]).toMatchObject({
      composition: "Placeholder _Text",
      jobLayerName: "placeholder ",
    });
  });

  it("a placeholder comp holding real footage is still a VIDEO slot", () => {
    const withMedia = [
      layers[0],
      layer({ composition_id: 2, aeid: 12, name: "b-roll.mp4", width: 1920, height: 1080 }),
    ];
    const found = buildStructure(comps, withMedia).slots.filter(
      (s) => s.asset === "VIDEO",
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ jobLayerName: "b-roll.mp4" });
  });

  it("a placeholder comp holding a shape layer is not a media slot either", () => {
    const shapeOnly = [
      layers[0],
      layer({ composition_id: 2, aeid: 13, name: "Shape Layer 1", layer_type: "shape", source_type: null }),
    ];
    expect(
      buildStructure(comps, shapeOnly).slots.filter((s) => s.asset === "VIDEO"),
    ).toHaveLength(0);
  });
});

describe("buildStructure — a VIDEO slot's own window", () => {
  it("reads through the nesting chain, and orders the slots by time", () => {
    const comps = [
      comp({ aeid: 1, name: "Final", width: 1920, height: 1080, duration: 12 }),
      comp({ aeid: 2, name: "Scene_A", width: 1920, height: 1080, duration: 60 }),
      comp({ aeid: 3, name: "Scene_B", width: 1920, height: 1080, duration: 60 }),
      comp({ aeid: 4, name: "PH_LATE", width: 1920, height: 1080, duration: 60 }),
      comp({ aeid: 5, name: "PH_EARLY", width: 1920, height: 1080, duration: 60 }),
    ];
    // Declared LATE-first, to prove layer-list order is not time order.
    const layers = [
      layer({ composition_id: 1, aeid: 10, name: "Scene_A", source_type: "comp", source_comp_id: 2, in_point: 5, out_point: 9, start_time: 5 }),
      layer({ composition_id: 2, aeid: 11, name: "PH_LATE", source_type: "comp", source_comp_id: 4, in_point: 0, out_point: 60, start_time: 0 }),
      layer({ composition_id: 1, aeid: 12, name: "Scene_B", source_type: "comp", source_comp_id: 3, in_point: 0, out_point: 5, start_time: 0 }),
      layer({ composition_id: 3, aeid: 13, name: "PH_EARLY", source_type: "comp", source_comp_id: 5, in_point: 0, out_point: 60, start_time: 0 }),
    ];
    const videos = buildStructure(comps, layers).slots.filter((s) => s.asset === "VIDEO");
    expect(videos.map((s) => s.jobLayerName)).toEqual(["PH_EARLY", "PH_LATE"]);
    expect(videos.map((s) => s.startSec)).toEqual([0, 5]);
    expect(videos.map((s) => s.durationSec)).toEqual([5, 4]);
  });

  it("still targets the inner layer when the placeholder holds footage", () => {
    const comps = [MAIN, comp({ aeid: 2, name: "PH_1_comp", width: 640, height: 360, duration: 60 })];
    const layers = [
      layer({ composition_id: 1, aeid: 10, name: "PH_1", source_type: "comp", source_comp_id: 2, in_point: 1, out_point: 4, start_time: 1 }),
      layer({ composition_id: 2, aeid: 11, name: "clip.mp4", in_point: 0, out_point: 60 }),
    ];
    // The INNER layer's own index decides how it is addressed, not the outer's.
    const aep = { "11": { index: 1, name: "", composition: "PH_1_comp" } };
    const video = buildStructure(comps, layers, aep).slots.find((s) => s.asset === "VIDEO");
    expect(video).toMatchObject({
      composition: "PH_1_comp",
      jobLayerName: "clip.mp4",
      targetBy: "index",
      layerIndex: 1,
      startSec: 1,
      durationSec: 3,
    });
  });

  it("leaves a layer with no time fields unresolved rather than guessing", () => {
    const s = buildStructure([MAIN], [layer({ composition_id: 1, aeid: 1, name: "clip.mp4" })]);
    expect(s.slots[0]).toMatchObject({ asset: "VIDEO", startSec: null, durationSec: null });
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
