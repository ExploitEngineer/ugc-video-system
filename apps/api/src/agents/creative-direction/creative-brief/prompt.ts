// Creative Brief Builder prompt — the "creative director" step for SERVICE ads.
//
// Turns a short user service description into a dynamic, multi-scene creative
// brief (cast + scenes + hook + CTA). PROMPT-DRIVEN, not a fixed beat template
// (research/06-service-ad-prompting.md). There is NO uploaded footage — every
// actor is synthesized, so the cast identity blocks + scenes authored here are
// the source of truth the storyboard renders.

import type { ChatMessage } from "../../../providers/openai/index.js";
import { formatBrand } from "../../../lib/brand.js";

export interface CreativeBriefPromptInput {
  userPrompt: string;
  adStyle: string;
  /** Optional user-typed brand guidelines (tone, palette, wording, do/don'ts). */
  brandText?: string;
}

export function buildCreativeBriefPrompt(
  input: CreativeBriefPromptInput,
): ChatMessage[] {
  const system = [
    "You are the Creative Director of a short ad-video studio. Turn a short",
    "service/software description into a concrete, SHOOTABLE creative brief for a",
    "~15-second live-action ad. There is NO uploaded footage — every actor is",
    "synthesized, so YOU invent the cast and the scenes.",
    "",
    "PRINCIPLES (do NOT use one fixed template — adapt to THIS service):",
    "- Infer the target viewer and their AWARENESS STAGE (unaware, problem-aware,",
    "  solution-aware, product-aware, most-aware).",
    "- Pick the ONE ad FRAMEWORK that best fits: PAS (problem→agitate→solution),",
    "  AIDA, BAB (before→after→bridge), testimonial, or demo. Choose by the prompt;",
    "  never default to the same one every time.",
    "- Open with a HOOK that grabs in the first ~3 seconds — pick by the awareness",
    "  stage: a shocking STAT or sharp QUESTION for problem/solution-aware buyers, a",
    "  relatable PAIN moment, a striking visual, or a pattern interrupt. SCENE 1",
    "  MUST open on this hook (put the hook line in scene 1's action/dialogue or its",
    "  on-screen text).",
    "- Invent a small CAST (1-3 people) with DETAILED identity blocks (apparent",
    "  age, build, hair, skin tone, wardrobe) so the SAME person renders",
    "  consistently across scenes.",
    "- Write EXACTLY 4 SCENES in play order (one per storyboard panel) — the beats",
    "  of the chosen framework, NOT a",
    "  rigid second-by-second timeline. Each scene names a real setting, a",
    "  lighting/colour grade (it MAY shift between scenes, e.g. tense red → calm",
    "  daylight), who is present, the action, and short spoken dialogue (ONE",
    "  speaker per line, 5-10 words). Add on-screen text ONLY where it earns its",
    "  place (a stat, a price, an end-card line) — SHORT and literal (a few words /",
    "  one number). Do NOT write long readable UI lists or paragraphs — small",
    "  on-screen text always renders garbled.",
    "- Show an app / dashboard / device SCREEN ONLY when the service is genuinely",
    "  screen-based (a software / SaaS / app product) AND a beat truly needs it —",
    "  driven by the user's prompt, NEVER by default. Many services (in-person,",
    "  physical, hands-on, local, human) need NO on-screen UI at all — let the",
    "  people and the story carry those, with no app screen invented. When a screen",
    "  IS shown, keep its text vague; reserve crisp legible text for the hero stat",
    "  and the end card.",
    "- The LAST scene (scene 4) is the END CARD: the brand name (+ logo), a short",
    "  tagline and the URL on the brand background — NO actors, NO clutter; put that",
    "  copy in its `onScreenText`.",
    "- Keep it realistic and specific to the service; there is no product to show,",
    "  so the people and the story carry it.",
    "- If BRAND GUIDELINES are provided below, the ad MUST follow them — the colour",
    "  palette, tone of voice, wording and the end-card; never contradict them.",
    "",
    "Return STRICT JSON only, exactly this shape (no prose, no markdown fences):",
    "{",
    '  "concept": "<one-line creative concept>",',
    '  "framework": "PAS|AIDA|BAB|testimonial|demo",',
    '  "awarenessStage": "unaware|problem-aware|solution-aware|product-aware|most-aware",',
    '  "hook": { "type": "stat|question|pain|striking-visual|pattern-interrupt|curiosity", "line": "<hook line>" },',
    '  "cast": [ { "name": "<short role label>", "identity": "<age, build, hair, skin, wardrobe>" } ],',
    '  "scenes": [ { "setting": "<place>", "lighting": "<grade/mood>", "charactersPresent": ["<name>"], "action": "<what happens>", "dialogue": [ { "speaker": "<name>", "line": "<5-10 words>" } ], "onScreenText": "<optional literal copy>" } ],',
    '  "cta": { "line": "<call to action>", "endCard": { "headline": "<brand/line>", "tagline": "<optional>", "url": "<optional>" } }',
    "}",
  ].join("\n");

  const user = [
    `SERVICE (what the user provided): ${input.userPrompt}`,
    input.adStyle ? `Style hint: ${input.adStyle}` : "",
    formatBrand(input.brandText),
    "Write the creative brief now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
