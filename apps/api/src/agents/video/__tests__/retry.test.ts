import { describe, it, expect } from "vitest";

import {
  MAX_VIDEO_ATTEMPTS,
  dispositionAfterLadder,
  promptTierForAttempt,
  videoFailureDisposition,
} from "../retry.js";

describe("videoFailureDisposition", () => {
  it("transient video codes → retry (only on video/segment_video steps)", () => {
    for (const code of [
      "VIDEO_GENERATION_FAILED",
      "VIDEO_GENERATION_TIMEOUT",
      "VIDEO_GENERATION_EXPIRED",
      "PROVIDER_RATE_LIMITED",
    ] as const) {
      expect(videoFailureDisposition(code, "video")).toBe("retry");
      expect(videoFailureDisposition(code, "segment_video")).toBe("retry");
    }
  });

  it("content/safety codes → soft_fail (park for the user, no auto-retry)", () => {
    expect(videoFailureDisposition("PROVIDER_CONTENT_BLOCKED", "video")).toBe(
      "soft_fail",
    );
    expect(videoFailureDisposition("PERSON_IMAGE_INVALID", "segment_video")).toBe(
      "soft_fail",
    );
    // The ladder intercepts PROVIDER_AUDIO_BLOCKED and retries with brand-safe
    // speech first; its ESCAPE-HATCH disposition (if that retry also blocks) is
    // soft_fail → park at awaiting_regen (audio is never silently dropped).
    expect(videoFailureDisposition("PROVIDER_AUDIO_BLOCKED", "video")).toBe(
      "soft_fail",
    );
  });

  it("unrelated codes → hard_fail", () => {
    expect(videoFailureDisposition("VIDEO_MERGE_FAILED", "video")).toBe(
      "hard_fail",
    );
    expect(videoFailureDisposition("IMAGE_GENERATION_FAILED", "video")).toBe(
      "hard_fail",
    );
    expect(videoFailureDisposition("INTERNAL", "video")).toBe("hard_fail");
  });

  it("non-video steps are always hard_fail, even for transient codes", () => {
    expect(videoFailureDisposition("VIDEO_GENERATION_TIMEOUT", "merge")).toBe(
      "hard_fail",
    );
    expect(videoFailureDisposition("PROVIDER_RATE_LIMITED", "storyboard")).toBe(
      "hard_fail",
    );
    expect(videoFailureDisposition("VIDEO_GENERATION_FAILED", null)).toBe(
      "hard_fail",
    );
  });
});

describe("dispositionAfterLadder — where a propagated failure lands", () => {
  it("a transient code that exhausted the ladder parks (soft_fail)", () => {
    expect(dispositionAfterLadder("VIDEO_GENERATION_TIMEOUT", "video")).toBe(
      "soft_fail",
    );
  });
  it("a content code parks (soft_fail)", () => {
    expect(dispositionAfterLadder("PROVIDER_CONTENT_BLOCKED", "video")).toBe(
      "soft_fail",
    );
  });
  it("a hard code / non-video step dies (hard_fail)", () => {
    expect(dispositionAfterLadder("VIDEO_MERGE_FAILED", "video")).toBe(
      "hard_fail",
    );
    expect(dispositionAfterLadder("VIDEO_GENERATION_FAILED", "storyboard")).toBe(
      "hard_fail",
    );
  });
});

describe("promptTierForAttempt", () => {
  it("early attempts use the LLM prompt; the final attempt is deterministic", () => {
    expect(promptTierForAttempt(1)).toBe("llm");
    expect(promptTierForAttempt(2)).toBe("llm");
    expect(promptTierForAttempt(MAX_VIDEO_ATTEMPTS)).toBe("deterministic");
    expect(promptTierForAttempt(MAX_VIDEO_ATTEMPTS + 1)).toBe("deterministic");
  });
});
