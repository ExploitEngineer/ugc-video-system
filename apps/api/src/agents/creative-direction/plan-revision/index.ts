// Creative Direction Agent skill: break a user's revision request into a
// concrete directive.
//
// Invoked by the worker when a confirm-mode run enters `regenerating`. Unlike
// `interpretFeedback` (which only routes approve/revise on the request path),
// this is a VISION call: it inspects the artifact the user is reacting to against
// the product, then emits a structured `RevisionDirective` the image agent can
// execute. Defensive: any failure falls back to a directive that still carries
// the raw request, so a revise never fails the run.

import { parseJsonObject } from "../../json.js";
import type { ImageRef, OpenAIProvider } from "../../../providers/openai/index.js";
import {
  buildRevisionPrompt,
  type RevisionDirective,
  type RevisionStage,
} from "./prompt.js";

export type { RevisionDirective, RevisionStage } from "./prompt.js";

export interface PlanRevisionInput {
  stage: RevisionStage;
  /** The user's free-text revision request (runs.feedback). */
  message: string;
  adStyle: string;
  /** Current person brief — folded into `revisedBrief` at the reference gate. */
  personBrief?: string;
  /** The artifact the user is revising (person sheet or storyboard). */
  currentArtifact: ImageRef;
  /** Product reference sheet, for grounding (optional). */
  productRef?: ImageRef;
}

/** Normalize a parsed directive — coerce shapes, fill the reference-gate brief. */
function normalize(
  plan: Partial<RevisionDirective>,
  input: PlanRevisionInput,
): RevisionDirective {
  const toList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
  const scope: RevisionDirective["scope"] =
    plan.scope === "regenerate" ? "regenerate" : "edit";
  const revisedBrief =
    input.stage === "reference"
      ? (plan.revisedBrief?.trim() || input.personBrief?.trim() || undefined)
      : undefined;
  return {
    changes: toList(plan.changes),
    keep: toList(plan.keep),
    rationale: typeof plan.rationale === "string" ? plan.rationale.trim() : "",
    scope,
    revisedBrief,
  };
}

/** Defensive fallback: keep the change landing even when interpretation fails. */
function fallback(input: PlanRevisionInput): RevisionDirective {
  const msg = input.message.trim();
  const base = input.personBrief?.trim();
  return {
    changes: msg ? [msg] : [],
    keep: [],
    rationale: "",
    // Bias to "edit" so a failed interpretation still anchors on the prior sheet
    // and applies the user's literal text as a targeted change — never silently
    // invents a new person. (Storyboards always regenerate as a whole sheet.)
    scope: "edit",
    revisedBrief:
      input.stage === "reference"
        ? [base, msg && `Requested change: ${msg}`].filter(Boolean).join("\n\n") ||
          undefined
        : undefined,
  };
}

export async function planRevision(
  openai: OpenAIProvider,
  input: PlanRevisionInput,
): Promise<RevisionDirective> {
  try {
    const reply = await openai.chat(
      buildRevisionPrompt({
        stage: input.stage,
        message: input.message,
        adStyle: input.adStyle,
        personBrief: input.personBrief,
        currentArtifact: input.currentArtifact,
        productRef: input.productRef,
      }),
    );
    return normalize(parseJsonObject<Partial<RevisionDirective>>(reply), input);
  } catch {
    return fallback(input);
  }
}
