# Ad-Video Type Taxonomy & Code Registry Schema for an AI Ad-Video Generator

## TL;DR

- Replace the binary `adType` enum with a **16-type registry** keyed by stable kebab-case ids, each carrying a discriminative classifier `description`, a funnel `whenToUse`, an `assetPolicy` (product/person = required|optional|forbidden), one of **4 shared `look` families**, and hook-category placeholders. The legacy `ugc` maps to **`testimonial`** (with the `ugc_authentic` look) and `inspirational` maps to **`brand-story`** (with `lifestyle`/`brand-awareness` as adjacents) — neither is lost.
- **Five types can run with NEITHER product nor person** — `brand-awareness` (canonical), `explainer`, `social-proof`, `promo-offer`, and `announcement` — and these drive the biggest pipeline change: the product- and person-reference steps must be skippable. Only person-led types (`testimonial`, `founder-pov`, `spokesperson`) hard-require a person; only `brand-awareness` is designed to need neither asset.
- Keep `look` to a fixed set of **4 families** (`ugc_authentic`, `cinematic_polished`, `graphic_text`, `demo_clean`) shared across all 16 types so the downstream image→storyboard→video skills branch on `look`, not on type, collapsing the 13 scattered `if(adType==="ugc")` branches into one strategy lookup.

## Key Findings

**The two legacy treatments are a look + a type conflated.** "UGC" in current performance-marketing practice is a _production look_ (phone-captured, native, lo-fi), not a single ad type — the same authentic look is used for testimonials, unboxings, PAS, and before/after. The legacy `ugc` value is specifically a _person giving a spoken review_, which is the **testimonial** type rendered in the `ugc_authentic` look. The legacy `inspirational` (open cinematic scene + voiceover) is the **brand-story** type in the `cinematic_polished` look. Separating "what kind of ad" (type) from "how it looks" (look family) is the core architectural insight that lets one look family serve many types.

**Real DTC/small-business ad formats cluster into ~16 recurring types.** Synthesizing practitioner catalogs (Aura Ads' "12 creative formats," Curtis Howland's $100M Meta playbook, adlibrary.com's "8 DTC Meta formats 2026," BrandMov's 4,994-hand-tagged-ad hook study, Demand Curve, and Motion's format library), the repeatedly-cited formats are: product showcase, product demo, testimonial/UGC review, social-proof/review-compilation, problem-agitate-solve, before/after transformation, comparison (us-vs-them), unboxing, explainer, founder POV, brand story, lifestyle, promo/offer, announcement, brand/awareness manifesto, and scripted spokesperson/VSL talking head.

**Named frameworks ground the types.** `problem-agitate-solve` is the PAS copywriting framework (Problem → Agitate → Solve), grounded in Daniel Kahneman & Amos Tversky's 1979 Prospect Theory (which earned Kahneman the 2002 Nobel Memorial Prize in Economics): the pain of losing something is psychologically about twice as powerful as the pleasure of gaining something equivalent. `product-showcase`/`product-demo` lean on FAB (Features-Advantages-Benefits). `brand-story`/`founder-pov` use AIDA-style attention→desire arcs and the "founder's story" theme. `comparison` is the "us vs. them" format. `before-after` is the transformation format. `promo-offer` maps to AIDA's Action stage / BOFU urgency.

**Asset-need patterns are consistent across sources.** Product-led types (showcase, demo, comparison, before/after, unboxing, lifestyle) require the product but treat a person as optional/prop. Person-led types (testimonial, founder-pov, spokesperson) require a human voice but treat the product as optional (often only referenced or shown in B-roll). Text/graphic-led types (brand-awareness, explainer, social-proof, promo-offer, announcement) can carry the message with motion graphics and voiceover alone — needing neither product nor person.

**Hooks are a separate, reusable axis.** A subagent-sourced review of named hook taxonomies yields a fixed set of ~10-12 hook category ids — `pattern_interrupt`, `curiosity_gap`, `pain_point`, `contrarian`, `direct_callout`, `question`, `stat_shock`, `social_proof`, `transformation`, `warning`, plus optional `unboxing_reveal` and `confession`. These align with Motion's library, which defines **33 hook tactics** paired with psychological triggers (per Motion's 2026 Creative Benchmarks, which analyzed $1.29B in Meta ad spend across 578,750 creatives and 6,015 advertiser accounts), and with OpusClip's 7 patterns and Demand Curve's 10 hook types. Each ad type _favors_ certain hook categories but does not own them; the hook catalog is a separate registry. Hook ids below are PLACEHOLDERS referencing that future catalog.

## Details

### The 4 fixed `look` families (shared across all types)

- **`ugc_authentic`** — phone-captured, handheld, natural light, talking-to-camera, minimal editing; native/non-salesy. (Practitioner consensus that smartphone-quality video can beat studio production in feed/Stories is directional, not a precise stat; e.g. Stackmatix: "A founder filming a 15-second product walkthrough on their phone can beat a $5,000 studio production." Legacy `ugc` look.)
- **`cinematic_polished`** — produced, premium, controlled lighting, color-graded, voiceover-led; story/mood-driven. (Legacy `inspirational` look.)
- **`graphic_text`** — motion-graphics, kinetic typography, animated overlays, brand colors; can run with no live footage. (Drives the "neither product nor person" capability.)
- **`demo_clean`** — clean studio/tabletop product photography, crisp close-ups, minimal set; product is the visual subject.

### Catalog (one row per ad type)

| id                    | displayName                     | description (classifier-facing, discriminative)                                                                                                                                                                                                                                                                                                                      | whenToUse                                | assetPolicy (product / person + rationale)                                                                                                                                            | look               | defaultHooks → allowedHooks                                                 | differsFromUgcInspirational                                                                                                                      |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| product-showcase      | Product Showcase                | Hero ad centered on the product itself — glamour shots, key features/benefits presented directly with no narrative arc or personal story. Distinct from product-demo (function/use) and lifestyle (product in human context).                                                                                                                                        | consideration                            | product: **required** / person: **optional** — the product is the subject; a person is at most a prop, so person is optional and product can't be skipped.                            | demo_clean         | [curiosity_gap, stat_shock] → [pattern_interrupt, question, transformation] | Pure product hero with no spoken human review (vs ugc) and no open cinematic scene (vs inspirational).                                           |
| product-demo          | Product Demo                    | Shows the product being used / how it works — function-first, in-action or step-by-step footage proving the benefit visually. Differs from product-showcase (static hero) and explainer (abstract/graphics, not real footage).                                                                                                                                       | consideration / conversion               | product: **required** / person: **optional** — demonstration needs the physical product; hands/operator optional because the action carries the message.                              | demo_clean         | [pain_point, transformation] → [curiosity_gap, question, pattern_interrupt] | Visible function/use, not a person's spoken testimonial (ugc) or a mood-driven scene (inspirational).                                            |
| testimonial           | Testimonial / UGC Review        | A person speaks to camera giving a first-person review/endorsement, authentic phone-captured feel. **Home of the legacy `ugc` type.** Differs from founder-pov (speaker is a customer/creator, not the founder) and social-proof (aggregated graphics, not one spoken account).                                                                                      | consideration / conversion               | product: **optional** / person: **required** — the credible human voice is mandatory; the product may be held, shown, or only referenced.                                             | ugc_authentic      | [social_proof, pain_point] → [direct_callout, transformation, question]     | This IS the current `ugc` treatment, formalized; person-led spoken review vs inspirational's scene-led voiceover.                                |
| social-proof          | Social Proof                    | Aggregated proof — star ratings, review screenshots, press quotes, sales/stat callouts — usually motion-graphics or quick montage. Differs from testimonial (one person on camera) by stacking many third-party signals with no single presenter.                                                                                                                    | consideration / conversion / retargeting | product: **optional** / person: **optional** — proof elements (text, ratings, quotes) carry the ad; **NEITHER asset required**.                                                       | graphic_text       | [social_proof, stat_shock] → [curiosity_gap, question]                      | Graphics-led proof montage, not one person's spoken ugc review or a cinematic brand scene.                                                       |
| problem-agitate-solve | Problem-Agitate-Solve (PAS)     | Follows the PAS framework: opens on a named pain point, intensifies it, then presents the product as resolution. Differs from product-demo (starts from product) and testimonial (leads with a person's verdict).                                                                                                                                                    | awareness / consideration (cold)         | product: **required** / person: **optional** — the product must appear as the "solve"; the problem can be dramatized with product/scene footage or voiceover.                         | ugc_authentic      | [pain_point, warning] → [pattern_interrupt, contrarian, question]           | Structured pain-first narrative culminating in the product — neither a bare spoken review (ugc) nor an open mood piece (inspirational).          |
| before-after          | Before / After (Transformation) | Built around a visible contrast between a "before" state and an "after" result achieved with the product. Differs from product-demo (process, not contrast) and comparison (rival product, not two time states).                                                                                                                                                     | consideration / conversion               | product: **required** / person: **optional** — transformation must feature the product driving change; person optional (e.g., object/cleaning before-after).                          | demo_clean         | [transformation, pain_point] → [curiosity_gap, stat_shock, warning]         | Time-based result contrast; not a spoken review (ugc), not a moody film (inspirational). High Meta-policy risk (see Edge Cases).                 |
| comparison            | Comparison (Us-vs-Them)         | Side-by-side contrast positioning the product against a named competitor or the "old way," calling out a demonstrable advantage. Differs from before-after (two time states of one user) and product-showcase (no rival reference).                                                                                                                                  | consideration                            | product: **required** / person: **optional** — both the product and contrast item drive the message; often pure split-screen graphics so person optional.                             | demo_clean         | [contrarian, stat_shock] → [pattern_interrupt, question, warning]           | Competitive contrast vs single-subject framing of current types. Naming competitors triggers Meta's Personal Attributes policy (see Edge Cases). |
| unboxing              | Unboxing                        | Anticipation → reveal → reaction of opening the packaging, emphasizing the tactile first impression and what's inside. Differs from product-demo (function after the box is open) and testimonial (verbal verdict, not the reveal).                                                                                                                                  | consideration                            | product: **required** / person: **optional** — the packaged product and reveal are essential; hands/reactor optional.                                                                 | ugc_authentic      | [unboxing_reveal, curiosity_gap] → [pattern_interrupt, social_proof]        | Centered on the reveal/packaging moment, distinct from spoken review (ugc) or cinematic scene (inspirational).                                   |
| explainer             | Explainer                       | Educational breakdown of how the product/service works or why it matters, frequently motion-graphics / kinetic-typography led with voiceover and no real product footage required. Differs from product-demo (real in-use footage) and brand-story (emotional vs informational).                                                                                     | consideration                            | product: **optional** / person: **optional** — concepts can run entirely on animated graphics + voiceover; **NEITHER asset required**.                                                | graphic_text       | [question, stat_shock] → [curiosity_gap, pain_point, contrarian]            | Concept-clarity, often graphics-only; not a person's review (ugc), not a mood-led film (inspirational).                                          |
| founder-pov           | Founder POV                     | The founder/company insider speaks first-person about why the product exists — origin story, mission, the problem they set out to solve. Differs from testimonial (a customer/creator, not the principal) and brand-story (third-person narrative, no named individual required).                                                                                    | awareness / consideration (cold trust)   | product: **optional** / person: **required** — a specific human (the founder) is mandatory; the product enters later and may only be referenced.                                      | cinematic_polished | [pain_point, curiosity_gap] → [contrarian, direct_callout, confession]      | Named insider's account; ugc is a customer review, this is the company's own voice; person-led vs inspirational's scene-led.                     |
| brand-story           | Brand Story                     | Cinematic, emotionally-driven narrative about brand values, world, or a customer journey — polished mood piece with voiceover. **Primary home of the legacy `inspirational` type.** Differs from founder-pov (no named speaker required) and brand-awareness (graphics/text manifesto, not filmed scenes).                                                           | awareness                                | product: **optional** / person: **optional** — an open cinematic scene can succeed with neither a clear product nor a presenter; either may appear.                                   | cinematic_polished | [curiosity_gap, pattern_interrupt] → [question, transformation]             | This IS the current `inspirational` treatment, formalized; polished cinematic scene vs ugc's phone-captured review.                              |
| lifestyle             | Lifestyle                       | Aspirational footage of the product woven into a desirable real-life context / use occasion ("people like me" enjoying it). Differs from brand-story (abstract mood, product not central) and product-showcase (isolated hero shots, no human context).                                                                                                              | awareness / consideration                | product: **required** / person: **optional** — product-in-context is the point; people enrich the scene but B-roll can omit a clear subject.                                          | cinematic_polished | [pattern_interrupt, curiosity_gap] → [transformation, direct_callout]       | Product-in-aspirational-context; more concrete/product-led than inspirational, not a spoken review like ugc.                                     |
| promo-offer           | Promo / Offer                   | Conversion-driven announcement of a specific deal — discount, BOGO, limited-time sale — with urgency and a hard CTA. Differs from announcement (news/launch, no discount) and product-showcase (no time-bound offer).                                                                                                                                                | conversion / retargeting                 | product: **optional** / person: **optional** — offer terms + CTA ("40% OFF ENDS SUNDAY") can carry the ad as text/graphics; **NEITHER asset required**.                               | graphic_text       | [warning, stat_shock] → [pattern_interrupt, direct_callout, curiosity_gap]  | Time-bound deal + urgency CTA, often graphics-only; neither spoken review (ugc) nor cinematic mood (inspirational).                              |
| announcement          | Announcement                    | Heralds something new — product launch, restock, feature, partnership, milestone — building anticipation, not necessarily a discount. Differs from promo-offer (no price/urgency offer) and brand-story (news beat, not emotional arc).                                                                                                                              | awareness                                | product: **optional** / person: **optional** — a teaser can be pure typography ("Dropping 6.20") or feature the product; **NEITHER asset required**.                                  | graphic_text       | [curiosity_gap, pattern_interrupt] → [stat_shock, question]                 | Event/news framing, can be graphics-only, unlike person-led ugc or scene-led inspirational.                                                      |
| brand-awareness       | Brand Awareness / Manifesto     | Pure brand statement led by motion-graphics, kinetic typography and brand assets — a manifesto, slogan, or value statement with NO product shot and NO person required. **The canonical "neither" type** that drives the pipeline change. Differs from brand-story (filmed cinematic scenes) and explainer (informational how-it-works vs identity/value messaging). | awareness                                | product: **optional** / person: **optional** — designed to run on typography/brand assets alone; pipeline can skip product- AND person-reference steps. **Strongest "neither" type.** | graphic_text       | [pattern_interrupt, curiosity_gap] → [question, contrarian, stat_shock]     | Graphics/text-led identity messaging with no product or person — neither ugc's spoken review nor inspirational's filmed scene.                   |
| spokesperson          | Spokesperson / VSL              | A presenter/host (hired actor or AI avatar) delivers a scripted product pitch direct-to-camera — polished sales delivery, not an authentic peer review. Differs from testimonial (genuine first-person customer experience) and founder-pov (the actual founder).                                                                                                    | consideration / conversion               | product: **optional** / person: **required** — a presenter is the vehicle; product shown via cutaways/B-roll is optional.                                                             | cinematic_polished | [direct_callout, question] → [pain_point, stat_shock, social_proof]         | Scripted host pitch — distinct from authentic peer ugc review and from scene-led inspirational.                                                  |

### Asset-Policy Summary Matrix

Legend: **R** = required, **o** = optional, **F** = forbidden.

| ad type               | product | person | category                                   |
| --------------------- | ------- | ------ | ------------------------------------------ |
| product-showcase      | R       | o      | product-led                                |
| product-demo          | R       | o      | product-led                                |
| before-after          | R       | o      | product-led                                |
| comparison            | R       | o      | product-led                                |
| unboxing              | R       | o      | product-led                                |
| lifestyle             | R       | o      | product-led                                |
| problem-agitate-solve | R       | o      | product-led                                |
| testimonial           | o       | R      | person-led                                 |
| founder-pov           | o       | R      | person-led                                 |
| spokesperson          | o       | R      | person-led                                 |
| brand-story           | o       | o      | flexible (either/neither)                  |
| social-proof          | o       | o      | **NEITHER-capable (text/graphic-led)**     |
| explainer             | o       | o      | **NEITHER-capable (text/graphic-led)**     |
| promo-offer           | o       | o      | **NEITHER-capable (text/graphic-led)**     |
| announcement          | o       | o      | **NEITHER-capable (text/graphic-led)**     |
| brand-awareness       | o       | o      | **NEITHER — canonical (text/graphic-led)** |

**Types that need NEITHER product nor person (drive the pipeline change):** `brand-awareness` (canonical), `explainer`, `social-proof`, `promo-offer`, `announcement`. For these, the product-reference and person-reference pipeline steps must be conditionally skipped. `brand-story` is also neither-capable but defaults to expecting at least mood/scene footage.

### Edge Cases / Decisions

1. **Testimonial with no product shown.** A pure talking-head endorsement is valid. **Decision:** product = `optional` (not required). The product image, if provided, becomes B-roll/insert; if absent, skip the product-reference step. Person stays `required`.
2. **Comparison naming a named competitor.** Demonstrable but policy-risky on Meta. Meta's Personal Attributes / Privacy Violations policy is the single most common reason Meta ads get rejected (per auditsocials.com's 2026 Meta policy tracker, citing March 2026 escalation of automated multimodal-AI enforcement). **Decision:** keep product `required`, person `optional`; add a downstream `brandSafety` note (not a new schema field) — prefer "old way / generic alternative" over named brands unless the brief explicitly authorizes it.
3. **Before/after personal-deficiency framing.** Per Meta's Advertising Standards, Meta prohibits "content implying or attempting to generate negative self-perception in order to promote diet, weight loss or other health related products," and its Health & Wellness policy specifically prohibits side-by-side before/after comparisons for weight loss and for anti-aging/wrinkle treatments. **Decision:** keep this policy guidance in the skill prompt; use positive, "after"-forward framing and avoid the literal split-screen for prohibited categories.
4. **brand-story vs brand-awareness overlap.** Both are awareness/brand. **Decision:** disambiguate by look — `brand-story` = `cinematic_polished` (filmed scenes), `brand-awareness` = `graphic_text` (typography/no footage). The classifier should route "no product, no person, text-led" to `brand-awareness`.
5. **spokesperson vs testimonial.** Fine line. **Decision:** classifier keys on _authenticity claim_ — a genuine first-person customer experience → `testimonial`; a scripted/hosted pitch (incl. AI avatar) → `spokesperson`.
6. **product-showcase vs product-demo.** **Decision:** static hero/benefit framing → `showcase`; visible in-use function/steps → `demo`.
7. **promo-offer vs announcement.** **Decision:** presence of a price/discount/urgency offer → `promo-offer`; new-thing/news without a deal → `announcement`.

### JSON registry (paste-ready)

```json
[
  {
    "id": "product-showcase",
    "displayName": "Product Showcase",
    "description": "Hero ad centered on the product itself — glamour shots, key features/benefits presented directly with no narrative arc or personal story. Distinct from product-demo (function/use) and lifestyle (product in human context).",
    "whenToUse": "consideration",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "The product is the subject; a person is at most a prop, so person is optional and product cannot be skipped."
    },
    "look": "demo_clean",
    "defaultHooks": ["curiosity_gap", "stat_shock"],
    "allowedHooks": ["pattern_interrupt", "question", "transformation"],
    "differsFromUgcInspirational": "Pure product hero with no spoken human review (vs ugc) and no open cinematic scene (vs inspirational)."
  },
  {
    "id": "product-demo",
    "displayName": "Product Demo",
    "description": "Shows the product being used / how it works — function-first, in-action or step-by-step footage proving the benefit visually. Differs from product-showcase (static hero) and explainer (abstract/graphics, not real footage).",
    "whenToUse": "consideration|conversion",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "Demonstration needs the physical product; hands/operator are optional because the action carries the message."
    },
    "look": "demo_clean",
    "defaultHooks": ["pain_point", "transformation"],
    "allowedHooks": ["curiosity_gap", "question", "pattern_interrupt"],
    "differsFromUgcInspirational": "Visible function/use, not a person's spoken testimonial (ugc) or a mood-driven cinematic scene (inspirational)."
  },
  {
    "id": "testimonial",
    "displayName": "Testimonial / UGC Review",
    "description": "A person speaks to camera giving a first-person review/endorsement, authentic phone-captured feel. Home of the legacy 'ugc' type. Differs from founder-pov (a customer/creator, not the founder) and social-proof (aggregated graphics, not one spoken account).",
    "whenToUse": "consideration|conversion",
    "assetPolicy": {
      "product": "optional",
      "person": "required",
      "rationale": "The credible human voice is mandatory; the product may be held, shown, or only referenced."
    },
    "look": "ugc_authentic",
    "defaultHooks": ["social_proof", "pain_point"],
    "allowedHooks": ["direct_callout", "transformation", "question"],
    "differsFromUgcInspirational": "This IS the current 'ugc' treatment, formalized; person-led spoken review vs inspirational's scene-led voiceover.",
    "legacyMapping": "ugc"
  },
  {
    "id": "social-proof",
    "displayName": "Social Proof",
    "description": "Aggregated proof — star ratings, review screenshots, press quotes, sales/stat callouts — usually motion-graphics or quick montage. Differs from testimonial (one person on camera) by stacking many third-party signals with no single presenter.",
    "whenToUse": "consideration|conversion|retargeting",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "Proof elements (text, ratings, quotes) carry the ad; neither a product shot nor a presenter is required."
    },
    "look": "graphic_text",
    "defaultHooks": ["social_proof", "stat_shock"],
    "allowedHooks": ["curiosity_gap", "question"],
    "differsFromUgcInspirational": "Graphics-led proof montage, not one person's spoken ugc review or a cinematic brand scene."
  },
  {
    "id": "problem-agitate-solve",
    "displayName": "Problem-Agitate-Solve (PAS)",
    "description": "Follows the PAS framework: opens on a named pain point, intensifies it, then presents the product as resolution. Differs from product-demo (starts from product) and testimonial (leads with a person's verdict).",
    "whenToUse": "awareness|consideration",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "The product must appear as the 'solve'; the problem can be dramatized with product/scene footage or voiceover, so person is optional."
    },
    "look": "ugc_authentic",
    "defaultHooks": ["pain_point", "warning"],
    "allowedHooks": ["pattern_interrupt", "contrarian", "question"],
    "differsFromUgcInspirational": "Structured pain-first narrative culminating in the product — neither a bare spoken review (ugc) nor an open mood piece (inspirational)."
  },
  {
    "id": "before-after",
    "displayName": "Before / After (Transformation)",
    "description": "Built around a visible contrast between a 'before' state and an 'after' result achieved with the product. Differs from product-demo (process, not contrast) and comparison (rival product, not two time states).",
    "whenToUse": "consideration|conversion",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "The transformation must feature the product driving change; person optional (e.g., object/cleaning before-after)."
    },
    "look": "demo_clean",
    "defaultHooks": ["transformation", "pain_point"],
    "allowedHooks": ["curiosity_gap", "stat_shock", "warning"],
    "differsFromUgcInspirational": "Time-based result contrast; not a spoken review (ugc) and not a moody brand film (inspirational). High Meta policy risk: Meta prohibits before/after comparisons for weight loss and anti-aging/wrinkle treatments."
  },
  {
    "id": "comparison",
    "displayName": "Comparison (Us-vs-Them)",
    "description": "Side-by-side contrast positioning the product against a named competitor or the 'old way,' calling out a demonstrable advantage. Differs from before-after (two time states of one user) and product-showcase (no rival reference).",
    "whenToUse": "consideration",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "Both the product and the contrast item drive the message; often pure split-screen graphics, so person is optional."
    },
    "look": "demo_clean",
    "defaultHooks": ["contrarian", "stat_shock"],
    "allowedHooks": ["pattern_interrupt", "question", "warning"],
    "differsFromUgcInspirational": "Competitive contrast vs the single-subject framing of the current types. Naming competitors triggers Meta's Personal Attributes / Privacy Violations policy (the most common Meta rejection reason)."
  },
  {
    "id": "unboxing",
    "displayName": "Unboxing",
    "description": "Anticipation → reveal → reaction of opening the packaging, emphasizing the tactile first impression and what's inside. Differs from product-demo (function after the box is open) and testimonial (verbal verdict, not the reveal).",
    "whenToUse": "consideration",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "The packaged product and reveal are essential; hands/a reactor are common but identity is optional."
    },
    "look": "ugc_authentic",
    "defaultHooks": ["unboxing_reveal", "curiosity_gap"],
    "allowedHooks": ["pattern_interrupt", "social_proof"],
    "differsFromUgcInspirational": "Centered on the reveal/packaging moment, distinct from a spoken review (ugc) or a cinematic scene (inspirational)."
  },
  {
    "id": "explainer",
    "displayName": "Explainer",
    "description": "Educational breakdown of how the product/service works or why it matters, frequently motion-graphics / kinetic-typography led with voiceover and no real product footage required. Differs from product-demo (real in-use footage) and brand-story (emotional vs informational).",
    "whenToUse": "consideration",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "Concepts can run entirely on animated graphics + voiceover, so neither product nor person is required."
    },
    "look": "graphic_text",
    "defaultHooks": ["question", "stat_shock"],
    "allowedHooks": ["curiosity_gap", "pain_point", "contrarian"],
    "differsFromUgcInspirational": "Concept-clarity, often graphics-only; not a person's review (ugc) and not a mood-led cinematic piece (inspirational)."
  },
  {
    "id": "founder-pov",
    "displayName": "Founder POV",
    "description": "The founder/company insider speaks first-person about why the product exists — origin story, mission, the problem they set out to solve. Differs from testimonial (a customer/creator, not the principal) and brand-story (third-person narrative, no named individual required).",
    "whenToUse": "awareness|consideration",
    "assetPolicy": {
      "product": "optional",
      "person": "required",
      "rationale": "A specific human (the founder) is mandatory; the product enters later and may only be referenced."
    },
    "look": "cinematic_polished",
    "defaultHooks": ["pain_point", "curiosity_gap"],
    "allowedHooks": ["contrarian", "direct_callout", "confession"],
    "differsFromUgcInspirational": "Named insider's account; ugc is a customer review while this is the company's own voice; person-led vs inspirational's scene-led."
  },
  {
    "id": "brand-story",
    "displayName": "Brand Story",
    "description": "Cinematic, emotionally-driven narrative about brand values, world, or a customer journey — polished mood piece with voiceover. Primary home of the legacy 'inspirational' type. Differs from founder-pov (no named speaker required) and brand-awareness (graphics/text manifesto, not filmed scenes).",
    "whenToUse": "awareness",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "An open cinematic scene can succeed with neither a clear product nor a presenter, though either may appear — mirrors the legacy 'inspirational' freedom."
    },
    "look": "cinematic_polished",
    "defaultHooks": ["curiosity_gap", "pattern_interrupt"],
    "allowedHooks": ["question", "transformation"],
    "differsFromUgcInspirational": "This IS the current 'inspirational' treatment, formalized; polished cinematic scene vs ugc's phone-captured spoken review.",
    "legacyMapping": "inspirational"
  },
  {
    "id": "lifestyle",
    "displayName": "Lifestyle",
    "description": "Aspirational footage of the product woven into a desirable real-life context / use occasion ('people like me' enjoying it). Differs from brand-story (abstract mood, product not central) and product-showcase (isolated hero shots, no human context).",
    "whenToUse": "awareness|consideration",
    "assetPolicy": {
      "product": "required",
      "person": "optional",
      "rationale": "The product-in-context is the point; people enrich the scene but are optional (lifestyle B-roll without a clear subject)."
    },
    "look": "cinematic_polished",
    "defaultHooks": ["pattern_interrupt", "curiosity_gap"],
    "allowedHooks": ["transformation", "direct_callout"],
    "differsFromUgcInspirational": "Product-in-aspirational-context; more concrete/product-led than inspirational, not a spoken review like ugc."
  },
  {
    "id": "promo-offer",
    "displayName": "Promo / Offer",
    "description": "Conversion-driven announcement of a specific deal — discount, BOGO, limited-time sale — with urgency and a hard CTA. Differs from announcement (news/launch, no discount) and product-showcase (no time-bound offer/urgency).",
    "whenToUse": "conversion|retargeting",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "Offer terms and CTA (often text/graphics: '40% OFF ENDS SUNDAY') can carry the ad with neither product footage nor a presenter."
    },
    "look": "graphic_text",
    "defaultHooks": ["warning", "stat_shock"],
    "allowedHooks": ["pattern_interrupt", "direct_callout", "curiosity_gap"],
    "differsFromUgcInspirational": "Time-bound deal + urgency CTA, frequently graphics-only; neither a spoken review (ugc) nor cinematic brand mood (inspirational)."
  },
  {
    "id": "announcement",
    "displayName": "Announcement",
    "description": "Heralds something new — product launch, restock, feature, partnership, or milestone — building anticipation without necessarily a discount. Differs from promo-offer (no price/urgency offer) and brand-story (news beat rather than emotional narrative).",
    "whenToUse": "awareness",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "A launch/teaser can be pure typography ('Dropping 6.20') or feature the product; both are optional."
    },
    "look": "graphic_text",
    "defaultHooks": ["curiosity_gap", "pattern_interrupt"],
    "allowedHooks": ["stat_shock", "question"],
    "differsFromUgcInspirational": "Event/news framing; can be graphics-only, unlike person-led ugc or scene-led inspirational."
  },
  {
    "id": "brand-awareness",
    "displayName": "Brand Awareness / Manifesto",
    "description": "Pure brand statement led by motion-graphics, kinetic typography and brand assets — a manifesto, slogan, or value statement with NO product shot and NO person required. The canonical 'neither' type. Differs from brand-story (filmed cinematic scenes) and explainer (informational how-it-works vs identity/value messaging).",
    "whenToUse": "awareness",
    "assetPolicy": {
      "product": "optional",
      "person": "optional",
      "rationale": "Designed to run on typography/brand assets alone; both product and person are optional so the pipeline can skip product- AND person-reference steps. Strongest 'neither' type."
    },
    "look": "graphic_text",
    "defaultHooks": ["pattern_interrupt", "curiosity_gap"],
    "allowedHooks": ["question", "contrarian", "stat_shock"],
    "differsFromUgcInspirational": "Graphics/text-led identity messaging with no product or person — neither the ugc spoken review nor the filmed inspirational scene."
  },
  {
    "id": "spokesperson",
    "displayName": "Spokesperson / VSL",
    "description": "A presenter/host (hired actor or AI avatar) delivers a scripted product pitch direct-to-camera — polished sales delivery rather than an authentic peer review. Differs from testimonial (genuine first-person customer experience) and founder-pov (the actual company founder).",
    "whenToUse": "consideration|conversion",
    "assetPolicy": {
      "product": "optional",
      "person": "required",
      "rationale": "A presenter is the vehicle; product shown via cutaways/B-roll is optional."
    },
    "look": "cinematic_polished",
    "defaultHooks": ["direct_callout", "question"],
    "allowedHooks": ["pain_point", "stat_shock", "social_proof"],
    "differsFromUgcInspirational": "Scripted host pitch — distinct from the authentic peer ugc review and from the scene-led inspirational."
  }
]
```

## Recommendations

1. **Ship the registry + look-strategy in two layers.** Build `AdTypeDef` (the 16 rows above) and a separate `LookStrategy` keyed by the 4 look families. Downstream skills should branch on `look`, not on `id` — this collapses the 13 scattered `if(adType==="ugc")` branches into one `lookStrategy[def.look]` lookup. Migration is safe because `ugc`→`testimonial`(`ugc_authentic`) and `inspirational`→`brand-story`(`cinematic_polished`) preserve current behavior.
2. **Wire `assetPolicy` to the existing skip mechanism.** At pipeline entry, read `def.assetPolicy`. If `product !== "required"` and no product image is supplied, skip the product-reference step; same for person. Forbid uploading a product image when `product === "forbidden"` (no current type uses `forbidden`, but reserve it). Validate at intake so `interpretAdStyle` can't route a no-asset prompt to a product-required type.
3. **Extend `interpretAdStyle` to emit `adType` from the 16-value enum** using the discriminative `description` fields as the classifier rubric, plus the disambiguation rules in Edge Cases (#4–#7). Keep `adStyle` (the ~20-word brief) unchanged.
4. **Stub the hook registry now, populate later.** Add `defaultHooks`/`allowedHooks` as string-id arrays referencing a forthcoming `HookDef` catalog; the ~12 ids used here (`pattern_interrupt`, `curiosity_gap`, `pain_point`, `contrarian`, `direct_callout`, `question`, `stat_shock`, `social_proof`, `transformation`, `warning`, `unboxing_reveal`, `confession`) are the seed, drawn from Motion's 33-tactic library, OpusClip's 7 patterns, and Demand Curve's 10 hook types.
5. **Benchmarks that change the taxonomy:** add a new type only when a format recurs across ≥3 independent practitioner sources AND has a distinct asset policy OR look (otherwise it's a hook/angle variant, not a type). Split a look family only if a downstream skill needs to branch on it. If classifier confusion-rate between two neighbors (e.g., showcase/demo, testimonial/spokesperson) exceeds a tolerance in eval, merge them or sharpen the `description` deltas rather than adding fields.

## Caveats

- **Type vs. format vs. hook vs. angle.** Sources conflate these. Meta/TikTok "formats" (single-image, carousel, Reels, Spark Ads, collection) are _placements/containers_, not creative types — excluded deliberately. "Angles" (e.g., "for hot sleepers") and "hooks" are orthogonal axes layered on top of a type.
- **Performance stats are practitioner-reported, not peer-reviewed.** Figures cited by agencies (UGC lead-lift, smartphone-vs-studio win claims, Andromeda diversification gains, Motion's $1.29B/578,750-creative dataset) come from vendor blogs and self-reported case studies; treat as directional. No authoritative precise "smartphone beats studio X% of the time" figure exists.
- **Platform policy is volatile.** `comparison` (named competitors → Meta Personal Attributes policy) and `before-after` (Meta prohibits before/after for weight-loss and anti-aging/wrinkle treatments) carry real rejection risk; handled as prompt guidance, not schema.
- **Boundaries are intentionally fuzzy.** showcase/demo, testimonial/spokesperson, brand-story/brand-awareness, promo-offer/announcement are adjacent; disambiguation rules are provided but classifier eval should drive any future merges.
- **`forbidden` is reserved but unused.** No current type forbids an asset outright; `brand-awareness` makes both optional rather than forbidden to preserve flexibility. Use `forbidden` only if a future type must reject an uploaded asset.
