// ── Ad type: Product Showcase (NET-NEW, no legacy mapping). ──────────────────
// Hero/glamour treatment — the product is the subject, shown off as static beauty
// + features/benefits with NO narrative arc and NO step-by-step in-use function.
// LOOK-driven seams defer to the shared `demo_clean` base (clean studio/tabletop
// product photography). TYPE-driven seams are authored here, concise + on-brand.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-product-showcase/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("demo_clean");

export const productShowcase: AdTypeDef = {
  id: "product-showcase",
  displayName: "Product Showcase",
  description:
    "Hero/glamour shots of the product showing it off — static beauty plus features/benefits, with NO narrative and NO step-by-step. Differs from product-demo (no visible in-use function) and lifestyle (isolated hero, not product in a human context).",
  whenToUse: "consideration",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "The product is the subject and cannot be skipped; a person is at most a background prop, so person stays optional.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["bold-claim", "curiosity-gap", "stat-shock"],
  allowedHooks: [
    "bold-claim",
    "curiosity-gap",
    "stat-shock",
    "pattern-interrupt",
    "question",
    "before-after",
    "demonstration",
    "unexpected-comparison",
    "social-proof",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Product Showcase (a hero/glamour reveal of the product itself):",
      "- The ad SHOWS OFF the product as the undisputed star — clean, premium",
      "  beauty shots that make it look its best. NOT a person reviewing it, NOT a",
      "  how-to / in-use walkthrough, and NOT a story or lifestyle scene.",
      "- Across the panels, present the product directly: a confident hero shot,",
      "  flattering angles, and tight macro details that call out its key features,",
      "  materials and finish. Each panel highlights ONE selling point (a standout",
      "  feature or benefit) so the set reads as a feature/benefit montage, not a",
      "  sequence of actions or steps. Do NOT demonstrate it functioning in use.",
      "- Keep the product the clear focus of every panel — large, sharp and",
      "  unobstructed on a clean surface or backdrop. A person, if any, is only a",
      "  background prop and never takes over the frame.",
      "- Each scene's `transcript` is one short VOICEOVER line naming the feature or",
      "  benefit that panel shows off (crisp, confident, benefit-forward — like",
      "  premium ad copy, not conversation). The four lines read as one cohesive",
      "  voiceover building the product's appeal.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "Each transcript line is third-person product/benefit copy spoken as",
      "voiceover (no first-person 'I', no in-use narration) — one feature or",
      "benefit per line, short and confident.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a polished, confident premium-brand announcer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a polished VOICEOVER (not lip-synced on screen) states each feature/benefit line in the SAME confident voice throughout; quote each line verbatim in its slice and keep it short; a tasteful, upscale score and subtle product-foley accents are allowed.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: Product Showcase — a hero montage that shows the product off with glamour shots and tight feature/benefit details, no story arc and no in-use steps. The spoken beat in each summary is a confident voiceover line naming one feature or benefit.",
    ],
  },
};
