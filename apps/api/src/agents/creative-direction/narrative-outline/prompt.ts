// Prompt module for the Creative Direction Agent's 60s narrative outliner.
//
// One LLM call, run once for a 60s run AFTER the reference phase (so the product
// + person briefs exist) and BEFORE any storyboard renders. It plans the whole
// 60-second arc as FOUR segment summaries — the continuity contract every
// downstream storyboard and video segment is held to. This is what breaks the
// circular dependency ("each storyboard needs the others' summaries"): the
// summaries are planned up front by one brain, so all four read as ONE ad.

import type { AdType } from "@ugc/shared";
import type { ChatMessage } from "../../../providers/openai/index.js";
import type { NarrativeOutline, ProductUse } from "../../types.js";

export interface NarrativeOutlinePromptInput {
  adStyle: string;
  adType: AdType;
  productBrief: string;
  productUse?: ProductUse;
  personBrief: string;
  userPrompt: string;
}

/** Strict-JSON shape the LLM must return — exactly four ordered segments. */
export type NarrativeOutlinePlan = NarrativeOutline;

function productUseLine(use?: ProductUse): string | null {
  if (!use) return null;
  const parts = [
    use.accessVerb && `access: ${use.accessVerb}`,
    use.changedState && `then: ${use.changedState}`,
    use.persistenceCue && `persists: ${use.persistenceCue}`,
    use.useVerb && `use: ${use.useVerb}`,
    use.functionSignal && `visible effect: ${use.functionSignal}`,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

export function buildNarrativeOutlinePrompt(
  input: NarrativeOutlinePromptInput,
): ChatMessage[] {
  const isUgc = input.adType === "ugc";
  const useLine = productUseLine(input.productUse);

  return [
    {
      role: "system",
      content: [
        "You are the Creative Direction Agent for an AI ad-video generator.",
        "Plan a single 60-second ad as FOUR consecutive ~15-second segments.",
        "Return the plan as strict JSON. Each segment is one beat of ONE story —",
        "together they must feel like a single continuous video, not four clips.",
        "",
        "Shape the arc across the four segments (a natural ad progression):",
        "  - Segment 0 — HOOK: open on the person + product, grab attention.",
        "  - Segment 1 — PRODUCT IN USE: the person actually uses the product.",
        "  - Segment 2 — BENEFIT / PROOF: the payoff, the result, why it matters.",
        "  - Segment 3 — CLOSE: a natural resolution / honest final thought — never",
        "    a sales pitch or call-to-action.",
        "Adapt the beats to THIS product and prompt, but keep a clear beginning →",
        "middle → end. The `beat` field names the act in 2–4 words.",
        "",
        "Each `summary` is 2–3 sentences describing ONLY that segment's ~15s:",
        "the setting (a real, ordinary place that fits how the product is actually",
        "used — not a styled studio or stock-commercial cliché), what the person",
        "does, the product's visible state, and the spoken beat. CONTINUITY IS THE",
        "POINT — write the four so that:",
        "  - the SAME person and wardrobe appear throughout;",
        "  - the product's state carries FORWARD (if it is opened/used in an early",
        "    segment, it stays that way later — never silently resets);",
        "  - time of day and location progress coherently (no impossible jumps);",
        "  - each segment hands off cleanly to the next.",
        isUgc
          ? "Treatment: UGC — a real person casually talking about the product the way they actually speak (not a scripted ad or review read). The spoken beat in each summary is a natural first-person line."
          : "Treatment: inspirational — a cinematic scene carried by voiceover narration. The spoken beat in each summary is a voiceover line.",
        useLine
          ? `Respect how the product is actually operated across the arc: ${useLine}.`
          : "",
        "",
        "Do NOT write camera directions, shot lists, or panel captions — that is the",
        "storyboard agent's job. Stay at the level of story beats and continuity.",
        "",
        "Also author ONE `visualStyle` bible — the SINGLE locked look applied to all",
        "four segments so the 60s reads as one film. 2–4 sentences covering: the",
        "color grade/palette, film stock or lens character, the lighting language,",
        "and the time-of-day arc across the four segments. It is a STYLE spec only",
        "(no story, no shots) and stays constant across all four — describe how the",
        "time-of-day shifts WITHIN this one consistent grade, not four different looks.",
        "",
        'Return STRICT JSON only, exactly four segments in order plus visualStyle:',
        '{"segments":[{"index":0,"beat":"<2-4 words>","summary":"<2-3 sentences>"},',
        '{"index":1,...},{"index":2,...},{"index":3,...}],"visualStyle":"<2-4 sentences>"}',
      ]
        .filter(Boolean)
        .join("\n"),
    },
    {
      role: "user",
      content: [
        `Ad style: ${input.adStyle}`,
        `The product is: ${input.productBrief || "(see prompt)"}`,
        input.personBrief ? `On-camera person: ${input.personBrief}` : "",
        "",
        `User prompt:\n${input.userPrompt}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}
