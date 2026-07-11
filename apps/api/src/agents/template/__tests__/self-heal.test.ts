import { describe, expect, it } from "vitest";

import type { TemplateJobAssetInput } from "../../../providers/template-render.js";
import { dropAssetsByLayerName, parseMissingLayerName } from "../self-heal.js";

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
