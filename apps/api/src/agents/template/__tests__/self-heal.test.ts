import { describe, expect, it } from "vitest";

import type { TemplateJobAssetInput } from "../../../providers/template-render.js";
import {
  dropAssetsByLayerName,
  dropImageAssets,
  isAssetRejectionError,
  parseMissingLayerName,
} from "../self-heal.js";

describe("parseMissingLayerName", () => {
  it("extracts the layer name from a real Nexrender missing-layer error", () => {
    const err =
      "Nexrender job 01KX852906QJ0HV987BDTT9WDN error: Error: nexrender: " +
      "Couldn't find any layers by provided name (dynamic) inside a composition: *";
    expect(parseMissingLayerName(err)).toBe("dynamic");
  });

  it("keeps a name that contains spaces", () => {
    expect(
      parseMissingLayerName("Couldn't find any layers by provided name (media files)"),
    ).toBe("media files");
  });

  it("is case-insensitive on the phrase", () => {
    expect(parseMissingLayerName("...Provided Name (Trendy) inside...")).toBe("Trendy");
  });

  it("returns null for an unrelated failure", () => {
    expect(parseMissingLayerName("Nexrender job X error: render timed out")).toBeNull();
  });

  it("returns null for an empty capture, and for empty/nullish input", () => {
    expect(parseMissingLayerName("...provided name () inside...")).toBeNull();
    expect(parseMissingLayerName("")).toBeNull();
    expect(parseMissingLayerName(undefined)).toBeNull();
    expect(parseMissingLayerName(null)).toBeNull();
  });
});

describe("dropAssetsByLayerName", () => {
  const assets: TemplateJobAssetInput[] = [
    { kind: "media", mediaType: "video", composition: "Scene_03", layerName: "dynamic", src: "a" },
    { kind: "autoscale", composition: "Scene_03", layerName: "dynamic", fit: "fill" },
    { kind: "text", composition: "text_07", layerName: "dynamic", value: "Lasting" },
    { kind: "text", composition: "text_06", layerName: "modern", value: "Modern" },
  ];

  it("drops every asset targeting the name — text, media, and paired autoscale", () => {
    const out = dropAssetsByLayerName(assets, "dynamic");
    expect(out).toHaveLength(1);
    expect(out[0]?.layerName).toBe("modern");
  });

  it("leaves the array unchanged when nothing matches", () => {
    expect(dropAssetsByLayerName(assets, "nope")).toHaveLength(assets.length);
  });

  it("does not mutate the input array", () => {
    dropAssetsByLayerName(assets, "dynamic");
    expect(assets).toHaveLength(4);
  });
});

describe("dropImageAssets — what makes injecting stills safe to attempt", () => {
  const assets: TemplateJobAssetInput[] = [
    { kind: "media", mediaType: "video", composition: "Main", layerName: "PH_1", src: "clip.mp4" },
    { kind: "autoscale", composition: "Main", layerName: "PH_1", fit: "fill" },
    { kind: "media", mediaType: "image", composition: "Main", layerName: "IMG_1", src: "still.png" },
    { kind: "autoscale", composition: "Main", layerName: "IMG_1", fit: "fill" },
    { kind: "text", composition: "Main", layerName: "Headline", value: "Hello" },
  ];

  it("drops the stills and leaves the ad's video and text intact", () => {
    const out = dropImageAssets(assets);
    expect(out.filter((a) => a.kind === "media" && a.mediaType === "image")).toHaveLength(0);
    expect(out.filter((a) => a.kind === "media" && a.mediaType === "video")).toHaveLength(1);
    expect(out.filter((a) => a.kind === "text")).toHaveLength(1);
  });

  it("takes the orphaned autoscale with them, but not the video's", () => {
    // A stale autoscale would rescale whatever placeholder is still in the layer.
    const out = dropImageAssets(assets);
    const scaled = out.filter((a) => a.kind === "autoscale").map((a) => a.layerName);
    expect(scaled).toEqual(["PH_1"]);
  });

  it("does not mutate the input array", () => {
    dropImageAssets(assets);
    expect(assets).toHaveLength(5);
  });
});

describe("isAssetRejectionError — Nexrender refusing an asset names no layer", () => {
  it("recognises the rejection that kept the stills switched off", () => {
    expect(
      isAssetRejectionError(
        "@nexrender/action-encode: assetRedefinition must include src, layerName, and filename",
      ),
    ).toBe(true);
  });

  it("does not claim a missing-layer error, which self-heals by NAME instead", () => {
    expect(
      isAssetRejectionError(
        "Error: nexrender: Couldn't find any layers by provided name (dynamic) inside a composition: *",
      ),
    ).toBe(false);
    expect(isAssetRejectionError(undefined)).toBe(false);
    expect(isAssetRejectionError("")).toBe(false);
  });
});
