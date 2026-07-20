import { describe, expect, it, vi } from "vitest";

import { isTransientNetworkError } from "../../lib/http.js";
import type { Logger } from "../../lib/log.js";
import {
  pollVideoTolerant,
  type VideoProvider,
  type VideoTaskResult,
} from "../video.js";

/** undici's shape for a failed `fetch` — a TypeError with a `.cause.code`. */
const fetchError = (code: string): unknown =>
  Object.assign(new TypeError("fetch failed"), { cause: { code } });

const noopLog = {
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const providerThatPolls = (poll: () => Promise<VideoTaskResult>): VideoProvider => ({
  submitVideo: async () => ({ taskId: "t" }),
  pollVideo: poll,
});

describe("isTransientNetworkError — tolerate blips on idempotent polls", () => {
  it("is TRUE for DNS/connect/reset network codes (incl. EAI_AGAIN)", () => {
    for (const code of [
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ECONNRESET",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
    ]) {
      expect(isTransientNetworkError(fetchError(code))).toBe(true);
    }
  });

  it("also reads a top-level `.code` (non-undici errors)", () => {
    expect(isTransientNetworkError(Object.assign(new Error("x"), { code: "EAI_AGAIN" }))).toBe(
      true,
    );
  });

  it("is FALSE for HTTP-status errors and non-errors", () => {
    expect(isTransientNetworkError(new Error("BytePlus task cgt-1 404: not found"))).toBe(
      false,
    );
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError("fetch failed")).toBe(false);
  });
});

describe("pollVideoTolerant — a DNS blip must not discard a still-running clip", () => {
  it("passes a real result straight through", async () => {
    const done: VideoTaskResult = { state: "completed", videoUrl: "u", status: "succeeded" };
    const r = await pollVideoTolerant(providerThatPolls(async () => done), { taskId: "t" }, noopLog);
    expect(r).toEqual(done);
  });

  it("returns synthetic 'processing' on a transient network blip (EAI_AGAIN)", async () => {
    const r = await pollVideoTolerant(
      providerThatPolls(async () => {
        throw fetchError("EAI_AGAIN");
      }),
      { taskId: "t" },
      noopLog,
    );
    expect(r.state).toBe("processing");
    expect(r.videoUrl).toBeUndefined();
  });

  it("rethrows a real provider error (not a network blip)", async () => {
    await expect(
      pollVideoTolerant(
        providerThatPolls(async () => {
          throw new Error("BytePlus task cgt-1 failed: expired");
        }),
        { taskId: "t" },
        noopLog,
      ),
    ).rejects.toThrow(/expired/);
  });
});
