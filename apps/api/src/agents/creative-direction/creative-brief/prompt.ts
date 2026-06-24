// Creative Brief Builder prompt — the "creative director" step for SERVICE ads.
//
// Turns a short user service description into a dynamic, multi-scene creative
// brief (cast + scenes + hook + CTA). PROMPT-DRIVEN, not a fixed beat template
// (research/06-service-ad-prompting.md). There is NO uploaded footage — every
// actor is synthesized, so the cast identity blocks + scenes authored here are
// the source of truth the storyboard renders.

import type { ChatMessage } from "../../../providers/openai/index.js";

export interface CreativeBriefPromptInput {
  userPrompt: string;
  adStyle: string;
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
    "- Open with a HOOK that grabs in the first ~3 seconds: a striking visual, a",
    "  shocking stat, a sharp question, a relatable pain, or a pattern interrupt —",
    "  whatever fits THIS service.",
    "- Invent a small CAST (1-3 people) with DETAILED identity blocks (apparent",
    "  age, build, hair, skin tone, wardrobe) so the SAME person renders",
    "  consistently across scenes.",
    "- Write 3-4 SCENES in play order — the beats of the chosen framework, NOT a",
    "  rigid second-by-second timeline. Each scene names a real setting, a",
    "  lighting/colour grade (it MAY shift between scenes, e.g. tense red → calm",
    "  daylight), who is present, the action, and short spoken dialogue (ONE",
    "  speaker per line, 5-10 words). Add on-screen text ONLY where it earns its",
    "  place (a stat, a price, an end-card line) — short and literal.",
    "- End with a clear CTA and a simple end-card line.",
    "- Keep it realistic and specific to the service; there is no product to show,",
    "  so the people and the story carry it.",
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
    "Write the creative brief now, as STRICT JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
