// Prompt module for the Creative Direction Agent's product-describe planner.
//
// Runs once at the start of a run (reference phase), in parallel with the person
// brief. Looks at the UPLOADED product image (vision) and emits a concise,
// factual TEXT description of the product itself — its identity, materials,
// colors and distinctive markings. This brief is the canonical TEXT ANCHOR for
// the product: it rides downstream into the storyboard script + image prompt and
// the Critic, so that even if a generated sheet drifts, every later step still
// knows exactly what the product IS (e.g. "a matte-black stainless steel gym
// water bottle", never a hallucinated bracelet).

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";
import type { ProductUse } from "../../types.js";

export interface ProductBriefPromptInput {
  userPrompt: string;
  adStyle: string;
  /** The uploaded product image — attached for vision. */
  productUpload: ImageRef;
}

/** Shape the LLM must return as strict JSON. */
export interface ProductBriefPlan {
  /** One concise, factual description of the product itself. */
  productBrief: string;
  /**
   * How the product is REALLY operated — derived here so the storyboard STILL
   * can bake a physically-correct causal state machine (e.g. cap off BEFORE
   * drinking, and it stays off). See {@link ProductUse}.
   */
  productUse: ProductUse;
}

export function buildProductBriefPrompt({
  userPrompt,
  adStyle,
  productUpload,
}: ProductBriefPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";

  const system = [
    "You are the Creative Direction Agent for an AI ad-video generator.",
    "A product image is attached. Describe the PRODUCT ITSELF — factually and",
    "concretely — so a downstream skill that may NOT see the image still knows",
    "exactly what it is. This is a forensic identity anchor, not marketing copy.",
    "",
    "Cover, concretely: what the product IS (its category / common name, e.g.",
    "'stainless-steel gym water bottle', 'leather wristwatch', 'running shoe'),",
    "its form factor and proportions, materials and finish, its exact colors, and",
    "any distinctive markings — brand name, wordmarks, logos, text, numerals or",
    "patterns visible on it. Be specific and unambiguous about the category so it",
    "can NEVER be confused with a different kind of product.",
    "",
    "Describe ONLY what is actually visible. Do NOT invent a brand, features or",
    "text that are not on the product. Do NOT describe a person, background or",
    "packaging — just the product.",
    "",
    "ALSO work out the USE-SEQUENCE — how a real person physically operates THIS",
    "product — so a later step can show it being used in a physically POSSIBLE",
    "order. Reason from the product's real form:",
    "- `useVerb`: the core use, e.g. 'drinks from', 'checks the time on', 'wears',",
    "  'sprays onto the skin', 'walks in'. ALWAYS fill this.",
    "- `functionSignal`: a VISIBLE sign the product is genuinely working, e.g.",
    "  'water level visibly drops', 'the second hand sweeps', 'the sole flexes',",
    "  'mist settles on the skin'. ALWAYS fill this.",
    "- `accessVerb`: the enabling PREP action that must happen BEFORE the use, e.g.",
    "  'twists off the cap', 'flips the lid open', 'unclasps the strap'. Leave it",
    "  an EMPTY string \"\" when the product needs NO prep to use (e.g. a watch,",
    "  shoe, ring or glasses that is simply worn). Do NOT invent a prep step.",
    "- `changedState`: the persistent state right after that prep, e.g. 'cap off,",
    "  set on the counter'. Empty \"\" when `accessVerb` is empty.",
    "- `persistenceCue`: how to restate, later, that the changed state still holds,",
    "  e.g. 'cap still off beside her'. Empty \"\" when `accessVerb` is empty.",
    "",
    "Return STRICT JSON only, no prose, matching:",
    '{ "productBrief": "<one concise paragraph, ~30-50 words, naming the product category, materials, colors and distinctive markings>", "productUse": { "accessVerb": "<prep verb or empty>", "changedState": "<state after prep or empty>", "persistenceCue": "<restate-persistence or empty>", "functionSignal": "<visible working sign>", "useVerb": "<the core use>" } }',
  ].join("\n");

  const user: ChatMessage = {
    role: "user",
    content: [
      `Ad style: ${style}`,
      `User prompt: ${userPrompt}`,
      "The product image is attached. Return the product brief as strict JSON.",
    ].join("\n"),
    images: [productUpload],
  };

  return [{ role: "system", content: system }, user];
}
