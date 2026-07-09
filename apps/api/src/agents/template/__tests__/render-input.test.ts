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
    clipSeconds: 12,
    trimComp: false,
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
    clipUrl: CLIP,
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

// ── comp duration ────────────────────────────────────────────────────────────

describe("buildRenderInput — comp trimming", () => {
  const slots = [slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })];

  it("does NOT trim a composition the clip already covers", () => {
    const input = build(template(slots, { trimComp: false, clipSeconds: 12 }));
    expect(input.assets.some((a) => a.kind === "compDuration")).toBe(false);
  });

  it("trims a composition that outruns Seedance's ceiling", () => {
    // 25s template → a 15s clip. Without the trim, 10s of composition plays on
    // past the end of the footage.
    const input = build(template(slots, { trimComp: true, clipSeconds: 15, durationSec: 25 }));
    expect(input.assets.at(-1)).toEqual({
      kind: "compDuration",
      composition: "main",
      valueSec: 15,
    });
  });

  it("puts the trim LAST, so nothing above can re-lengthen the work area", () => {
    const input = build(template(slots, { trimComp: true, clipSeconds: 15 }));
    const idx = input.assets.findIndex((a) => a.kind === "compDuration");
    expect(idx).toBe(input.assets.length - 1);
  });
});

// ── the wire format ──────────────────────────────────────────────────────────

describe("buildRenderJobBody — the new function assets reach Nexrender intact", () => {
  it("maps autoscale and compDuration to their nx: functions, preserving order", () => {
    const input = build(
      template([slot({ asset: "VIDEO", jobLayerName: "clip.mp4" })], {
        trimComp: true,
        clipSeconds: 15,
      }),
    );
    const body = buildRenderJobBody(input);
    if (!("assets" in body)) throw new Error("expected a deliverable job");

    expect(body.assets).toEqual([
      { type: "video", composition: "main", layerName: "clip.mp4", src: CLIP },
      {
        type: "function",
        name: "nx:layer-autoscale",
        params: { composition: "main", layerName: "clip.mp4", type: "fill" },
      },
      {
        type: "function",
        name: "nx:comp-duration-set",
        params: { composition: "main", value: 15 },
      },
    ]);
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
