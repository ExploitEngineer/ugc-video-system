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
    //
    // Cloud's OpenAPI omits `layerIndex`, which reads like it is unsupported, but
    // its workers run nexrender core, which honours it: six real renders have
    // filled index-targeted footage, one of them 40 slots' worth. Sending the
    // source filename as `layerName` instead fails with `Unable to call
    // "replaceSource" because of parameter 1. undefined is not of the correct type`.
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
    // Index-targeted VIDEO has rendered many times without one, so don't start
    // sending a `name` to it now.
    expect(body.assets[0]).not.toHaveProperty("name");
  });

  it("DOES give an index-targeted IMAGE a filename — unlike video, it never rendered", () => {
    // The asymmetry is earned, not stylistic. Index-targeted video is proven by
    // six real renders. Index-targeted image is the asset "assetRedefinition must
    // include src, layerName, and filename" rejects, and without a `name` it
    // carries neither of the two things that error asks for. The layerIndex still
    // wins over layerName, so the fix cannot re-break the targeting.
    const body = buildRenderJobBody({
      ...base,
      assets: [
        {
          kind: "media",
          mediaType: "image",
          composition: "Comments",
          layerName: "PUT YOUR IMAGE TEXT 5",
          layerIndex: 13,
          src: "https://cdn/runs/abc/template_image-81adcbe2.png?token=x",
        },
      ],
    });
    expect(body.assets[0]).toEqual({
      type: "image",
      composition: "Comments",
      layerIndex: 13,
      name: "template_image-81adcbe2.png",
      src: "https://cdn/runs/abc/template_image-81adcbe2.png?token=x",
    });
    expect(body.assets[0]).not.toHaveProperty("layerName");
  });

  it("gives a NAME-targeted media asset a real filename to save as", () => {
    // An AE layer name is not a filename: "DELETE THIS" has no extension, and
    // Nexrender falls back to the layerName when `name` is absent, so the job dies
    // with "assetRedefinition must include src, layerName, and filename" before a
    // frame renders. One such layer killed an 80-asset job; every template that
    // had rendered successfully happened to have zero name-targeted media.
    const body = buildRenderJobBody({
      ...base,
      assets: [
        {
          kind: "media",
          mediaType: "video",
          composition: "PUT YOUR VIDEO",
          layerName: "DELETE THIS",
          src: "https://cdn/runs/abc/template_clip-887f7e63.mp4?token=x",
        },
      ],
    });
    expect(body.assets[0]).toEqual({
      type: "video",
      composition: "PUT YOUR VIDEO",
      layerName: "DELETE THIS",
      name: "template_clip-887f7e63.mp4",
      src: "https://cdn/runs/abc/template_clip-887f7e63.mp4?token=x",
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
      name: "y.png",
      src: "https://x/y.png",
    });
    expect(body.assets[1]).toEqual({
      type: "function",
      name: "nx:text-params-set",
      params: { composition: "main", layerName: "Headline", textValue: "Buy now" },
    });
  });
});
