import { describe, it, expect } from "vitest";

import {
  OPENAI_CHAT_MODEL,
  OPENROUTER_CLAUDE_MODEL,
  OPENROUTER_SMALL_MODEL,
} from "../constants.js";
import { resolveBackend } from "../index.js";

describe("resolveBackend — three backends, one fallback rule", () => {
  it("defaults to Claude via OpenRouter", () => {
    expect(resolveBackend(undefined, true)).toEqual({
      viaOpenRouter: true,
      model: OPENROUTER_CLAUDE_MODEL,
      label: "claude",
    });
  });

  it("routes `small` to the small model, same OpenRouter endpoint", () => {
    const r = resolveBackend("small", true);
    expect(r.viaOpenRouter).toBe(true);
    expect(r.model).toBe(OPENROUTER_SMALL_MODEL);
    expect(r.label).toBe("small");
    // Different slug from the default — otherwise the whole point is lost.
    expect(r.model).not.toBe(OPENROUTER_CLAUDE_MODEL);
  });

  it("`openai` forces gpt-4.1 even when OpenRouter is configured", () => {
    expect(resolveBackend("openai", true)).toEqual({
      viaOpenRouter: false,
      model: OPENAI_CHAT_MODEL,
      label: "openai",
    });
  });

  it("BOTH OpenRouter backends degrade to gpt-4.1 without the key", () => {
    // The server must run without OPENROUTER_API_KEY. A `small` call silently
    // becoming a Sonnet call would be worse than becoming a gpt-4.1 call.
    for (const backend of ["claude", "small", undefined] as const) {
      const r = resolveBackend(backend, false);
      expect(r, String(backend)).toEqual({
        viaOpenRouter: false,
        model: OPENAI_CHAT_MODEL,
        label: "openai",
      });
    }
  });

  it("the label reflects the ACTUAL route, not the request", () => {
    // A log line saying `backend=small` while gpt-4.1 answered would be a lie.
    expect(resolveBackend("small", false).label).toBe("openai");
  });
});
