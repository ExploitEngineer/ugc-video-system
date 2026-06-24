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
  // ── happy path per surviving core type (asset-matched) ───────────────────
  {
    name: "service-default-no-assets",
    prompt: "We provide an AI tool that automates your ad campaigns",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "service", hooks: ["problem-solution"], confidence: 0.85 },
    expected: { adType: "service", visualLeadHook: "problem-solution", synthesizePerson: false },
  },
  {
    name: "ugc-testimonial-happy",
    prompt:
      "A real customer talking to the camera about how much they love these running shoes",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "testimonial", hooks: ["confession"], confidence: 0.9 },
    expected: { adType: "testimonial", visualLeadHook: "confession", synthesizePerson: false },
  },
  {
    name: "brand-story-happy",
    prompt:
      "An emotional cinematic story about chasing your dreams, with our brand as the quiet companion",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "brand-story", hooks: ["curiosity-gap"], confidence: 0.78 },
    expected: { adType: "brand-story", synthesizePerson: false },
  },
  {
    name: "inspirational-happy",
    prompt: "A moving, near-wordless mood film about resilience at first light",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "inspirational", hooks: ["pattern-interrupt"], confidence: 0.8 },
    expected: { adType: "inspirational", synthesizePerson: false },
  },
  {
    name: "product-demo-happy",
    prompt: "Show my blender crushing ice, step by step, so people see how it works",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-demo", hooks: ["problem-solution"], confidence: 0.8 },
    expected: { adType: "product-demo", visualLeadHook: "problem-solution", synthesizePerson: false },
  },
  {
    name: "lifestyle-happy",
    prompt: "Imagine your perfect morning — coffee, sunlight, and our mug in hand",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "lifestyle", hooks: ["relatable-scenario"], confidence: 0.8 },
    expected: { adType: "lifestyle", visualLeadHook: "relatable-scenario", synthesizePerson: false },
  },
  {
    name: "founder-happy-synthesize",
    prompt: "Our founder explains why she started the company",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "founder-pov", hooks: ["confession"], confidence: 0.84 },
    // person required + none uploaded → synthesize, NOT downgrade; confession kept.
    expected: { adType: "founder-pov", visualLeadHook: "confession", synthesizePerson: true },
  },

  // ── reconcile edge cases ─────────────────────────────────────────────────
  {
    name: "product-demo-no-product-downgrades-to-lifestyle",
    prompt: "Show this gadget in action solving the morning rush",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "product-demo", hooks: ["problem-solution"], confidence: 0.66 },
    // product required + no product → downgrade to lifestyle (product optional).
    expected: { adType: "lifestyle", synthesizePerson: false },
  },
  {
    name: "ugc-no-product-downgrades-to-founder",
    prompt: "An honest hands-on take to camera, with no clear product shots",
    input: { hasProduct: false, hasPerson: true },
    rawDetector: { adType: "testimonial", hooks: ["testimonial"], confidence: 0.9 },
    // UGC now needs a product; with a person but no product it downgrades to the
    // person-led founder-pov.
    expected: { adType: "founder-pov", synthesizePerson: false },
  },
  {
    name: "vague-empty-with-product",
    prompt: "make me an ad",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-demo", hooks: ["curiosity-gap"], confidence: 0.35 },
    // confidence < 0.55 but the pick IS the asset-implied default → no override.
    expected: { adType: "product-demo", synthesizePerson: false },
  },
  {
    name: "vague-empty-no-assets",
    prompt: "",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "brand-story", hooks: ["pattern-interrupt"], confidence: 0.3 },
    expected: { adType: "brand-story", synthesizePerson: false },
  },

  // ── clamp / alias safety net ─────────────────────────────────────────────
  {
    name: "clamp-near-miss",
    prompt: "honest review of these shoes",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "testimonal", hooks: ["problem-solution"], confidence: 0.9 }, // typo
    expected: { adType: "testimonial", synthesizePerson: false },
  },
  {
    name: "clamp-garbage-no-assets",
    prompt: "???",
    input: { hasProduct: false, hasPerson: false },
    rawDetector: { adType: "qwerty-nonsense", hooks: [], confidence: 0.9 },
    expected: { adType: "service", synthesizePerson: false },
  },
  {
    name: "clamp-legacy-ugc-alias",
    prompt: "ugc review",
    input: { hasProduct: true, hasPerson: true },
    rawDetector: { adType: "ugc", hooks: ["problem-solution"], confidence: 0.9 },
    expected: { adType: "testimonial", synthesizePerson: false },
  },
  {
    name: "clamp-dropped-type-alias-product-showcase",
    prompt: "Glossy hero shots showing off our new headphones",
    input: { hasProduct: true, hasPerson: false },
    rawDetector: { adType: "product-showcase", hooks: ["curiosity-gap"], confidence: 0.9 },
    // dropped type → legacy alias resolves to product-demo.
    expected: { adType: "product-demo", synthesizePerson: false },
  },
];
