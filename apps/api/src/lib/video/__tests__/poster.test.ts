import { describe, it, expect } from "vitest";

import { STUB_PREVIEW_MP4_DATA_URL } from "../../../providers/nexrender/stub-preview.js";
import { extractPoster } from "../merge.js";

// A real ffmpeg invocation against a real (tiny) MP4. Offline: the clip is
// inlined as a `data:` URL, which Node's fetch resolves natively — so this
// exercises the actual code path the preview stage runs, not a mock of it.
describe("extractPoster — a real frame out of a real clip", () => {
  it("returns a JPEG", async () => {
    const { bytes, mime } = await extractPoster(STUB_PREVIEW_MP4_DATA_URL);
    expect(mime).toBe("image/jpeg");
    expect(bytes.length).toBeGreaterThan(0);
    // JPEG SOI marker, then EOI at the tail.
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);
  }, 30_000);

  it("falls back to frame 0 when the seek lands past the end of the clip", async () => {
    // The stub clip is 2s long. Seeking to 60s yields no frames, so the retry
    // path is what produces the poster. Without it, a short template preview
    // would silently have no thumbnail.
    const { bytes } = await extractPoster(STUB_PREVIEW_MP4_DATA_URL, 60);
    expect(bytes.length).toBeGreaterThan(0);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  }, 30_000);
});
