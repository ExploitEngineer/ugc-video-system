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
}

export function buildInterpretFeedbackPrompt({
  stage,
  message,
}: InterpretFeedbackPromptInput): ChatMessage[] {
  const stageBlock =
    stage === "reference"
      ? [
          "The user is reviewing the PERSON reference sheet. (A product reference",
          "sheet also exists but is HIDDEN from the user and must NEVER be changed —",
          "ignore any remark about the product.) Classify their reply:",
          '- "approve": satisfied / wants to CONTINUE, OR the message is only about',
          "  the product (nothing to change on the person). Signals of approval:",
          '  "looks good", "perfect", "continue", "next", "fine", "yes".',
          '- "revise": the user wants the PERSON changed (their face, age, look,',
          "  wardrobe, pose, styling).",
        ]
      : [
          "The user is reviewing the STORYBOARD. Classify their reply:",
          '- "approve": satisfied, wants to CONTINUE to the video. Signals: "looks',
          '  good", "perfect", "continue", "next", "fine", "yes".',
          '- "revise": wants the storyboard REGENERATED (any change, fix, or dislike).',
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
        'Return STRICT JSON only: {"intent": "approve" | "revise"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: `User reply:\n${message}`,
    },
  ];
}
