// Prompt module for the confirm-mode feedback interpreter.
//
// At a confirm-mode gate the user replies in free text. This classifies the
// reply into an intent (`approve` → continue, `revise` → regenerate) and, at
// the reference gate (where BOTH the product and person sheets are shown),
// which sheet to redo (`target`). The raw message — when `revise` — is threaded
// into the generation prompt downstream, so this skill ONLY decides routing.

import type { ChatMessage } from "../../../providers/openai/index.js";

export type FeedbackStage = "reference" | "storyboard";

export interface InterpretFeedbackPromptInput {
  /** Which gate the reply is for. */
  stage: FeedbackStage;
  /** The user's free-text reply at the gate. */
  message: string;
}

/** Shape the LLM must return as strict JSON. */
export interface FeedbackPlan {
  intent: "approve" | "revise";
  /** Reference gate only: which sheet to redo. Null/ignored at the storyboard gate. */
  target: "product" | "person" | null;
}

export function buildInterpretFeedbackPrompt({
  stage,
  message,
}: InterpretFeedbackPromptInput): ChatMessage[] {
  const stageBlock =
    stage === "reference"
      ? [
          "The user is reviewing the REFERENCE SHEETS: a PRODUCT reference sheet",
          "and a PERSON reference sheet, both shown together. Classify their reply:",
          '- "approve": satisfied with both, wants to CONTINUE. Signals: "looks',
          '  good", "perfect", "continue", "next", "fine", "yes".',
          '- "revise": wants one of the sheets REGENERATED. Then set "target":',
          '  - "product" when the change is about the product sheet (the product,',
          "    its background, colors, angles, packaging).",
          '  - "person" when the change is about the person sheet (the model/person,',
          "    their face, age, look, wardrobe, pose).",
          '  If revise but the target sheet is unclear, default target to "person".',
        ]
      : [
          "The user is reviewing the STORYBOARD. Classify their reply:",
          '- "approve": satisfied, wants to CONTINUE to the video. Signals: "looks',
          '  good", "perfect", "continue", "next", "fine", "yes".',
          '- "revise": wants the storyboard REGENERATED (any change, fix, or',
          '  dislike). Set "target" to null.',
        ];

  return [
    {
      role: "system",
      content: [
        "You gate an AI ad-video pipeline.",
        ...stageBlock,
        "",
        "Decision rule: if the message contains ANY change request — even mixed",
        '  with praise ("nice, but make the person younger") — choose "revise".',
        '  Only choose "approve" when the message is purely approval.',
        "",
        'Return STRICT JSON only: {"intent": "approve" | "revise", "target": "product" | "person" | null}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `User reply:\n${message}`,
    },
  ];
}
