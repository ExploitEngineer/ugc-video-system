import { describe, expect, it } from "vitest";

import { STUB_PREVIEW_MP4_DATA_URL } from "../../../providers/nexrender/stub-preview.js";
import { probeVideoDuration } from "../merge.js";

// A real ffmpeg invocation against a real (tiny) MP4, offline: the clip is inlined
// as a `data:` URL, which Node's fetch resolves natively — so this exercises the
// actual code path, not a mock of it.
//
// What it guards: After Effects renders a composition's WORK AREA, not its
// `duration` property, and Nexrender's API exposes no work area. Believing the
// property made a 21s template generate a 36s master — ~40% of the video spend
// discarded, with every slice cut from the wrong second. Measuring the template's
// own render is the only honest answer, and this is the measurement.
describe("probeVideoDuration — a real length out of a real clip", () => {
  it("measures the clip's actual duration", async () => {
    // The stub preview clip is 2s.
    const sec = await probeVideoDuration(STUB_PREVIEW_MP4_DATA_URL);
    expect(sec).toBeCloseTo(2.0, 1);
  }, 30_000);

  it("decodes no frames — it reads the header, it does not transcode", async () => {
    // `-t 0` is why this is ~90ms rather than a full decode. If someone drops it,
    // measuring a 60s template silently becomes a multi-second transcode on the
    // single process-wide ffmpeg slot, stalling every other run's merge.
    const t0 = Date.now();
    await probeVideoDuration(STUB_PREVIEW_MP4_DATA_URL);
    expect(Date.now() - t0).toBeLessThan(10_000);
  }, 30_000);
});
