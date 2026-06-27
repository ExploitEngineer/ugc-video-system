import { defineConfig } from "vitest/config";

// Unit tests for the API package — offline only (no live OpenAI/BytePlus). The
// ad-types registry/hooks/detector logic lives under src/agents/ad-types/.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
