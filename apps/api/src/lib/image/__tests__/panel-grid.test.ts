import { describe, it, expect } from "vitest";
import sharp from "sharp";

import { cleanSheetGrid, panelGrid } from "../crop.js";

describe("panelGrid — near-square layout for N template panels", () => {
  it("maps each supported panel count to a grid", () => {
    expect(panelGrid(2)).toEqual({ rows: 1, cols: 2 });
    expect(panelGrid(3)).toEqual({ rows: 2, cols: 2 }); // one empty cell
    expect(panelGrid(4)).toEqual({ rows: 2, cols: 2 });
    expect(panelGrid(5)).toEqual({ rows: 2, cols: 3 }); // one empty cell
    expect(panelGrid(6)).toEqual({ rows: 2, cols: 3 });
  });

  it("covers every panel: rows*cols is never less than n", () => {
    for (let n = 2; n <= 6; n++) {
      const { rows, cols } = panelGrid(n);
      expect(rows * cols).toBeGreaterThanOrEqual(n);
    }
  });
});

describe("cleanSheetGrid — crops an N-panel sheet to a clean grid", () => {
  // A synthetic 600×400 sheet is enough to exercise the extract + re-tile.
  const sheet = () =>
    sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 120, g: 120, b: 120 },
      },
    })
      .png()
      .toBuffer()
      .then((b) => new Uint8Array(b));

  it("returns a valid image for a 3-panel (2×2, one empty) sheet", async () => {
    const { rows, cols } = panelGrid(3);
    const out = await cleanSheetGrid(await sheet(), rows, cols, 3);
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(out.byteLength).toBeGreaterThan(0);
    expect(meta.width ?? 0).toBeGreaterThan(0);
    expect(meta.height ?? 0).toBeGreaterThan(0);
  });

  it("returns a valid image for a 6-panel (2×3) sheet", async () => {
    const { rows, cols } = panelGrid(6);
    const out = await cleanSheetGrid(await sheet(), rows, cols, 6);
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width ?? 0).toBeGreaterThan(0);
    expect(meta.height ?? 0).toBeGreaterThan(0);
  });
});
