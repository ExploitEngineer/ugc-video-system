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

describe("buildRenderJobBody — a library preview is an ordinary render", () => {
  it("never sends Nexrender's `preview` flag, which truncates the output", () => {
    // A 12.03s template came back as a 3.7s clip, so the library card lied about
    // how long the template runs. A library preview is just a render with no
    // assets — `libraryPreview` says which KIND of render this is, and must never
    // reach the job body.
    const body = buildRenderJobBody({ ...base, libraryPreview: true });
    expect(body).not.toHaveProperty("preview");
    expect(body).not.toHaveProperty("libraryPreview");
    expect(body).toEqual({
      template: { id: "tpl_123", composition: "main" },
      assets: [],
      settings: { type: "video", quality: "full", codec: "video_h264_vbr_15mbps" },
    });
  });

  it("a DELIVERABLE job carries settings and no `preview` flag", () => {
    const body = buildRenderJobBody(base);
    expect(body).not.toHaveProperty("preview");
    expect(body).toMatchObject({
      settings: { type: "video", quality: "full", codec: "video_h264_vbr_15mbps" },
    });
  });

  it("sends layerIndex INSTEAD of layerName for an unnamed layer", () => {
    // Nexrender matches the name stored in the project. A footage placeholder has
    // none — After Effects only displays its source's name — so a job carrying
    // `layerName: "PH_1"` dies with "Couldn't find any layers by provided name".
    const body = buildRenderJobBody({
      ...base,
      assets: [
        {
          kind: "media",
          mediaType: "video",
          composition: "Scene_1",
          layerName: "PH_1",
          layerIndex: 2,
          src: "https://x/y.mp4",
        },
      ],
    });
    expect(body.assets[0]).toEqual({
      type: "video",
      composition: "Scene_1",
      layerIndex: 2,
      src: "https://x/y.mp4",
    });
    expect(body.assets[0]).not.toHaveProperty("layerName");
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
