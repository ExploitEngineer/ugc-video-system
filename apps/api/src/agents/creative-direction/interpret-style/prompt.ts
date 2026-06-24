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
  /** Unresolved bracket placeholders found in the prompt (Fix 8), e.g. ["[PRICE]"]. */
  unresolvedPlaceholders?: string[];
}

export function buildInterpretStylePrompt(
  input: InterpretStylePromptInput,
): ChatMessage[] {
  // When the prompt left fill-in slots, tell the model NOT to fabricate them as
  // fact and to record anything it does surface into `inventedValues` (Fix 8).
  const placeholderBlock =
    (input.unresolvedPlaceholders?.length ?? 0) > 0
      ? [
          "",
          "## UNRESOLVED PLACEHOLDERS — the prompt left fill-in slots; do NOT fabricate them as fact",
          `Slots found: ${input.unresolvedPlaceholders?.join(", ")}.`,
          "- Do NOT invent a specific statistic, price, brand name or URL to fill these.",
          "- If you DO surface any concrete value for a slot (in adStyle or rationale),",
          "  record each invented value verbatim in `inventedValues` so it is flagged.",
          "- A fabricated numeric statistic must NEVER be presented as a factual claim. If a",
          "  stat slot is unresolved, prefer a NON-NUMERIC hook (curiosity-gap, question,",
          "  relatable-scenario) over one that leans on the missing number.",
        ]
      : [];

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
    "product or prompt. Do not invent a specific statistic, price, brand name or URL",
    "the prompt did not give.",
    "",
    "## TASK 2 — adType",
    "FIRST — EXPLICIT NAME WINS. If the user NAMES an ad type or a well-known",
    "synonym, choose THAT type with HIGH confidence (>=0.85); an explicit name",
    "OVERRIDES all content inference. Map synonyms to the core types:",
    "  a SERVICE / software / SaaS / app / platform / agency / 'we provide…' /",
    "    'we help…' with NO physical product or person to show -> service;",
    "  'UGC' / 'user-generated' / 'testimonial' / 'review' / 'honest review' / 'talking to camera' -> testimonial;",
    "  'demo' / 'in action' / 'watch it work' / 'how it works' / 'unboxing' / 'showcase' / 'hero shots' / 'show off' -> product-demo;",
    "  'founder' / 'why I built' / 'why we built' / 'spokesperson' / 'presenter pitch' / 'VSL' -> founder-pov;",
    "  'lifestyle' / 'a day in the life' / 'in real life' -> lifestyle;",
    "  'brand story' / 'origin story' / 'manifesto' -> brand-story;",
    "  'inspirational' / 'mood piece' / 'mood film' -> inspirational.",
    "Otherwise, pick the single best `id` from the AD TYPE MENU using the cues. Use",
    "the ground-truth hasProduct/hasPerson flags as strong evidence. If the prompt",
    "is vague or empty AND no type is named: if hasProduct is true choose",
    "product-demo, else choose service (the default service skit).",
    "If the script implies two or more people in a scene, still pick ONE type by the",
    "DOMINANT look: talking-to-camera / candid → testimonial or founder-pov;",
    "cinematic scenes → lifestyle, brand-story or inspirational.",
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
    "When confidence is below 0.8, set `topCandidates` to the TWO closest ad-type",
    "ids (best first, your chosen id included) so the near-miss is visible;",
    "otherwise leave `topCandidates` an empty array.",
    ...placeholderBlock,
    "",
    "## OUTPUT — return ONLY this JSON object, keys in this order:",
    '{"adStyle": "<~20-word brief>", "rationale": "<=120 chars, why this type+hooks>",',
    '"adType": "<one menu id>", "hooks": [{"id": "<hook id>", "role": "visual_lead" | "overlay"}],',
    '"confidence": <0..1>, "topCandidates": ["<id>", "<id>"], "inventedValues": ["<value>"],',
    '"assetIntent": {"product": "implied"|"absent"|"unclear",',
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
