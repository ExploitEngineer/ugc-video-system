// Creative Direction Agent skill: plan the 60s arc → four segment summaries.
//
// One LLM call, run once for a 60s run after the reference phase and before any
// storyboard. The orchestrator persists the result to `runs.narrativeOutline`
// and threads each segment's summary (+ the other three) into the matching
// `segment_storyboard` and `segment_video`. See ./prompt.ts for the why.

import { parseJsonObject } from "../../json.js";
import type { NarrativeOutline, SegmentSummary, SkillContext } from "../../types.js";
import { buildNarrativeOutlinePrompt, type NarrativeOutlinePlan } from "./prompt.js";

export interface NarrativeOutlineInput {
  userPrompt: string;
}

/** The fixed number of segments in a 60s ad (4 × ~15s). */
export const SEGMENT_COUNT = 4;

const FALLBACK_BEATS = ["hook", "product in use", "benefit", "close"];

/**
 * Coerce the LLM plan into exactly four ordered, non-empty segments. A short or
 * malformed reply is padded with neutral placeholders so the pipeline never
 * stalls on a flaky outline (downstream storyboards still have the refs to lean
 * on); an over-long reply is clamped to four.
 */
function normalize(plan: NarrativeOutlinePlan): NarrativeOutline {
  const raw = Array.isArray(plan?.segments) ? plan.segments : [];
  const segments: SegmentSummary[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const s = raw[i];
    segments.push({
      index: i,
      beat: s?.beat?.trim() || FALLBACK_BEATS[i],
      summary: s?.summary?.trim() || "",
    });
  }
  return { segments, visualStyle: plan?.visualStyle?.trim() || "" };
}

export async function narrativeOutline(
  ctx: SkillContext,
  input: NarrativeOutlineInput,
): Promise<NarrativeOutline> {
  const messages = buildNarrativeOutlinePrompt({
    adStyle: ctx.adStyle,
    adType: ctx.adType,
    productBrief: ctx.productBrief,
    productUse: ctx.productUse,
    personBrief: ctx.personBrief,
    userPrompt: input.userPrompt,
  });

  let plan: NarrativeOutlinePlan;
  try {
    const reply = await ctx.openai.chat(messages, { jsonMode: true });
    plan = parseJsonObject<NarrativeOutlinePlan>(reply);
  } catch {
    // Retry once with a higher token ceiling — the four summaries can run long.
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      maxTokens: 4096,
    });
    plan = parseJsonObject<NarrativeOutlinePlan>(reply);
  }

  return normalize(plan);
}
