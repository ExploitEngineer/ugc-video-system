import { describe, it, expect } from "vitest";

import type { RunTemplate, TemplateSlot } from "@ugc/shared";

import { buildRenderJobBody } from "../../../providers/nexrender/index.js";
import { buildRenderInput } from "../render-input.js";

const slot = (o: Partial<TemplateSlot> & Pick<TemplateSlot, "asset" | "jobLayerName">): TemplateSlot =>
  ({
    composition: "main",
    layerName: o.jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    durationSec: null,
    ...o,
  }) as TemplateSlot;

const template = (
  slots: TemplateSlot[],
  meta: Partial<RunTemplate["metadata"]> = {},
): RunTemplate => ({
  templateId: "11111111-1111-4111-8111-111111111111",
  nexrenderTemplateId: "01JTGM9GCR71JV7EJYDF45QAFD",
  mainComposition: "main",
  renderCompositions: ["main"],
  slots,
  compositionWidth: 1920,
  compositionHeight: 1080,
  displayName: "Clean Frame",
  metadata: {
    durationSec: 12,
    frameRate: 30,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    slotCounts: { video: 1, image: 0, text: 0, audio: 0 },
    ...meta,
  },
});

const CLIP = "https://cdn/clip.mp4";
const build = (t: RunTemplate, over: Partial<Parameters<typeof buildRenderInput>[0]> = {}) =>
  buildRenderInput({
    runId: "run-1",
    template: t,
    textFill: [],
    imageUrls: new Map(),
    clipUrls: new Map(),
    masterClipUrl: CLIP,
    ...over,
  });

// ── ordering: the invisible, load-bearing contract ───────────────────────────

describe("buildRenderInput — autoscale MUST follow its media asset", () => {
  it("emits media, then its autoscale, for the video slot", () => {
    const input = build(template([slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })]));
    expect(input.assets.map((a) => a.kind)).toEqual(["media", "autoscale"]);
    // Nexrender applies assets in array order. An autoscale placed FIRST would
    // scale the placeholder that is about to be replaced, and the real source
    // would land at the wrong size — a silent, visual-only failure.
    expect(input.assets[1]).toMatchObject({
      kind: "autoscale",
      layerName: "clip.mp4",
      fit: "fill",
    });
  });

  it("pairs every media asset with its OWN autoscale, in order", () => {
    const input = build(
      template([
        slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
        slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" }),
      ]),
      { imageUrls: new Map([["hero.jpg", "https://cdn/hero.png"]]) },
    );
    expect(input.assets.map((a) => [a.kind, "layerName" in a ? a.layerName : ""])).toEqual([
      ["media", "clip.mp4"],
      ["autoscale", "clip.mp4"],
      ["media", "hero.jpg"],
      ["autoscale", "hero.jpg"],
    ]);
  });

  it("always fills rather than fits — cropped edges beat black bars", () => {
    const input = build(template([slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })]));
    const scale = input.assets.find((a) => a.kind === "autoscale");
    expect(scale).toMatchObject({ fit: "fill" });
  });
});

// ── what gets injected ───────────────────────────────────────────────────────

describe("buildRenderInput — slot filling", () => {
  it("omits an image slot that was never generated, keeping the template's art", () => {
    const input = build(
      template([
        slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
        slot({ asset: "IMAGE", jobLayerName: "logo.png", imageClass: "brand" }),
        slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" }),
      ]),
      { imageUrls: new Map([["hero.jpg", "https://cdn/hero.png"]]) },
    );
    const layers = input.assets.map((a) => ("layerName" in a ? a.layerName : ""));
    expect(layers).not.toContain("logo.png");
    expect(layers).toContain("hero.jpg");
  });

  it("skips an EMPTY video placeholder — there is no layer to target", () => {
    const input = build(
      template([slot({ asset: "VIDEO", jobLayerName: "PH_1", empty: true })]),
    );
    expect(input.assets).toHaveLength(0);
  });

  it("falls back to the placeholder rather than rendering a blank text layer", () => {
    const input = build(
      template([
        slot({ asset: "TEXT", jobLayerName: "Headline", currentText: "Your Headline" }),
        slot({ asset: "TEXT", jobLayerName: "Subhead", currentText: "Your Subhead" }),
      ]),
      { textFill: [{ jobLayerName: "Headline", value: "Brew calm" }] },
    );
    expect(input.assets).toEqual([
      { kind: "text", composition: "main", layerName: "Headline", value: "Brew calm" },
      { kind: "text", composition: "main", layerName: "Subhead", value: "Your Subhead" },
    ]);
  });

  it("treats a whitespace-only fill as missing", () => {
    const input = build(
      template([slot({ asset: "TEXT", jobLayerName: "Headline", currentText: "Placeholder" })]),
      { textFill: [{ jobLayerName: "Headline", value: "   " }] },
    );
    expect(input.assets[0]).toMatchObject({ value: "Placeholder" });
  });

  it("leaves AUDIO slots alone — the template keeps its own track", () => {
    const input = build(template([slot({ asset: "AUDIO", jobLayerName: "music.mp3" })]));
    expect(input.assets).toHaveLength(0);
  });

  it("targets the slot's OWN composition, not always the main one", () => {
    const input = build(
      template([
        slot({ asset: "IMAGE", jobLayerName: "hero.jpg", composition: "PH_1_comp", imageClass: "content" }),
      ]),
      { imageUrls: new Map([["hero.jpg", "https://cdn/hero.png"]]) },
    );
    expect(input.assets[0]).toMatchObject({ composition: "PH_1_comp" });
    expect(input.assets[1]).toMatchObject({ composition: "PH_1_comp" });
  });
});

// ── per-slot slices + the voiceover ──────────────────────────────────────────

describe("buildRenderInput — each video slot gets its OWN slice", () => {
  const three = [
    slot({ asset: "VIDEO", jobLayerName: "hero.mp4", durationSec: 7 }),
    slot({ asset: "VIDEO", jobLayerName: "cut-a.mp4", durationSec: 2 }),
    slot({ asset: "VIDEO", jobLayerName: "cut-b.mp4", durationSec: 2 }),
  ];

  it("injects a DIFFERENT url per slot — the whole reason slicing exists", () => {
    const input = build(template(three), {
      clipUrls: new Map([
        ["hero.mp4", "https://cdn/slice-0.mp4"],
        ["cut-a.mp4", "https://cdn/slice-1.mp4"],
        ["cut-b.mp4", "https://cdn/slice-2.mp4"],
      ]),
    });
    const srcs = input.assets.filter((a) => a.kind === "media").map((a) => a.src);
    expect(srcs).toEqual([
      "https://cdn/slice-0.mp4",
      "https://cdn/slice-1.mp4",
      "https://cdn/slice-2.mp4",
    ]);
    expect(new Set(srcs).size).toBe(3);
  });

  it("falls back to the whole master for a slot that was never sliced", () => {
    const input = build(template(three), {
      clipUrls: new Map([["hero.mp4", "https://cdn/slice-0.mp4"]]),
    });
    const srcs = input.assets.filter((a) => a.kind === "media").map((a) => a.src);
    expect(srcs).toEqual(["https://cdn/slice-0.mp4", CLIP, CLIP]);
  });

  it("NEVER emits a comp-duration asset — nothing trims the composition", () => {
    // A 25s template renders 25 seconds. Its graphics fill whatever the footage
    // does not cover, and its outro survives. The `compDuration` variant is gone
    // from the type entirely, so assert on the serialized job instead.
    const input = build(template(three, { durationSec: 25 }));
    expect(JSON.stringify(input.assets)).not.toContain("compDuration");
    expect(input.assets.map((a) => a.kind).sort()).toEqual([
      "autoscale", "autoscale", "autoscale", "media", "media", "media",
    ]);
  });
});

describe("buildRenderInput — the voiceover", () => {
  const withAudio = [
    slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
    slot({ asset: "AUDIO", jobLayerName: "voiceover.mp3" }),
  ];

  it("routes the master's full track to the template's audio layer", () => {
    // Slicing chops a baked-in voiceover into stuttering half-words, so the
    // whole track goes to the audio layer and the slices are muted.
    const input = build(template(withAudio), {
      audioUrl: "https://cdn/vo.m4a",
      audioLayerName: "voiceover.mp3",
    });
    const audio = input.assets.find(
      (a) => a.kind === "media" && a.mediaType === "audio",
    );
    expect(audio).toEqual({
      kind: "media",
      mediaType: "audio",
      composition: "main",
      layerName: "voiceover.mp3",
      src: "https://cdn/vo.m4a",
    });
  });

  it("never autoscales an audio layer — it has no dimensions", () => {
    const input = build(template(withAudio), {
      audioUrl: "https://cdn/vo.m4a",
      audioLayerName: "voiceover.mp3",
    });
    const scales = input.assets.filter((a) => a.kind === "autoscale");
    expect(scales.map((a) => a.layerName)).toEqual(["clip.mp4"]);
  });

  it("leaves the audio layer alone when there is no track to give it", () => {
    // No audio layer to route to → the voiceover rides on the longest slice.
    const input = build(template(withAudio));
    expect(input.assets.some((a) => a.kind === "media" && a.mediaType === "audio")).toBe(false);
  });

  it("does not hijack an audio layer the voiceover was not routed to", () => {
    // A music bed keeps the template's own track.
    const input = build(
      template([
        slot({ asset: "AUDIO", jobLayerName: "music.mp3" }),
        slot({ asset: "AUDIO", jobLayerName: "voiceover.mp3" }),
      ]),
      { audioUrl: "https://cdn/vo.m4a", audioLayerName: "voiceover.mp3" },
    );
    expect(input.assets).toHaveLength(1);
    expect(input.assets[0]).toMatchObject({ layerName: "voiceover.mp3" });
  });
});

// ── the wire format ──────────────────────────────────────────────────────────

describe("buildRenderJobBody — the new function assets reach Nexrender intact", () => {
  it("maps autoscale to its nx: function, preserving order", () => {
    const input = build(template([slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })]));
    const body = buildRenderJobBody(input);
    if (!("assets" in body)) throw new Error("expected a deliverable job");

    expect(body.assets).toEqual([
      { type: "video", composition: "main", layerName: "clip.mp4", src: CLIP },
      {
        type: "function",
        name: "nx:layer-autoscale",
        params: { composition: "main", layerName: "clip.mp4", type: "fill" },
      },
    ]);
  });

  it("maps the voiceover to a plain `audio` asset", () => {
    const input = build(
      template([
        slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
        slot({ asset: "AUDIO", jobLayerName: "vo.mp3" }),
      ]),
      { audioUrl: "https://cdn/vo.m4a", audioLayerName: "vo.mp3" },
    );
    const body = buildRenderJobBody(input);
    if (!("assets" in body)) throw new Error("expected a deliverable job");
    expect(body.assets.at(-1)).toEqual({
      type: "audio",
      composition: "main",
      layerName: "vo.mp3",
      src: "https://cdn/vo.m4a",
    });
  });

  it("emits NO nx:comp-duration-set, ever", () => {
    const input = build(template([slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })], { durationSec: 40 }));
    const body = buildRenderJobBody(input);
    if (!("assets" in body)) throw new Error("expected a deliverable job");
    expect(JSON.stringify(body)).not.toContain("comp-duration-set");
  });

  it("maps a generated still to an `image` asset", () => {
    const input = build(
      template([slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" })]),
      { imageUrls: new Map([["hero.jpg", "https://cdn/hero.png"]]) },
    );
    const body = buildRenderJobBody(input);
    if (!("assets" in body)) throw new Error("expected a deliverable job");
    expect(body.assets[0]).toEqual({
      type: "image",
      composition: "main",
      layerName: "hero.jpg",
      src: "https://cdn/hero.png",
    });
  });
});
