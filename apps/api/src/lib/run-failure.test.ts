import { describe, expect, it } from "vitest";
import { RunFailure, classifyRunError } from "./run-failure.js";

describe("classifyRunError", () => {
  it("maps a BytePlus copyright-restriction reject to PROVIDER_CONTENT_BLOCKED", () => {
    // The exact string BytePlus/Seedance returns for a trademark/logo output block.
    const err = new Error(
      "BytePlus task cgt-20260702160110-bkpk9 failed: The request failed because the output video may be related to copyright restrictions.",
    );
    const failure = classifyRunError(err, "VIDEO_GENERATION_FAILED");
    expect(failure.code).toBe("PROVIDER_CONTENT_BLOCKED");
    expect(failure.userMessage).toMatch(/safety filter blocked/i);
    // Raw provider text is preserved as detail, never lost.
    expect(failure.detail).toContain("copyright restrictions");
  });

  it("maps a trademark reject to PROVIDER_CONTENT_BLOCKED", () => {
    const err = new Error("Seedance task failed: content may infringe a trademark");
    expect(classifyRunError(err, "VIDEO_GENERATION_FAILED").code).toBe(
      "PROVIDER_CONTENT_BLOCKED",
    );
  });

  it("keeps a plain BytePlus failure as VIDEO_GENERATION_FAILED (regex not over-broadened)", () => {
    const err = new Error("BytePlus task cgt-abc failed: internal server error");
    expect(classifyRunError(err, "VIDEO_GENERATION_FAILED").code).toBe(
      "VIDEO_GENERATION_FAILED",
    );
  });

  it("passes an existing RunFailure through untouched", () => {
    const original = new RunFailure(
      "PROVIDER_RATE_LIMITED",
      "busy",
      "raw detail",
    );
    expect(classifyRunError(original, "VIDEO_GENERATION_FAILED")).toBe(original);
  });
});
