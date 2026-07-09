import { describe, it, expect } from "vitest";

import type { TemplateRenderInput } from "../../template-render.js";
import {
  buildRenderJobBody,
  isStubTemplateId,
  STUB_TEMPLATE_ID_PREFIX,
} from "../index.js";

const base: TemplateRenderInput = {
  nexrenderTemplateId: "tpl_123",
  composition: "main",
  assets: [],
};

describe("isStubTemplateId — cost safety across two processes on one database", () => {
  it("recognises every id the stub hands out", () => {
    expect(isStubTemplateId(`${STUB_TEMPLATE_ID_PREFIX}aep`)).toBe(true);
    expect(isStubTemplateId(`${STUB_TEMPLATE_ID_PREFIX}zip`)).toBe(true);
  });

  it("never matches a real Nexrender id (a 26-char ULID)", () => {
    // Both workers claim rows from the DATABASE, so a real-credential process
    // will pick up rows a stub-mode process created. The cloud provider refuses
    // to act on these, which is what stops it paying for a phantom render.
    expect(isStubTemplateId("01JTGM9GCR71JV7EJYDF45QAFD")).toBe(false);
    expect(isStubTemplateId("")).toBe(false);
  });
});

describe("buildRenderJobBody — preview and settings are mutually exclusive", () => {
  it("a PREVIEW job omits `settings` entirely", () => {
    // Nexrender rejects a job carrying both. This is the whole reason the
    // builder branches rather than spreading a common object.
    const body = buildRenderJobBody({ ...base, preview: true });
    expect(body).toEqual({
      template: { id: "tpl_123", composition: "main" },
      preview: true,
    });
    expect(body).not.toHaveProperty("settings");
  });

  it("a preview job carries NO assets, even if some were passed", () => {
    // The template must render its OWN placeholder content — that is what makes
    // the preview representative of what the admin uploaded.
    const body = buildRenderJobBody({
      ...base,
      preview: true,
      assets: [
        { kind: "media", mediaType: "video", composition: "main", layerName: "clip", src: "https://x/y.mp4" },
      ],
    });
    expect(body).not.toHaveProperty("assets");
  });

  it("a DELIVERABLE job carries settings and no `preview` flag", () => {
    const body = buildRenderJobBody(base);
    expect(body).not.toHaveProperty("preview");
    expect(body).toMatchObject({
      settings: { type: "video", quality: "full", codec: "video_h264_vbr_15mbps" },
    });
  });

  it("maps a media asset straight through, and text via nx:text-params-set", () => {
    const body = buildRenderJobBody({
      ...base,
      assets: [
        { kind: "media", mediaType: "image", composition: "main", layerName: "hero", src: "https://x/y.png" },
        { kind: "text", composition: "main", layerName: "Headline", value: "Buy now" },
      ],
    });
    if (!("assets" in body)) throw new Error("expected a deliverable job");
    expect(body.assets[0]).toEqual({
      type: "image",
      composition: "main",
      layerName: "hero",
      src: "https://x/y.png",
    });
    expect(body.assets[1]).toEqual({
      type: "function",
      name: "nx:text-params-set",
      params: { composition: "main", layerName: "Headline", textValue: "Buy now" },
    });
  });
});
