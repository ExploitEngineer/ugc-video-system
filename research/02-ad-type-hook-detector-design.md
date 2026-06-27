# Single-Call Ad-Type + Hook Detection Design for `interpretAdStyle`

## TL;DR

- Extend the existing single gpt-4.1 JSON call to emit `{ adStyle, adType, hooks[], confidence, assetIntent }` using `response_format: { type: "json_schema", strict: true }` (gpt-4.1 supports it; constrained decoding locks enums at the token level), with a registry clamp + Zod parse as a mandatory second line of defense.
- The 16-type menu and 16-hook menu are injected at runtime from the AdTypeDef/HookDef registry; the worker then runs a deterministic auto-downgrade reconciliation against ground-truth `hasProduct`/`hasPerson`, preserving look family and treating person-required types as synthesize-not-downgrade.
- Self-reported confidence is used ONLY as a coarse high/low gate (threshold 0.55) to fall back to the asset-implied default — never as a calibrated probability, because gpt-4.1 confidence is systematically overconfident.

## Key Findings (prompt-engineering validation)

- gpt-4.1 supports Structured Outputs with `json_schema` + `strict: true`. OpenAI's Structured Outputs guide states "Structured Outputs is available in our latest large language models, starting with GPT-4o," and the launch post confirms `json_schema` `response_format` is supported on "gpt-4o-2024-08-06 and later" — all GPT-4.1 variants are covered (the mid-2025 "Unsupported model" community reports were a temporary rollout bug, now resolved). Use strict mode, not legacy `json_object` — `json_object` guarantees only syntactic validity, not schema adherence.
- Structured Outputs schema limits (raised July 11, 2025, per OpenAI Devs): object properties 100→5,000; characters in string 15,000→120,000; enum values 500→1,000; total characters across string members in enums with >250 values 7,500→15,000; nesting depth remains 5. Our 16+16 menu is far under budget on every axis.
- gpt-4.1 follows instructions more literally than gpt-4o. Per the OpenAI GPT-4.1 Prompting Guide: "GPT-4.1 is trained to follow instructions more closely and more literally than its predecessors," and "If there are conflicting instructions, GPT-4.1 tends to follow the one closer to the end of the prompt." → Put the hard composition/clamp rules LAST and be explicit about what to do/not do.
- LLM option lists exhibit position bias. The Dartmouth study "Serial Position Effects of Large Language Models" (Guo & Vosoughi) found "a widespread prevalence of primacy effects across different models and tasks" (GPT versions, Llama 2, T5), with models tending "to favor the first options presented." → Keep a stable registry order and never rely on the model to stay in-menu; the registry clamp is mandatory.
- Structured Outputs guarantees shape, not truth: enums can't be hallucinated under strict mode, but the chosen value can still be wrong, and the "confidence always 0.99" failure mode is real. → Put reasoning fields BEFORE the decision in key order so the model reasons before committing.

---

## 1. OUTPUT SCHEMA

### TypeScript interface (packages/shared)

```ts
// AdType is the registry id, validated post-parse against AdTypeRegistry.
// Kept as plain string in the DTO (matches the Postgres text migration) but
// constrained to the registry enum in the Zod schema below.
export type AdTypeId =
  | "product-showcase"
  | "product-demo"
  | "testimonial"
  | "social-proof"
  | "problem-agitate-solve"
  | "before-after"
  | "comparison"
  | "unboxing"
  | "explainer"
  | "founder-pov"
  | "brand-story"
  | "lifestyle"
  | "promo-offer"
  | "announcement"
  | "brand-awareness"
  | "spokesperson";

export type HookId =
  | "problem-solution"
  | "pattern-interrupt"
  | "curiosity-gap"
  | "question"
  | "stat-shock"
  | "bold-claim"
  | "contrarian"
  | "testimonial"
  | "social-proof"
  | "before-after"
  | "demonstration"
  | "relatable-scenario"
  | "direct-callout"
  | "unexpected-comparison"
  | "negativity-bias"
  | "confession";

export type HookRole = "visual-lead" | "overlay";
export type IntentSignal = "implied" | "absent" | "unclear";

export interface SelectedHook {
  id: HookId; // registry hook id
  role: HookRole; // visual-lead = owns first frame; overlay = layered line/text
}

export interface AssetIntent {
  // What the PROMPT TEXT implies, independent of what was uploaded.
  product: IntentSignal;
  person: IntentSignal;
}

export interface AdStylePlan {
  adStyle: string; // ~20-word free-text creative brief (unchanged)
  adType: AdTypeId; // one of 16 registry ids (registry-validated post-parse)
  hooks: SelectedHook[]; // 1–2 hooks, composition-valid, default 1
  confidence: number; // 0–1 self-reported classification confidence (coarse gate only)
  assetIntent: AssetIntent; // prompt-implied asset signals, for reconciliation corroboration
  rationale?: string; // <=120 chars, why this type+hooks; debug only, not used downstream
}
```

### Zod sketch (packages/shared)

```ts
import { z } from "zod";

export const AD_TYPE_IDS = [
  "product-showcase",
  "product-demo",
  "testimonial",
  "social-proof",
  "problem-agitate-solve",
  "before-after",
  "comparison",
  "unboxing",
  "explainer",
  "founder-pov",
  "brand-story",
  "lifestyle",
  "promo-offer",
  "announcement",
  "brand-awareness",
  "spokesperson",
] as const;

export const HOOK_IDS = [
  "problem-solution",
  "pattern-interrupt",
  "curiosity-gap",
  "question",
  "stat-shock",
  "bold-claim",
  "contrarian",
  "testimonial",
  "social-proof",
  "before-after",
  "demonstration",
  "relatable-scenario",
  "direct-callout",
  "unexpected-comparison",
  "negativity-bias",
  "confession",
] as const;

export const AdTypeIdZ = z.enum(AD_TYPE_IDS);
export const HookIdZ = z.enum(HOOK_IDS);

export const SelectedHookZ = z.object({
  id: HookIdZ,
  role: z.enum(["visual-lead", "overlay"]),
});

export const AssetIntentZ = z.object({
  product: z.enum(["implied", "absent", "unclear"]),
  person: z.enum(["implied", "absent", "unclear"]),
});

export const AdStylePlanZ = z.object({
  adStyle: z.string().min(1).max(240),
  adType: AdTypeIdZ,
  hooks: z.array(SelectedHookZ).min(1).max(2),
  confidence: z.number().min(0).max(1),
  assetIntent: AssetIntentZ,
  rationale: z.string().max(120).optional(),
});
export type AdStylePlan = z.infer<typeof AdStylePlanZ>;
```

**Field meanings & downstream use**

- `adStyle` — unchanged ~20-word brief feeding the storyboard skill.
- `adType` — drives the registry/strategy that replaces the old `if (adType === "ugc")` branches; selects the look family and asset policy.
- `hooks` — 1–2 hooks injected into the first scene; `role` distinguishes the visual-lead owner of the first frame from the overlay/tone layer. Default array length 1.
- `confidence` — 0–1, self-reported. **Coarse gate only**: `< 0.55` triggers fallback to the asset-implied default type. Not stored as a probability, not surfaced to users.
- `assetIntent` — what the prompt text implies. Corroborates the asset policy and informs reconciliation (e.g. a "no-product brand film" prompt sets `product:"absent"` even when a product was uploaded — see §4d).
- `rationale` — short debug string, logged on the `runs` row, never used for control flow.

**JSON-key ordering note:** Schema/Zod key order is `adStyle → rationale → adType → hooks → confidence → assetIntent`. Under strict structured outputs, key order = generation order, so keep `adStyle` (the free reasoning brief) and `rationale` BEFORE `adType`/`hooks`/`confidence` so the model "thinks" before committing to the discrete decision and the confidence number. This mitigates the confidence-always-0.99 failure mode. (Note: strict mode requires `additionalProperties:false` and all keys in `required`; emit `rationale` as a required string and let it be empty rather than truly optional if you want to keep strict mode maximally simple.)

---

## 2. CLASSIFICATION RUBRIC (embeddable in system prompt)

### Per-ad-type cues

```
product-showcase  → hero/glamour shots of the product; "show off", "features", "benefits", "look amazing"; static beauty, NO narrative, NO steps. Default when product uploaded + vague prompt.
product-demo      → "how it works", "how to use", "in action", "step by step", "watch it [verb]"; visible function/use. vs showcase: motion/use present.
testimonial       → "review", "real customer", "honest opinion", "I tried", first-person peer praise, authentic phone feel. Legacy "ugc" lands here.
social-proof      → "5 stars", "10,000 reviews", "as seen in", press logos, ratings montage, NO single presenter. Aggregated proof.
problem-agitate-solve → opens on a named pain/frustration, "tired of", "sick of", "struggling with", then product fixes it. PAS arc.
before-after      → "before and after", "transformation", "results", "from X to Y". Visible contrast. Meta risk: no weight-loss/anti-aging.
comparison        → "vs", "compared to", "better than [competitor]", "the old way", "don't settle for". Side-by-side.
unboxing          → "unboxing", "what's inside", "just arrived", "first impressions", packaging reveal/reaction.
explainer         → "here's how", "the science", "why X matters", educational, motion-graphics/voiceover, no real footage needed.
founder-pov       → "I started", "our founder", "why we built", origin story, mission, first-person insider (not customer).
brand-story       → cinematic emotional brand narrative, values, "our journey", mood piece w/ voiceover + FILMED scenes. Legacy "inspirational" lands here.
lifestyle         → aspirational real-life use occasion, "imagine your morning", product woven into desirable scene, cinematic.
promo-offer       → price/discount/urgency: "% off", "BOGO", "sale ends", "limited time", "use code", hard CTA.
announcement      → "introducing", "now available", "launching", "new", "restock", "we partnered" — news WITHOUT a deal.
brand-awareness   → pure slogan/manifesto/value statement, kinetic typography, NO product shot + NO person. Canonical no-asset type.
spokesperson      → scripted host/presenter/AI avatar delivers a polished pitch to camera (NOT authentic peer review).
```

### Confusable-pair discriminators (place after the menu, explicit)

```
showcase vs demo        → static hero/benefit framing = showcase; visible in-use function/steps = demo.
testimonial vs spokesperson → genuine first-person CUSTOMER experience = testimonial; scripted/hosted pitch (incl AI avatar) = spokesperson.
brand-story vs brand-awareness → cinematic FILMED scenes = brand-story; typography/no footage, text-led = brand-awareness. "no product, no person, text-led" → brand-awareness.
promo-offer vs announcement → has price/discount/urgency = promo-offer; new-thing/news without a deal = announcement.
founder-pov vs testimonial → insider/founder ("why WE built") = founder-pov; customer ("I bought") = testimonial.
```

### Per-hook cues

```
problem-solution   → prompt names a frustrating moment the product later fixes ("tired of…").
pattern-interrupt  → "scroll-stopping", "unexpected", "weird", jarring opener. Universal secondary.
curiosity-gap      → "you won't believe", "the secret", withholds info, teases.
question           → prompt poses a direct question to viewer ("Ever wonder…?").
stat-shock         → a surprising number is central ("93% of…", "0 calories").
bold-claim         → confident almost-too-good promise ("the last X you'll ever buy").
contrarian         → contradicts a common belief ("everything you know about X is wrong").
testimonial(hook)  → real person delivers verdict mid-sentence to camera. NEEDS PERSON.
social-proof(hook) → stacked ratings/reviews/press/user-counts as graphics.
before-after(hook) → stark before→after contrast in the opener. No weight-loss split-screen.
demonstration      → opens mid-action with product visibly doing the thing. NEEDS PRODUCT.
relatable-scenario → hyper-specific "that's me" everyday POV moment.
direct-callout     → names the exact audience ("Attention busy moms…").
unexpected-comparison → likens product to something surprising/unrelated.
negativity-bias    → warning / "you're doing it wrong" framing.
confession         → person admits something candid/counterintuitive. NEEDS PERSON.
```

---

## 3. DETECTOR PROMPT DESIGN

**API config:** gpt-4.1, `response_format: { type: "json_schema", json_schema: { name: "ad_style_plan", strict: true, schema: <AdStylePlan JSON Schema with additionalProperties:false, all fields required> } }`, temperature 0.2. Hooks array uses `minItems:1, maxItems:2`. Enums for `adType`, `hooks[].id`, `hooks[].role`, `assetIntent.*` are locked at the token level by constrained decoding, but the registry clamp (§4e) still runs because (a) strict-mode failures are still occasionally observed in production and (b) menu↔registry drift must be caught.

### System message template

```
You are an ad-creative classifier for an AI ad-video generator.
Given a user's free-text prompt plus ground-truth flags about which assets
were uploaded, you output ONE ad type, 1–2 opening hooks, a short creative
brief, an asset-intent reading, and a confidence score. Return ONLY JSON
matching the provided schema. Do not add commentary.

## AD TYPE MENU (choose exactly one `id`)
{{AD_TYPE_MENU}}

## CONFUSABLE PAIRS (decide deliberately)
{{CONFUSABLE_RULES}}

## HOOK MENU (choose 1–2 `id`s; default 1)
{{HOOK_MENU}}

## TASK 1 — adStyle
Write a vivid ~20-word creative brief describing the look and feel.

## TASK 2 — adType
Pick the single best `id` from the AD TYPE MENU using the cues. Use the
ground-truth hasProduct/hasPerson flags as strong evidence. If the prompt
is vague or empty: if hasProduct is true, choose product-showcase; else
choose brand-awareness.

## TASK 3 — hooks (composition rules — FOLLOW EXACTLY)
- Choose 1 hook by default; choose 2 only if a second clearly adds value.
- If 2 hooks: EXACTLY ONE must have role "visual-lead" and the other
  "overlay". Never two visual-leads.
- Visual-lead set: problem-solution, demonstration, before-after,
  testimonial, confession, relatable-scenario. (pattern-interrupt may be
  either; mark it the role it plays.) All others are overlay.
- Collapse these mutually-exclusive sets to ONE member each:
  proof {testimonial, social-proof}; spoken-opening {testimonial,
  confession}; problem-framing {problem-solution, negativity-bias};
  product-visibility {problem-solution, demonstration}; strong-claim
  {bold-claim, contrarian}.
- Precedence when collapsing: (1) prefer a hook in the chosen type's
  defaultHooks; (2) else prefer higher-confidence fit; (3) tie-break
  visual-lead over overlay.
- Prefer the chosen type's defaultHooks unless the prompt clearly signals
  another allowed hook.
- Asset guardrail (use the ground-truth flags): if hasPerson is false,
  do NOT pick testimonial or confession; if hasProduct is false, do NOT
  pick demonstration. Substitute the type's first compatible default.

## TASK 4 — assetIntent
Independently of what was uploaded, read whether the PROMPT TEXT implies a
product ("implied"/"absent"/"unclear") and a person ("implied"/"absent"/
"unclear"). "absent" means the prompt actively describes a product-free or
person-free ad (e.g. "text-only brand film"), not merely silence — silence
is "unclear".

## TASK 5 — confidence
Report 0–1 confidence in the adType choice. Be honest: use <0.5 when the
prompt is vague or two types fit equally. Do not default to high confidence.

## OUTPUT
Return ONLY the JSON object. After the JSON, output nothing further.
```

### User message structure

```
USER PROMPT:
"""{{USER_FREE_TEXT}}"""

GROUND TRUTH (uploaded assets — authoritative):
hasProduct: {{HAS_PRODUCT}}
hasPerson: {{HAS_PERSON}}

PRODUCT BRIEF (vision-derived, may be empty): {{PRODUCT_BRIEF}}
PERSON BRIEF (vision-derived, may be empty): {{PERSON_BRIEF}}
```

### Rendered menu rows (generated from the registry)

```
# AD_TYPE_MENU row, rendered from AdTypeDef:
- product-demo | look: demo_clean | product:R person:o | Shows the product
  being used / how it works, function-first, step-by-step. CUES: "how it
  works","in action","step by step". defaultHooks: demonstration,
  problem-solution.

# HOOK_MENU row, rendered from HookDef:
- demonstration | role: visual-lead | needs: product | opens mid-action with
  the product visibly doing the impressive thing. CUES: "watch it [verb]".
```

A renderer (`renderAdTypeMenu(registry)`, `renderHookMenu(registry)`) builds these blocks from the same `AdTypeDef[]`/`HookDef[]` arrays that back the Zod enums, so the menu can never drift from the validated id set. Menu order = stable registry order (kept constant to avoid silent position-bias shifts between deploys).

---

## 4. DISAMBIGUATION + FALLBACK RULES

**(a) Default type when prompt is vague/empty.** If `hasProduct` → `product-showcase` (a product was uploaded and showcase is the lowest-commitment product-required-capable demo_clean type that always has valid assets). Else → `brand-awareness` (canonical no-asset type, always valid). Rationale: never leave the pipeline without a buildable type; both defaults are asset-safe by construction.

**(b) Default hooks.** Use the resolved type's `defaultHooks[0]` as the single default hook (role per the visual-lead/overlay table). For the two defaults: product-showcase → `bold-claim` (overlay); brand-awareness → `pattern-interrupt` (visual-lead-capable).

**(c) Multiple types mentioned.** Precedence order: (1) **asset match** — prefer a type compatible with uploaded assets; (2) **explicitness** — a literal type signal ("unboxing", "% off") beats an implied one; (3) **funnel stage** — if still tied, prefer the later-funnel/conversion type (promo-offer > comparison > showcase) because the generator is used predominantly for performance ads. Single type out always.

**(d) Prompt contradicts uploaded assets.**

- "No-product brand film" but a product WAS uploaded: trust the prompt's creative intent for the look (route brand-awareness/brand-story), set `assetIntent.product:"absent"`. The uploaded product simply goes unused; the conditional-skip mechanism skips the product-reference step. No downgrade (no asset is _missing_).
- Product-centric prompt but NO product uploaded: this is the downgrade trigger (§5). The prompt's `assetIntent.product:"implied"` plus `hasProduct:false` confirms the mismatch; reconcile to nearest asset-compatible neighbor.
- Person mismatch never downgrades — see §5 person-synthesis exception.

**(e) Registry clamp (runs after Zod parse).**

```
function clampAdType(raw: string): AdTypeId {
  if (AD_TYPE_IDS.includes(raw)) return raw;            // exact
  const norm = kebab(raw.toLowerCase().trim());
  if (AD_TYPE_IDS.includes(norm)) return norm;          // normalized
  const near = nearestByLevenshtein(norm, AD_TYPE_IDS); // edit distance <=2
  if (near.distance <= 2) return near.id;
  return assetImpliedDefault(hasProduct);               // give up → default
}
// hooks: same pattern per id; drop any hook not in resolvedType.allowedHooks;
// if hooks empty after dropping, seed with resolvedType.defaultHooks[0].
```

Under strict structured outputs the enum is token-locked so `raw` is almost always valid; the clamp exists for the rare strict-mode miss and for menu/registry drift. Unknown/misspelled → nearest by edit distance ≤2, else asset-implied default.

**(f) Confidence gate.** If `confidence < 0.55`, override `adType` with the asset-implied default (§4a) UNLESS the low-confidence pick is itself asset-compatible AND shares the look family of the default (then keep it — low confidence between two valid neighbors is not dangerous). Threshold 0.55 chosen as a coarse high/low split, not a calibrated probability, because gpt-4.1 self-reported confidence is systematically overconfident. Confidence is never shown to users and never persisted as a probability.

---

## 5. ASSET RECONCILIATION ALGORITHM (worker, post-parse)

```
function reconcile(plan, hasProduct, hasPerson):
    type = clampAdType(plan.adType)
    def = registry[type]

    # 1. PERSON-REQUIRED + NO PERSON → synthesize, do NOT downgrade
    if def.person == REQUIRED and not hasPerson:
        plan.synthesizePerson = true        # "invent the person from product" path
        # type unchanged

    # 2. PRODUCT-REQUIRED + NO PRODUCT → downgrade (only missing PRODUCT downgrades)
    if def.product == REQUIRED and not hasProduct:
        type = downgradeTarget(type)        # look-preserving chain, see table
        def = registry[type]

    # 3. Re-apply hook asset-guardrail against FINAL type + ground truth
    plan.hooks = stripIncompatibleHooks(plan.hooks, def, hasProduct, hasPerson)
    if plan.hooks.isEmpty(): plan.hooks = [firstCompatibleDefault(def, hasProduct, hasPerson)]
    plan.hooks = enforceComposition(plan.hooks)   # max2, one visual+one overlay

    # 4. confirm-mode pause gate: persist plan to runs row; if confirm-mode on,
    #    halt at the existing post-reference / post-storyboard gate for user approval.
    return {type, plan}

# downgradeTarget: nearest type sharing the SAME look family that is
# asset-compatible with current uploads; if none, fall toward graphic_text
# neither-types, terminal = brand-awareness.
function downgradeTarget(type):
    return PER_TYPE_DOWNGRADE_CHAIN[type].firstWhere(t => assetCompatible(t, uploads))
                                          ?? "brand-awareness"
```

**`stripIncompatibleHooks`:** drop `testimonial`/`confession` if `!hasPerson`; drop `demonstration` if `!hasProduct`; drop any hook not in `def.allowedHooks`.

### Per-type downgrade table (no product uploaded)

The 7 product-required types and their look-preserving downgrade targets. `demo_clean` has no neither-capable member, so demo_clean types route through their nearest text-capable cousin to graphic_text, terminal `brand-awareness`.

| Source (look)                         | Downgrade chain (first asset-compatible wins)                         | Terminal        |
| ------------------------------------- | --------------------------------------------------------------------- | --------------- |
| product-showcase (demo_clean)         | → explainer (graphic_text) → brand-awareness                          | brand-awareness |
| product-demo (demo_clean)             | → explainer (graphic_text) → brand-awareness                          | brand-awareness |
| before-after (demo_clean)             | → social-proof (graphic_text) → brand-awareness                       | brand-awareness |
| comparison (demo_clean)               | → explainer (graphic_text) → brand-awareness                          | brand-awareness |
| unboxing (ugc_authentic)              | → announcement (graphic_text) → brand-awareness                       | brand-awareness |
| problem-agitate-solve (ugc_authentic) | → explainer (graphic_text) → brand-awareness                          | brand-awareness |
| lifestyle (cinematic_polished)        | → brand-story (cinematic_polished, neither-capable) → brand-awareness | brand-awareness |

Note: `lifestyle` preserves look perfectly (brand-story is cinematic*polished AND neither-capable). The demo_clean types cannot preserve look (no neither-capable demo_clean type exists), so they prefer the closest \_intent* neighbor in graphic_text (explainer for "show/teach", social-proof for before-after's proof intent, announcement for unboxing's novelty intent) before the brand-awareness terminal.

---

## 6. WORKED EXAMPLES (eval fixtures)

```json
[
  {
    "name": "legacy-ugc-preserved",
    "prompt": "A real customer talking to the camera about how much they love these running shoes",
    "input": { "hasProduct": true, "hasPerson": true },
    "expected": {
      "adType": "testimonial",
      "hooks": [{ "id": "testimonial", "role": "visual-lead" }],
      "assetIntent": { "product": "implied", "person": "implied" },
      "adStyle": "Authentic handheld phone-shot peer review, natural lighting, sincere first-person praise for the running shoes",
      "confidence": 0.9
    },
    "postReconcile": { "adType": "testimonial", "synthesizePerson": false }
  },
  {
    "name": "legacy-inspirational-preserved",
    "prompt": "An emotional cinematic story about chasing your dreams, with our brand as the quiet companion",
    "input": { "hasProduct": false, "hasPerson": false },
    "expected": {
      "adType": "brand-story",
      "hooks": [{ "id": "curiosity-gap", "role": "overlay" }],
      "assetIntent": { "product": "unclear", "person": "unclear" },
      "adStyle": "Polished cinematic mood piece, warm color grade, voiceover-led emotional journey about chasing dreams",
      "confidence": 0.78
    },
    "postReconcile": { "adType": "brand-story", "synthesizePerson": false }
  },
  {
    "name": "ambiguous-showcase-vs-demo",
    "prompt": "Make my blender look amazing while it crushes ice",
    "input": { "hasProduct": true, "hasPerson": false },
    "expected": {
      "adType": "product-demo",
      "hooks": [{ "id": "demonstration", "role": "visual-lead" }],
      "assetIntent": { "product": "implied", "person": "unclear" },
      "adStyle": "Clean studio tabletop shots of the blender crushing ice in action, glossy slow-motion product hero",
      "confidence": 0.62
    },
    "note": "Visible in-use function (crushing ice) tips showcase→demo per confusable rule.",
    "postReconcile": { "adType": "product-demo", "synthesizePerson": false }
  },
  {
    "name": "ambiguous-promo-vs-announcement",
    "prompt": "We're launching our new summer collection — and it's 30% off this weekend only",
    "input": { "hasProduct": true, "hasPerson": false },
    "expected": {
      "adType": "promo-offer",
      "hooks": [{ "id": "direct-callout", "role": "overlay" }],
      "assetIntent": { "product": "implied", "person": "unclear" },
      "adStyle": "High-energy graphic promo, bold kinetic typography, countdown urgency on a 30%-off summer collection",
      "confidence": 0.7
    },
    "note": "Presence of price/discount/urgency forces promo-offer over announcement.",
    "postReconcile": { "adType": "promo-offer", "synthesizePerson": false }
  },
  {
    "name": "no-product-downgrade",
    "prompt": "Show this gadget in action solving the morning rush",
    "input": { "hasProduct": false, "hasPerson": false },
    "expected": {
      "adType": "product-demo",
      "hooks": [{ "id": "demonstration", "role": "visual-lead" }],
      "assetIntent": { "product": "implied", "person": "unclear" },
      "adStyle": "Fast clean demo of the gadget easing a chaotic morning routine, crisp tabletop product footage",
      "confidence": 0.66
    },
    "note": "Detector picks product-demo; worker downgrades because hasProduct=false.",
    "postReconcile": {
      "adType": "explainer",
      "hooks": [{ "id": "question", "role": "overlay" }],
      "note": "product-demo→explainer (graphic_text). demonstration stripped (needs product); seeded explainer default question."
    }
  },
  {
    "name": "person-required-no-person-synthesize",
    "prompt": "Our founder explains why she started the company",
    "input": { "hasProduct": true, "hasPerson": false },
    "expected": {
      "adType": "founder-pov",
      "hooks": [{ "id": "confession", "role": "visual-lead" }],
      "assetIntent": { "product": "unclear", "person": "implied" },
      "adStyle": "Intimate cinematic founder monologue, soft natural light, candid origin story told first-person",
      "confidence": 0.84
    },
    "note": "Person required but none uploaded → synthesize, NOT downgrade.",
    "postReconcile": {
      "adType": "founder-pov",
      "synthesizePerson": true,
      "hooks": [{ "id": "confession", "role": "visual-lead" }],
      "note": "confession kept because person will be synthesized."
    }
  },
  {
    "name": "contradiction-no-product-brand-film-but-product-uploaded",
    "prompt": "A text-only brand manifesto, just our slogan and bold words, no product shots",
    "input": { "hasProduct": true, "hasPerson": false },
    "expected": {
      "adType": "brand-awareness",
      "hooks": [{ "id": "pattern-interrupt", "role": "visual-lead" }],
      "assetIntent": { "product": "absent", "person": "absent" },
      "adStyle": "Bold kinetic typography manifesto, high-contrast slogan animation, no product or person on screen",
      "confidence": 0.8
    },
    "note": "Prompt actively excludes product → assetIntent.product=absent; uploaded product unused via skip-step. No downgrade (nothing missing).",
    "postReconcile": { "adType": "brand-awareness", "synthesizePerson": false }
  },
  {
    "name": "spokesperson-vs-testimonial-scripted",
    "prompt": "A polished AI avatar host pitches our SaaS features straight to camera",
    "input": { "hasProduct": false, "hasPerson": false },
    "expected": {
      "adType": "spokesperson",
      "hooks": [{ "id": "direct-callout", "role": "overlay" }],
      "assetIntent": { "product": "unclear", "person": "implied" },
      "adStyle": "Polished presenter-led pitch, studio lighting, confident scripted delivery of SaaS features to camera",
      "confidence": 0.8
    },
    "note": "Scripted/hosted (AI avatar) → spokesperson, not testimonial. Person required → synthesize.",
    "postReconcile": { "adType": "spokesperson", "synthesizePerson": true }
  },
  {
    "name": "vague-empty-with-product",
    "prompt": "make me an ad",
    "input": { "hasProduct": true, "hasPerson": false },
    "expected": {
      "adType": "product-showcase",
      "hooks": [{ "id": "bold-claim", "role": "overlay" }],
      "assetIntent": { "product": "unclear", "person": "unclear" },
      "adStyle": "Clean hero product showcase, glossy studio lighting, confident benefit-forward presentation",
      "confidence": 0.35
    },
    "note": "Vague prompt + product uploaded → default product-showcase. Confidence<0.55 already lands on the asset-implied default, so no override.",
    "postReconcile": { "adType": "product-showcase", "synthesizePerson": false }
  },
  {
    "name": "vague-empty-no-assets",
    "prompt": "",
    "input": { "hasProduct": false, "hasPerson": false },
    "expected": {
      "adType": "brand-awareness",
      "hooks": [{ "id": "pattern-interrupt", "role": "visual-lead" }],
      "assetIntent": { "product": "unclear", "person": "unclear" },
      "adStyle": "Bold brand statement in kinetic typography, striking motion graphics, no live footage",
      "confidence": 0.3
    },
    "postReconcile": { "adType": "brand-awareness", "synthesizePerson": false }
  }
]
```

## Recommendations

1. **Ship with strict structured outputs + registry clamp + Zod parse — all three.** Strict mode token-locks the enums but is not infallible in production and can drift from the registry; the clamp and Zod are the safety net. Treat a Zod parse failure as a model error: log it, retry once, then fall back to the asset-implied default.
2. **Keep the menu generated from the registry, never hard-coded.** One renderer feeding both the prompt block and the Zod enum guarantees they cannot diverge.
3. **Order JSON keys reasoning-first** (`adStyle`/`rationale` before `adType`/`hooks`/`confidence`) and **put composition + clamp rules at the END of the system prompt**, since the OpenAI GPT-4.1 Prompting Guide states the model "tends to follow the one closer to the end of the prompt" when instructions conflict, and key order = generation order under strict mode.
4. **Use confidence only as a 0.55 high/low gate.** Re-evaluate the threshold after collecting ~200 labeled runs; if low-confidence picks are usually correct, lower it; if the model is confidently wrong on a type pair, add an explicit confusable rule rather than touching the threshold.
5. **Lean on confirm-mode as the human-in-the-loop.** No new prompting UI; the existing post-reference and post-storyboard pause gates are where a user can correct a mis-reconciled type.
6. **Build the eval set first.** The §6 fixtures are the seed; expand to ≥5 prompts per type and per confusable pair before tuning the prompt.

## Caveats

- gpt-4.1 self-reported confidence is poorly calibrated and overconfident; never treat it as a probability. A JMIR study across 9 LLMs on 2,522 USMLE/MedQA questions found all chatbots "consistently expressed high levels of confidence… ranging from 90 (Llama 3.1-70b) to 100 (GPT-3.5)," yet "expressed confidence failed to predict response accuracy" (AUROC 0.52–0.68). A separate radiology DXIT study found GPT-4 reported ~84–87% confidence even on incorrect answers (87.1% on correct vs 84.0% on incorrect) while only achieving 58.5% accuracy. The 0.55 gate is a coarse heuristic only.
- Strict structured outputs guarantee shape, not correctness: enum values can't be hallucinated but the _chosen_ value can be wrong, so the deterministic reconciliation + clamp must own all safety-critical decisions, not the model.
- Long option menus carry primacy/recency position bias (Guo & Vosoughi report "a widespread prevalence of primacy effects across different models and tasks"); keep menu order stable across deploys so classification behavior doesn't silently shift, and rely on the discriminative cues (not position) for accuracy.
- The demo_clean look family has no neither-capable member, so no-product downgrades from showcase/demo/before-after/comparison cannot preserve look; they intentionally jump to graphic_text. If look preservation on these is critical, consider adding a demo_clean text-capable variant rather than overriding the chain.
- gpt-4.1 follows instructions literally; any ambiguity or contradiction in the prompt blocks will surface as misclassification. Keep the cue lists tight and non-overlapping and test after every prompt edit.
- The two Meta-policy-risk types (before-after for weight-loss/anti-aging, comparison for personal attributes) are flagged in the taxonomy but not enforced by this detector; add a downstream policy check before video generation if those verticals are in scope.
