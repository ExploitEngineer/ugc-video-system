// Creative Direction Agent skill: describe the product.
//
// One vision LLM call at the start of a run (reference phase), run in parallel
// with the person brief. The orchestrator persists the result to
// `runs.product_brief` and threads it through `SkillContext.productBrief` — the
// canonical TEXT anchor for the product identity, consumed by the storyboard and
// the Critic so a drifting image can't silently swap the product.

import { parseJsonObject } from "../../json.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import type { ProductUse, SkillContext } from "../../types.js";
import { buildProductBriefPrompt, type ProductBriefPlan } from "./prompt.js";

export interface DescribeProductInput {
  userPrompt: string;
  productUpload: ImageRef;
}

/** Coerce a possibly-partial LLM `productUse` into a complete, trimmed object. */
function normalizeProductUse(raw: Partial<ProductUse> | undefined): ProductUse {
  return {
    accessVerb: raw?.accessVerb?.trim() ?? "",
    changedState: raw?.changedState?.trim() ?? "",
    persistenceCue: raw?.persistenceCue?.trim() ?? "",
    functionSignal: raw?.functionSignal?.trim() ?? "",
    useVerb: raw?.useVerb?.trim() ?? "",
  };
}

export async function describeProduct(
  ctx: SkillContext,
  input: DescribeProductInput,
): Promise<{ productBrief: string; productUse: ProductUse }> {
  const reply = await ctx.openai.chat(
    buildProductBriefPrompt({
      userPrompt: input.userPrompt,
      adStyle: ctx.adStyle,
      productUpload: input.productUpload,
    }),
    // Claude Sonnet 4.6: stronger label/marking OCR + disciplined JSON for the
    // product identity anchor; falls back to gpt-4.1 if OpenRouter is unset.
    { jsonMode: true, backend: "claude" },
  );
  const plan = parseJsonObject<ProductBriefPlan>(reply);
  return {
    productBrief: plan.productBrief?.trim() ?? "",
    productUse: normalizeProductUse(plan.productUse),
  };
}
