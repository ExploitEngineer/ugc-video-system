// Detector eval fixtures (Chunk I) — seed accuracy set from research/02 §6 plus
// one happy-path per registered type and the confusable pairs.
//
// `rawDetector` is the SIMULATED LLM output (what `interpretAdStyle` would
// return). The OFFLINE test feeds it through clampAdType → confidenceGate →
// reconcile (no LLM) and asserts the deterministic final `{adType, hook, synth}`.
// The OPTIONAL live eval (env-gated) runs the real detector on `prompt` and
// reports classification accuracy against `expected.adType`.

export interface DetectorFixture {
  name: string;
  /** Free-text prompt — used only by the optional live eval. */
  prompt: string;
  /** Ground-truth uploads. */
  input: { hasProduct: boolean; hasPerson: boolean };
  /** Simulated detector output (what the LLM would emit), fed to clamp+reconcile. */
  rawDetector: { adType: string; hooks: string[]; confidence: number };
  /** Expected deterministic result after clamp + confidence gate + reconcile. */
  expected: {
    adType: string;
    /** The resolved visual-lead hook id, when asserted. */
    visualLeadHook?: string;
    synthesizePerson?: boolean;
  };
  /** A confusable-pair label, when this fixture targets one. */
  confusablePair?: string;
  note?: string;
}

export const DETECTOR_FIXTURES: DetectorFixture[] = [
  // ── research/02 §6 worked examples ──────────────────────────────────────
  {
    name: "legacy-ugc-preserved",
    prompt:
      "A real customer talking to the camera about how much they love these running shoes",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "testimonial", hooks: ["testimonial"], confidence: 0.9 },
    expected: { adType: "testimonial", visualLeadHook: "testimonial", synthesizePerson: false },
  },
  {
    name: "legacy-inspirational-preserved",
    prompt:
      "An emotional cinematic story about chasing your dreams, with our brand as the quiet companion",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "brand-story", hooks: ["curiosity-gap"], confidence: 0.78 },
    expected: { adType: "brand-story", visualLeadHook: "curiosity-gap", synthesizePerson: false },
  },
  {
    name: "ambiguous-showcase-vs-demo",
    prompt: "Make my blender look amazing while it crushes ice",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-demo", hooks: ["demonstration"], confidence: 0.62 },
    expected: { adType: "product-demo", visualLeadHook: "demonstration", synthesizePerson: false },
    confusablePair: "showcase-vs-demo",
  },
  {
    name: "ambiguous-promo-vs-announcement",
    prompt:
      "We're launching our new summer collection — and it's 30% off this weekend only",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "promo-offer", hooks: ["direct-callout"], confidence: 0.7 },
    expected: { adType: "promo-offer", visualLeadHook: "direct-callout", synthesizePerson: false },
    confusablePair: "promo-vs-announcement",
  },
  {
    name: "no-product-downgrade",
    prompt: "Show this gadget in action solving the morning rush",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "product-demo", hooks: ["demonstration"], confidence: 0.66 },
    // product-demo (product required) + no product → downgrade to explainer;
    // demonstration stripped (needs product) → seeded explainer default `question`.
    expected: { adType: "explainer", visualLeadHook: "question", synthesizePerson: false },
  },
  {
    name: "person-required-no-person-synthesize",
    prompt: "Our founder explains why she started the company",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "founder-pov", hooks: ["confession"], confidence: 0.84 },
    // person required + none uploaded → synthesize, NOT downgrade; confession kept.
    expected: { adType: "founder-pov", visualLeadHook: "confession", synthesizePerson: true },
    confusablePair: "founder-vs-testimonial",
  },
  {
    name: "contradiction-no-product-brand-film-but-product-uploaded",
    prompt:
      "A text-only brand manifesto, just our slogan and bold words, no product shots",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "brand-awareness", hooks: ["pattern-interrupt"], confidence: 0.8 },
    expected: { adType: "brand-awareness", visualLeadHook: "pattern-interrupt", synthesizePerson: false },
    confusablePair: "brand-story-vs-brand-awareness",
  },
  {
    name: "spokesperson-vs-testimonial-scripted",
    prompt: "A polished AI avatar host pitches our SaaS features straight to camera",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "spokesperson", hooks: ["direct-callout"], confidence: 0.8 },
    expected: { adType: "spokesperson", visualLeadHook: "direct-callout", synthesizePerson: true },
    confusablePair: "spokesperson-vs-testimonial",
  },
  {
    name: "vague-empty-with-product",
    prompt: "make me an ad",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-showcase", hooks: ["bold-claim"], confidence: 0.35 },
    // confidence < 0.55 but the pick IS the asset-implied default → no override.
    expected: { adType: "product-showcase", visualLeadHook: "bold-claim", synthesizePerson: false },
  },
  {
    name: "vague-empty-no-assets",
    prompt: "",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "brand-awareness", hooks: ["pattern-interrupt"], confidence: 0.3 },
    expected: { adType: "brand-awareness", visualLeadHook: "pattern-interrupt", synthesizePerson: false },
  },

  // ── one happy-path per remaining registered type (asset-matched) ─────────
  {
    name: "product-showcase-happy",
    prompt: "Glossy hero shots showing off our new headphones and their features",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-showcase", hooks: ["curiosity-gap"], confidence: 0.8 },
    expected: { adType: "product-showcase", synthesizePerson: false },
  },
  {
    name: "before-after-happy",
    prompt: "Show the dirty pan, then the same pan spotless after our cleaner",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "before-after", hooks: ["before-after"], confidence: 0.8 },
    expected: { adType: "before-after", visualLeadHook: "before-after", synthesizePerson: false },
  },
  {
    name: "comparison-happy",
    prompt: "Our razor vs the old way of shaving — side by side",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "comparison", hooks: ["unexpected-comparison"], confidence: 0.8 },
    expected: { adType: "comparison", synthesizePerson: false },
    confusablePair: "comparison-vs-before-after",
  },
  {
    name: "unboxing-happy",
    prompt: "Unboxing our subscription box — what's inside this month",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "unboxing", hooks: ["curiosity-gap"], confidence: 0.8 },
    expected: { adType: "unboxing", synthesizePerson: false },
  },
  {
    name: "lifestyle-happy",
    prompt: "Imagine your perfect morning — coffee, sunlight, and our mug in hand",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "lifestyle", hooks: ["relatable-scenario"], confidence: 0.8 },
    expected: { adType: "lifestyle", visualLeadHook: "relatable-scenario", synthesizePerson: false },
  },
  {
    name: "pas-happy",
    prompt: "Tired of tangled cables ruining your desk? Here's the fix.",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "problem-agitate-solve", hooks: ["problem-solution"], confidence: 0.8 },
    expected: { adType: "problem-agitate-solve", visualLeadHook: "problem-solution", synthesizePerson: false },
  },
  {
    name: "social-proof-happy",
    prompt: "Over 50,000 five-star reviews — see what everyone is saying",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "social-proof", hooks: ["social-proof"], confidence: 0.8 },
    expected: { adType: "social-proof", synthesizePerson: false },
  },
  {
    name: "explainer-happy",
    prompt: "Here's how our app actually saves you two hours a week",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "explainer", hooks: ["question"], confidence: 0.8 },
    expected: { adType: "explainer", visualLeadHook: "question", synthesizePerson: false },
  },
  {
    name: "announcement-happy",
    prompt: "Introducing our new flavor — now available nationwide",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "announcement", hooks: ["curiosity-gap"], confidence: 0.8 },
    expected: { adType: "announcement", synthesizePerson: false },
    confusablePair: "promo-vs-announcement",
  },

  // ── safety net: a near-miss adType id clamps to the registered one ───────
  {
    name: "clamp-near-miss",
    prompt: "honest review of these shoes",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "testimonal", hooks: ["testimonial"], confidence: 0.9 }, // typo
    expected: { adType: "testimonial", synthesizePerson: false },
  },
  {
    name: "clamp-garbage-no-assets",
    prompt: "???",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "qwerty-nonsense", hooks: [], confidence: 0.9 },
    expected: { adType: "brand-awareness", synthesizePerson: false },
  },
  {
    name: "clamp-legacy-alias",
    prompt: "ugc review",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "ugc", hooks: ["testimonial"], confidence: 0.9 },
    expected: { adType: "testimonial", synthesizePerson: false },
  },
];
