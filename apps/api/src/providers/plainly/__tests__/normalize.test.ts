import { describe, expect, it } from "vitest";

import type { PlainlyTemplateParam } from "../index.js";
import { normalizeRenderParameters } from "../index.js";

const params: PlainlyTemplateParam[] = [
  { name: "newsHeading", layerType: "DATA", mandatory: true },
  { name: "newsCta", layerType: "DATA", mandatory: false },
  { name: "image", layerType: "MEDIA", mediaType: "video", mandatory: true },
  { name: "newsLogo", layerType: "MEDIA", mediaType: "image", mandatory: false },
  { name: "colorPrimary", layerType: "COLOR", mandatory: false },
  { name: "brandSolid", layerType: "SOLID_COLOR", mandatory: false },
];

describe("normalizeRenderParameters", () => {
  it("strips the leading '#' from COLOR + SOLID_COLOR values", () => {
    const out = normalizeRenderParameters(params, {
      colorPrimary: "#6d4aFF",
      brandSolid: "#FFFFFF",
    });
    // Plainly wants 6-digit hex WITHOUT '#' (casing preserved, value trimmed).
    expect(out.colorPrimary).toBe("6d4aFF");
    expect(out.brandSolid).toBe("FFFFFF");
  });

  it("accepts a color already without '#' unchanged", () => {
    const out = normalizeRenderParameters(params, { colorPrimary: "242423" });
    expect(out.colorPrimary).toBe("242423");
  });

  it("keeps blank DATA ('' clears the text) but omits blank color/media", () => {
    const out = normalizeRenderParameters(params, {
      newsCta: "",
      colorPrimary: "",
      newsLogo: "",
      image: "https://example.com/clip.mp4",
    });
    expect(out).toHaveProperty("newsCta", "");
    expect(out).not.toHaveProperty("colorPrimary");
    expect(out).not.toHaveProperty("newsLogo");
    expect(out.image).toBe("https://example.com/clip.mp4");
  });
});
