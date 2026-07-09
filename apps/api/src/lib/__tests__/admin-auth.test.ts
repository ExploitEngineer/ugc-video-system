import { describe, it, expect } from "vitest";

import { secretEquals } from "../admin-auth.js";

describe("secretEquals — length-safe constant-time compare", () => {
  it("matches identical secrets", () => {
    expect(secretEquals("s3cret-key-value", "s3cret-key-value")).toBe(true);
  });

  it("rejects a different secret of the same length", () => {
    expect(secretEquals("s3cret-key-value", "s3cret-key-valuX")).toBe(false);
  });

  it("rejects different lengths WITHOUT throwing", () => {
    // node:crypto's timingSafeEqual throws on unequal buffer lengths, which
    // would crash the request and leak the key's length through the error.
    expect(() => secretEquals("short", "a-much-longer-secret")).not.toThrow();
    expect(secretEquals("short", "a-much-longer-secret")).toBe(false);
    expect(secretEquals("", "x")).toBe(false);
  });

  it("rejects the empty string against a real key", () => {
    expect(secretEquals("", "s3cret-key-value")).toBe(false);
  });

  it("is byte-exact, not unicode-normalizing", () => {
    expect(secretEquals("é", "é")).toBe(true);
    // NFC vs NFD forms of the same glyph are different bytes → different secret.
    expect(secretEquals("é", "é")).toBe(false);
  });
});
