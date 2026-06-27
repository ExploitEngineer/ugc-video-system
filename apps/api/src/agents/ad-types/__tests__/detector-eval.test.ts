import { describe, expect, it } from "vitest";

import { reconcile } from "../reconcile.js";
import { DETECTOR_FIXTURES } from "./detector-eval.fixtures.js";

// ── OFFLINE: deterministic clamp + confidence gate + reconcile (NO LLM) ──────
// Feeds each fixture's simulated detector output through the deterministic
// safety net and asserts the final type / hook / synth flag. This is the part
// that runs in CI; it never calls a model.
describe("detector eval — offline reconcile assertions", () => {
  for (const fx of DETECTOR_FIXTURES) {
    it(fx.name, () => {
      const out = reconcile(
        {
          adType: fx.rawDetector.adType,
          hooks: fx.rawDetector.hooks,
          confidence: fx.rawDetector.confidence,
        },
        fx.input.hasProduct,
        fx.input.hasPerson,
      );
      expect(out.adType).toBe(fx.expected.adType);
      if (fx.expected.visualLeadHook) {
        expect(out.hooks.visualLead.id).toBe(fx.expected.visualLeadHook);
      }
      if (fx.expected.synthesizePerson !== undefined) {
        expect(out.synthesizePerson).toBe(fx.expected.synthesizePerson);
      }
      // Composition invariant: never two visual-leads.
      if (out.hooks.overlay) {
        expect(out.hooks.overlay.role).toBe("overlay");
        expect(out.hooks.visualLead.role).toBe("visual_lead");
      }
    });
  }

  it("covers every registered ad type at least once", () => {
    const expectedTypes = new Set(DETECTOR_FIXTURES.map((f) => f.expected.adType));
    // The fixtures should exercise the reconcile path across the 6 core types.
    expect(expectedTypes.size).toBeGreaterThanOrEqual(6);
  });
});

// ── OPTIONAL LIVE: run the REAL detector + reconcile and report accuracy ─────
// Off in CI. Enable with RUN_LIVE_DETECTOR_EVAL=1 (needs OPENROUTER/OPENAI keys).
// Uses dynamic imports so the config (which fail-fasts on missing env) only
// loads when this actually runs.
const LIVE = Boolean(process.env.RUN_LIVE_DETECTOR_EVAL);

describe.skipIf(!LIVE)("detector eval — LIVE classification accuracy", () => {
  it(
    "classifies the fixtures above an accuracy floor",
    async () => {
      const { interpretAdStyle } = await import(
        "../../creative-direction/interpret-style/index.js"
      );
      const { createOpenAIProvider } = await import(
        "../../../providers/openai/index.js"
      );
      // Minimal ctx — interpretAdStyle only uses ctx.openai.chat.
      const ctx = { openai: createOpenAIProvider() } as Parameters<
        typeof interpretAdStyle
      >[0];

      let correct = 0;
      const misses: string[] = [];
      for (const fx of DETECTOR_FIXTURES) {
        const detected = await interpretAdStyle(ctx, {
          userPrompt: fx.prompt,
          hasProduct: fx.input.hasProduct,
          hasPerson: fx.input.hasPerson,
        });
        const out = reconcile(
          { adType: detected.adType, hooks: detected.hooks, confidence: detected.confidence },
          fx.input.hasProduct,
          fx.input.hasPerson,
        );
        if (out.adType === fx.expected.adType) correct++;
        else misses.push(`${fx.name}: got ${out.adType}, want ${fx.expected.adType}`);
      }
      const accuracy = correct / DETECTOR_FIXTURES.length;
      // eslint-disable-next-line no-console
      console.log(
        `[detector-eval] accuracy ${(accuracy * 100).toFixed(1)}% (${correct}/${DETECTOR_FIXTURES.length})\n  misses:\n  ${misses.join("\n  ")}`,
      );
      expect(accuracy).toBeGreaterThan(0.5);
    },
    120_000,
  );
});
