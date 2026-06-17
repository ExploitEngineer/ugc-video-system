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
  /** Number of ~15s segments for this run — `segmentCountFor(duration)` (1–4).
   *  The outline is sliced to exactly this many segments. */
  segmentCount: number;
}

/**
 * Default segment cap for the (dormant) narrative-outline planner. Live segment
 * counts are duration-driven via `segmentCountFor(run.duration)` (1/2/3/4).
 */
export const SEGMENT_COUNT = 4;

/**
 * Panels per ~15s segment row in a multi-segment master sheet. Each row's four
 * panels (`4i+1 … 4i+4`) are re-tiled into a 2×2 block by `cropRowsAs2x2`, so a
 * segment clip carries the SAME four-panel shot guide a 15s run uses. A run with
 * N segments has an N×4 master (8/12/16 panels for 30/45/60s).
 */
export const PANELS_PER_SEGMENT = 4;

const FALLBACK_BEATS = ["hook", "product in use", "benefit", "close"];

/**
 * Coerce the LLM plan into exactly `segmentCount` ordered, non-empty segments
 * (the run's real duration-driven count, 1–4). A short or malformed reply is
 * padded with neutral placeholders so the pipeline never stalls on a flaky
 * outline (downstream storyboards still have the refs to lean on); an over-long
 * reply is clamped to `segmentCount`.
 */
function normalize(
  plan: NarrativeOutlinePlan,
  segmentCount: number,
): NarrativeOutline {
  const raw = Array.isArray(plan?.segments) ? plan.segments : [];
  const segments: SegmentSummary[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const s = raw[i];
    segments.push({
      index: i,
      beat: s?.beat?.trim() || FALLBACK_BEATS[i] || `segment ${i + 1}`,
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

  return normalize(plan, input.segmentCount);
}
