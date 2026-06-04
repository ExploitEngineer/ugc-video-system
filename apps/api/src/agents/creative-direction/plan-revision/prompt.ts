// Prompt module for the confirm-mode revision planner.
//
// When a user REVISES a gated artifact, their reply is often vague ("the person
// doesn't match the product", "this looks off"). This skill turns that into a
// concrete, actionable directive by INSPECTING the artifact the user is reacting
// to (vision) against the product, then breaking the feedback down into:
//   - `changes`: the specific edits to apply
//   - `keep`:    what the user liked / must be preserved
//   - `rationale`: why, grounded in the product + ad
//   - `scope`:   "edit" (keep the subject, change aspects) vs "regenerate" (new subject)
//   - `revisedBrief`: the person brief rewritten to fold the changes in (reference gate)
//
// Nothing is forced/defaulted: the directive reflects ONLY what the user asked.

import type { ChatMessage, ImageRef } from "../../../providers/openai/index.js";

export type RevisionStage = "reference" | "storyboard";

export interface RevisionPromptInput {
  stage: RevisionStage;
  /** The user's free-text revision request. */
  message: string;
  adStyle: string;
  /** Current person brief — only meaningful at the reference gate. */
  personBrief?: string;
  /** The artifact the user is revising (person sheet or storyboard) — vision. */
  currentArtifact: ImageRef;
  /** The product reference sheet, attached for grounding (optional). */
  productRef?: ImageRef;
}

/** Concrete, structured revision directive — the breakdown of the user's feedback. */
export interface RevisionDirective {
  /** The specific edits to apply. Empty only when nothing actionable was asked. */
  changes: string[];
  /** What the user liked / must be preserved across the regeneration. */
  keep: string[];
  /** Why these changes — grounded in the product and the ad. */
  rationale: string;
  /** "edit" keeps the existing subject and changes aspects; "regenerate" makes a new one. */
  scope: "edit" | "regenerate";
  /** Reference gate only: the person brief rewritten to fold `changes` in. */
  revisedBrief?: string;
}

export function buildRevisionPrompt({
  stage,
  message,
  adStyle,
  personBrief,
  currentArtifact,
  productRef,
}: RevisionPromptInput): ChatMessage[] {
  const style = adStyle.trim() || "clean, neutral commercial";
  const brief = personBrief?.trim();

  const stageBlock =
    stage === "reference"
      ? [
          "The user is revising the PERSON reference sheet (a 2×2 multi-view sheet",
          "of one person). The FIRST attached image is that person sheet; the",
          "SECOND, when present, is the PRODUCT reference sheet — for GROUNDING only.",
          "The product sheet must NEVER be changed: ignore any request about the",
          "product itself and only adjust the person.",
          "",
          "Decide `scope`:",
          '- "edit": the user wants the SAME person kept, with specific aspects',
          "  changed (wardrobe, hair, pose, styling, palette). Put the things to",
          "  preserve (face, age, build, identity) in `keep`.",
          '- "regenerate": the user wants a DIFFERENT person (different age, gender',
          "  presentation, ethnicity, overall look). Then `keep` may be empty.",
          "",
          "ALSO return `revisedBrief`: the person brief below, REWRITTEN so it fully",
          "states the person to generate AFTER applying the changes — self-contained",
          "(explicit demographics, wardrobe, colors), never 'matching the product'.",
          "Keep everything the user did not ask to change; fold in everything they did.",
          `Current person brief: ${brief || "(none)"}`,
        ]
      : [
          "The user is revising the STORYBOARD sheet (a 2×2 grid of four labelled",
          "keyframe panels for one ~15s ad). The FIRST attached image is that",
          "storyboard; the SECOND, when present, is the PRODUCT reference sheet.",
          "",
          "Set `scope` to \"regenerate\" (storyboards are always rebuilt as a whole",
          "sheet). Put the concrete fixes in `changes` and what to preserve in `keep`.",
          "Leave `revisedBrief` empty/omitted.",
        ];

  const system = [
    "You are the Creative Direction Agent breaking down a user's revision request",
    "for an AI ad-video pipeline. The user gave free-text feedback that may be",
    "vague or implicit. Your job is to figure out what they ACTUALLY want and turn",
    "it into precise, actionable instructions for the image agent.",
    "",
    "INSPECT the attached image(s). Read the user's words literally AND in context:",
    "if they say a result 'does not match the product', look at the product and",
    "infer the concrete mismatch (e.g. a formal/professional product implies the",
    "person should be dressed professionally with full coverage, not casual or",
    "revealing). Translate vague feedback into specific, visual changes.",
    "",
    "Apply ONLY what the user asked for — do not invent unrelated changes and do",
    "not change things they did not mention. Be concrete: each item in `changes`",
    "should be a clear visual instruction the image agent can execute.",
    "",
    ...stageBlock,
    "",
    `Ad style for context: "${style}".`,
    "",
    "Return STRICT JSON only, no prose, matching:",
    '{ "changes": string[], "keep": string[], "rationale": string, "scope": "edit" | "regenerate", "revisedBrief": string }',
    'Omit or set "revisedBrief" to "" when not at the reference gate.',
  ].join("\n");

  const images: ImageRef[] = [currentArtifact];
  if (productRef) images.push(productRef);

  const user: ChatMessage = {
    role: "user",
    content: [
      `User revision request:\n${message}`,
      "",
      "The image(s) under review are attached. Break the request down into the",
      "strict-JSON directive.",
    ].join("\n"),
    images,
  };

  return [{ role: "system", content: system }, user];
}
