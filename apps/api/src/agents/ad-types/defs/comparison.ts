// ── Comparison (Us-vs-Them) ad type. ────────────────────────────────────────
// NET-NEW type (no legacy mapping). Side-by-side contrast of the product against
// a GENERIC alternative — never a named/depicted real competitor brand or logo.
// LOOK-driven seams defer to the shared `demo_clean` base.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   .claude/skills/ad-type-comparison/SKILL.md

import type { AdTypeDef, FragmentCtx } from "../types.js";
import { lookBase } from "../fragments/looks.js";

const look = lookBase("demo_clean");

export const comparison: AdTypeDef = {
  id: "comparison",
  displayName: "Comparison (Us-vs-Them)",
  description:
    "Side-by-side contrast positioning the product against a generic alternative or 'the old way' ('vs', 'better than', 'don't settle for'), calling out a demonstrable advantage. Differs from before-after (two time states of one user, not a rival) and product-showcase (no contrast reference). Never names or depicts a real competitor brand.",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "required",
    person: "optional",
    rationale:
      "Both the product and the contrast item drive the message; the comparison is often pure split-screen product graphics, so a presenter is optional.",
  },
  lookFamily: "demo_clean",
  defaultHooks: ["unexpected-comparison", "contrarian"],
  allowedHooks: [
    "unexpected-comparison",
    "contrarian",
    "stat-shock",
    "pattern-interrupt",
    "question",
    "negativity-bias",
    "demonstration",
    "before-after",
    "social-proof",
  ],

  fragments: {
    // ---- storyboard seams ----
    storyboardTypeBlock: (_ctx: FragmentCtx) => [
      "AD TYPE — Comparison (a side-by-side us-vs-them contrast):",
      "- The ad sets the product against a GENERIC alternative — 'the old way',",
      "  an 'ordinary [category]', a basic/cheaper version, or the unbranded way",
      "  people used to do it. The whole ad earns ONE clear, demonstrable verdict:",
      "  the product wins. Frame it as 'this vs that', 'better than', or",
      "  'don't settle for ___'.",
      "- BRAND SAFETY — NEVER name, label, depict, or imply a specific real",
      "  competitor brand, product name, or logo. The rival side is ALWAYS a",
      "  generic, unbranded stand-in (a plain/no-name version, a blurred or",
      "  blank-label placeholder, or simply 'the old way'). No recognisable",
      "  trademarks, no real brand text on the losing side.",
      "- Build the contrast visually: split-screen or back-to-back panels with the",
      "  product (the winner) on one side and the generic alternative on the other,",
      "  each panel making one concrete point of difference — speed, result,",
      "  quality, ease, or value — shown clearly on the product itself.",
      "- The product is the hero and stays clearly the better option throughout;",
      "  the generic side is plain and underwhelming by contrast, never sabotaged",
      "  in a fake or dishonest way. End on the product as the obvious choice.",
      "- Each scene's `transcript` is one short VOICEOVER line for that panel that",
      "  states or sharpens the contrast (e.g. 'the old way takes twice as long')",
      "  — spoken over the visuals, not lip-synced by anyone on screen. The lines",
      "  read as one confident, continuous voiceover.",
    ],
    storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx), // LOOK-driven
    storyboardSpeakerLabel: (_ctx) => ["the voiceover"],
    storyboardCaptionStyle: (ctx) => look.captionStyle(ctx), // LOOK-driven
    storyboardTranscriptStyle: (_ctx) => [
      "- Transcript lines are punchy comparison copy: short, contrastive, and",
      "  confident ('vs', 'better', 'why settle'), each naming ONE point of",
      "  difference. Always against the generic 'old way' / 'ordinary' version —",
      "  never a real competitor brand name.",
    ],
    storyboardShotDirection: (ctx) => look.shotDirection(ctx), // LOOK-driven

    // ---- video seams ----
    videoVoice: (_ctx) => ["a confident, persuasive announcer voice"],
    videoAudioLine: (_ctx) => [
      "Audio: a confident VOICEOVER narrates each comparison line (not lip-synced on screen), the SAME voice throughout; quote each line verbatim in its slice and keep it short and punchy; a light, driving score is allowed under the contrast beats.",
    ],
    videoPacing: (ctx) => look.pacing(ctx), // LOOK-driven

    // ---- narrative seams (30/45/60s) ----
    narrativeTreatment: (_ctx) => [
      "Treatment: comparison — each beat pits the product against a GENERIC alternative ('the old way' / an ordinary [category], never a named competitor), landing one concrete advantage per beat and closing on the product as the obvious better choice. The spoken beat in each summary is a short, contrastive voiceover line.",
    ],
  },
};
