import { describe, expect, it } from "vitest";

import { isTransientConnectError } from "../../../lib/http.js";

/** The shape undici throws for a failed `fetch` — a TypeError with a `.cause`. */
const fetchError = (code: string): unknown =>
  Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("isTransientConnectError — only retry when no job could have been created", () => {
  it("is TRUE for connection-establishment failures (socket never opened)", () => {
    for (const code of [
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
    ]) {
      expect(isTransientConnectError(fetchError(code))).toBe(true);
    }
  });

  it("is FALSE for mid-flight drops — the request may have created a paid job", () => {
    // A dropped socket AFTER the request was sent must NOT retry a non-idempotent POST.
    expect(isTransientConnectError(fetchError("ECONNRESET"))).toBe(false);
    expect(isTransientConnectError(fetchError("UND_ERR_SOCKET"))).toBe(false);
  });

  it("is FALSE for an HTTP response error (nexrenderFetch's `!res.ok` throw)", () => {
    // No `.cause.code` — a 4xx/5xx already surfaced a response; handled elsewhere.
    expect(isTransientConnectError(new Error("Nexrender /jobs failed: 400 bad"))).toBe(
      false,
    );
  });

  it("is FALSE for a missing-id error and non-error values", () => {
    expect(isTransientConnectError(new Error("returned no job id"))).toBe(false);
    expect(isTransientConnectError(undefined)).toBe(false);
    expect(isTransientConnectError(null)).toBe(false);
    expect(isTransientConnectError("fetch failed")).toBe(false);
  });
});
