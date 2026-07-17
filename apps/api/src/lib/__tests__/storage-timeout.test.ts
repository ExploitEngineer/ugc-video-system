import { describe, expect, it } from "vitest";

import { uploadTimeoutFor } from "../storage.js";

describe("uploadTimeoutFor — a stall detector, not a throughput budget", () => {
  const MB = 1e6;

  it("keeps the 120s floor for the small assets that dominate a run", () => {
    // Sheets, stills, slices — none of these need more, and the floor is what
    // catches a connection that opens and never responds.
    expect(uploadTimeoutFor(0)).toBe(120_000);
    expect(uploadTimeoutFor(2 * MB)).toBe(120_000);
    expect(uploadTimeoutFor(12 * MB)).toBe(120_000);
  });

  it("gives the real 43MB composite room to finish on a ~1Mbit uplink", () => {
    // The regression: a flat 120s demanded ~3Mbit sustained purely because the
    // file was big. It timed out three times on a link that had just uploaded the
    // Seedance master fine, and the run was lost AFTER the render had succeeded
    // and been paid for.
    const t = uploadTimeoutFor(43 * MB);
    expect(t).toBeGreaterThan(120_000);
    expect(t).toBe(430_000);
  });

  it("scales with size, so a bigger file is never MORE likely to be called dead", () => {
    const sizes = [5, 20, 43, 50].map((n) => n * MB);
    const budgets = sizes.map((b) => uploadTimeoutFor(b) / (b / 1e6));
    // Every payload gets at least as many ms per MB as the largest one.
    for (const perMb of budgets) expect(perMb).toBeGreaterThanOrEqual(10_000);
  });

  it("still bounds a genuine stall rather than hanging forever", () => {
    // The whole point of the ceiling: the Supabase client has no timeout of its
    // own. Even at the Storage cap this must resolve in minutes, not never.
    expect(uploadTimeoutFor(50 * MB)).toBeLessThan(10 * 60_000);
  });
});
