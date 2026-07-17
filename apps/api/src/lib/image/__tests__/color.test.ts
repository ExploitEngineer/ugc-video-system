import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { neutralizeCast } from "../color.js";

/**
 * A deliberately warm image, so the correction is NOT negligible and the
 * re-encode actually runs — a subtle one returns the input bytes untouched and
 * would prove nothing about the output format.
 */
const warm = async (format: "webp" | "png"): Promise<Uint8Array> => {
  const img = sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 220, g: 120, b: 60 } },
  });
  return new Uint8Array(await (format === "png" ? img.png() : img.webp()).toBuffer());
};

const formatOf = async (bytes: Uint8Array): Promise<string | undefined> =>
  (await sharp(Buffer.from(bytes)).metadata()).format;

describe("neutralizeCast — the output format is a correctness bug, not a preference", () => {
  it("re-encodes to PNG on request, for the stills After Effects imports", async () => {
    // AE cannot read WebP without a third-party plugin, and the template spec
    // bans those. A `.webp` still is a file the render simply cannot open, which
    // is half of why generated stills never once appeared in a template render.
    expect(await formatOf(await neutralizeCast(await warm("png"), { format: "png" }))).toBe("png");
    // The format is the CALLER's choice, not the input's: a WebP in still comes
    // out PNG, which is exactly the gpt-image-2 case.
    expect(await formatOf(await neutralizeCast(await warm("webp"), { format: "png" }))).toBe("png");
  });

  it("still defaults to WebP, which is right for the sheets Seedance reads", async () => {
    expect(await formatOf(await neutralizeCast(await warm("webp")))).toBe("webp");
    expect(await formatOf(await neutralizeCast(await warm("webp"), { format: "webp" }))).toBe("webp");
  });

  it("actually neutralizes the cast it was asked to", async () => {
    const before = await sharp(Buffer.from(await warm("png"))).stats();
    const after = await sharp(
      Buffer.from(await neutralizeCast(await warm("png"), { format: "png" })),
    ).stats();
    const spread = (s: sharp.Stats) => {
      const m = s.channels.slice(0, 3).map((c) => c.mean);
      return Math.max(...m) - Math.min(...m);
    };
    expect(spread(after)).toBeLessThan(spread(before));
  });

  it("returns the input untouched rather than throwing on bytes that are not an image", async () => {
    const junk = new Uint8Array([1, 2, 3, 4]);
    expect(await neutralizeCast(junk, { format: "png" })).toBe(junk);
  });
});
