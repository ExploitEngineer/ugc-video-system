// Creative Direction Agent skill: classify a confirm-mode gate reply → routing.
//
// One small LLM call invoked by the /runs/:id/feedback route. Returns the
// intent (`approve` continue / `revise` regenerate) and, at the reference gate,
// which sheet to redo (`target`). Defaults to `revise` on any parse failure —
// never silently advance a result the user might be rejecting.

import { parseJsonObject } from "../../json.js";
import type { OpenAIProvider } from "../../../providers/openai/index.js";
import {
  buildInterpretFeedbackPrompt,
  type FeedbackPlan,
  type FeedbackStage,
} from "./prompt.js";

export interface InterpretFeedbackInput {
  /** Which gate the reply is for. */
  stage: FeedbackStage;
  /** The user's free-text reply. */
  message: string;
}

export interface FeedbackVerdict {
  intent: "approve" | "revise";
  /** Reference gate: "product" | "person". Storyboard gate: null. */
  target: "product" | "person" | null;
}

export async function interpretFeedback(
  openai: OpenAIProvider,
  input: InterpretFeedbackInput,
): Promise<FeedbackVerdict> {
  // Reference gate defaults to the person sheet when revising; storyboard gate
  // has no per-sheet target.
  const fallbackTarget = input.stage === "reference" ? "person" : null;
  try {
    const reply = await openai.chat(
      buildInterpretFeedbackPrompt({ stage: input.stage, message: input.message }),
    );
    const plan = parseJsonObject<FeedbackPlan>(reply);
    if (plan.intent === "approve") return { intent: "approve", target: null };
    const target =
      input.stage === "reference"
        ? plan.target === "product"
          ? "product"
          : "person"
        : null;
    return { intent: "revise", target };
  } catch {
    // Safer to regenerate than to advance a result the user may dislike.
    return { intent: "revise", target: fallbackTarget };
  }
}
