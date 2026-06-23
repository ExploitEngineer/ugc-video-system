// Creative Direction Agent skill: the single-call ad-type + hook detector.
//
// One LLM call at the start of a run (Claude via OpenRouter — no strict JSON
// mode, so a strict-JSON PROMPT + the forgiving `adStylePlanSchema` + the
// deterministic clamp/reconcile own correctness). Returns the DETECTED plan; the
// orchestrator then `reconcile`s it against ground-truth uploads and persists.

import { type AdStylePlan, adStylePlanSchema } from "@ugc/shared";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import {
  CONFUSABLE_RULES,
  renderAdTypeMenu,
  renderHookMenu,
} from "../../ad-types/menu.js";
import { assetImpliedDefault, clampAdType } from "../../ad-types/reconcile.js";
import { buildInterpretStylePrompt } from "./prompt.js";

export const FALLBACK_AD_STYLE = "clean, neutral commercial";

export interface InterpretAdStyleInput {
  userPrompt: string;
  /** Ground-truth: was a product / person image uploaded? Drives the detector. */
  hasProduct: boolean;
  hasPerson: boolean;
  productBrief?: string;
  personBrief?: string;
  /** Unresolved bracket placeholders in the prompt (Fix 8); empty when none. */
  unresolvedPlaceholders?: string[];
}

/** The detector's result after parse + early adType clamp (pre-reconcile). */
export interface DetectedPlan {
  adStyle: string;
  adType: string; // clamped to a known/canonical id
  hooks: string[]; // detected hook ids (resolved against the final type in reconcile)
  confidence: number; // 0–1
  assetIntent: AdStylePlan["assetIntent"];
  rationale: string;
  topCandidates: string[]; // Fix 9: top-2 near-miss ids when confidence < 0.8
  inventedValues: string[]; // Fix 8: values invented for unresolved placeholders
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export async function interpretAdStyle(
  ctx: SkillContext,
  input: InterpretAdStyleInput,
): Promise<DetectedPlan> {
  const messages = buildInterpretStylePrompt({
    userPrompt: input.userPrompt,
    hasProduct: input.hasProduct,
    hasPerson: input.hasPerson,
    productBrief: input.productBrief,
    personBrief: input.personBrief,
    adTypeMenu: renderAdTypeMenu(),
    hookMenu: renderHookMenu(),
    confusableRules: CONFUSABLE_RULES,
    unresolvedPlaceholders: input.unresolvedPlaceholders,
  });

  // Two attempts; a Zod/JSON failure is treated as a model error (retry once,
  // then fall back to the asset-implied default). The forgiving schema means
  // most replies parse; this guards the rare non-JSON reply.
  let plan: AdStylePlan | null = null;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    try {
      const reply = await ctx.openai.chat(messages, {
        backend: "claude",
        maxTokens: 1500,
      });
      plan = parseJsonObject<AdStylePlan>(reply, adStylePlanSchema);
    } catch {
      // try again, then fall through to the default below
    }
  }

  if (!plan) {
    return {
      adStyle: FALLBACK_AD_STYLE,
      adType: assetImpliedDefault(input.hasProduct),
      hooks: [],
      confidence: 0,
      assetIntent: { product: "unclear", person: "unclear" },
      rationale: "",
      topCandidates: [],
      inventedValues: [],
    };
  }

  return {
    adStyle: plan.adStyle.trim() || FALLBACK_AD_STYLE,
    adType: clampAdType(plan.adType, input.hasProduct),
    hooks: plan.hooks.map((h) => h.id),
    confidence: clamp01(plan.confidence),
    assetIntent: plan.assetIntent,
    rationale: (plan.rationale ?? "").trim(),
    // Surface near-miss candidates only when the model was actually unsure.
    topCandidates: clamp01(plan.confidence) < 0.8 ? plan.topCandidates : [],
    inventedValues: plan.inventedValues,
  };
}
