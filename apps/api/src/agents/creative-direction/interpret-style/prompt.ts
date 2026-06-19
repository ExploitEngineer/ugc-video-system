// Prompt module for the Creative Direction Agent's single-call detector.
//
// Turns the raw user prompt + ground-truth upload flags into ONE JSON object:
// a style-agnostic creative brief (`adStyle`) PLUS the classified ad type, 1–2
// opening hooks, a confidence score, and an asset-intent reading. The registry
// menus are injected at runtime so the prompt can never drift from the validated
// id set. Reasoning-first key order; composition + clamp rules LAST (the model
// weights later instructions more heavily). No provider JSON-schema mode — the
// reasoning backend is Claude, so we lean on a strict-JSON PROMPT + a forgiving
// parser + the deterministic clamp/reconcile for correctness.

import type { ChatMessage } from "../../../providers/openai/index.js";

export interface InterpretStylePromptInput {
  userPrompt: string;
  hasProduct: boolean;
  hasPerson: boolean;
  productBrief?: string;
  personBrief?: string;
  /** Rendered from the registry (menu.ts) so it never drifts from the id set. */
  adTypeMenu: string;
  hookMenu: string;
  confusableRules: string;
}

export function buildInterpretStylePrompt(
  input: InterpretStylePromptInput,
): ChatMessage[] {
  const system = [
    "You are an ad-creative classifier for an AI ad-video generator.",
    "Given a user's free-text prompt plus ground-truth flags about which assets",
    "were uploaded, output ONE ad type, 1–2 opening hooks, a short creative brief,",
    "an asset-intent reading, and a confidence score. Return ONLY a single JSON",
    "object. Do not add commentary or markdown fences.",
    "",
    "## AD TYPE MENU (choose exactly one `id`)",
    input.adTypeMenu,
    "",
    "## CONFUSABLE PAIRS (decide deliberately)",
    input.confusableRules,
    "",
    "## HOOK MENU (choose 1–2 `id`s; default 1)",
    input.hookMenu,
    "",
    "## TASK 1 — adStyle",
    "Write a vivid ~20-word creative brief describing the look and feel. Be",
    "style-AGNOSTIC (honor an explicitly named style; otherwise infer a fitting,",
    "neutral commercial direction). Describe the CREATIVE TREATMENT, not the literal",
    "product or prompt.",
    "",
    "## TASK 2 — adType",
    "Pick the single best `id` from the AD TYPE MENU using the cues. Use the",
    "ground-truth hasProduct/hasPerson flags as strong evidence. If the prompt is",
    "vague or empty: if hasProduct is true choose product-showcase, else choose",
    "brand-awareness.",
    "",
    "## TASK 3 — hooks (composition rules — FOLLOW EXACTLY)",
    "- Choose 1 hook by default; choose 2 only if a second clearly adds value.",
    '- Each hook is {"id": <hook id>, "role": "visual_lead" | "overlay"}.',
    '- If 2 hooks: EXACTLY ONE has role "visual_lead" and the other "overlay".',
    "  Never two visual_leads.",
    "- Visual-lead-capable hooks: problem-solution, demonstration, before-after,",
    "  testimonial, confession, relatable-scenario (pattern-interrupt may be either).",
    "  All others are overlay.",
    "- Collapse these mutually-exclusive sets to ONE member each: {testimonial,",
    "  social-proof}; {testimonial, confession}; {problem-solution, negativity-bias};",
    "  {problem-solution, demonstration}; {bold-claim, contrarian}.",
    "- Prefer the chosen type's defaultHooks unless the prompt clearly signals",
    "  another allowed hook.",
    "- Asset guardrail (use the ground-truth flags): if hasPerson is false do NOT",
    "  pick testimonial or confession; if hasProduct is false do NOT pick",
    "  demonstration. Substitute the type's first compatible default.",
    "",
    "## TASK 4 — assetIntent",
    'Independently of what was uploaded, read whether the PROMPT TEXT implies a',
    'product ("implied"/"absent"/"unclear") and a person ("implied"/"absent"/',
    '"unclear"). "absent" means the prompt actively describes a product-free or',
    'person-free ad (e.g. "text-only brand film"), not mere silence — silence is',
    '"unclear".',
    "",
    "## TASK 5 — confidence",
    "Report 0–1 confidence in the adType choice. Be honest: use <0.5 when the",
    "prompt is vague or two types fit equally. Do not default to high confidence.",
    "",
    "## OUTPUT — return ONLY this JSON object, keys in this order:",
    '{"adStyle": "<~20-word brief>", "rationale": "<=120 chars, why this type+hooks>",',
    '"adType": "<one menu id>", "hooks": [{"id": "<hook id>", "role": "visual_lead" | "overlay"}],',
    '"confidence": <0..1>, "assetIntent": {"product": "implied"|"absent"|"unclear",',
    '"person": "implied"|"absent"|"unclear"}}',
    "After the JSON, output nothing further.",
  ].join("\n");

  const user = [
    "USER PROMPT:",
    `"""${input.userPrompt}"""`,
    "",
    "GROUND TRUTH (uploaded assets — authoritative):",
    `hasProduct: ${input.hasProduct}`,
    `hasPerson: ${input.hasPerson}`,
    "",
    `PRODUCT BRIEF (vision-derived, may be empty): ${input.productBrief ?? ""}`,
    `PERSON BRIEF (vision-derived, may be empty): ${input.personBrief ?? ""}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
