// Template Text-Fill skill — the `template_fill` step.
//
// Once the ad clip is generated, this ONE-SHOT LLM call writes every
// discovered TEXT slot's value from the run's prompt/brand text, replacing
// the template's own placeholder wording. Fully automatic — no manual review
// (the template pipeline redesign's "full auto, no review" decision): the
// user never edits these by hand, unlike the old bring-your-own template
// editor's manual per-layer form.

import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  runTemplateSchema,
  templatePlanSchema,
  type TemplateTextFillEntry,
} from "@ugc/shared";
import { db, schema } from "../../../db/index.js";
import { classifyRunError } from "../../../lib/run-failure.js";
import { latestStoryboardSheet } from "../../creative-direction/inputs.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import { buildTemplateTextFillPrompt } from "./prompt.js";

const templateTextFillReplySchema = z.object({
  fills: z
    .array(
      z.object({
        jobLayerName: z.string().catch(""),
        value: z.string().catch(""),
      }),
    )
    .catch([]),
});
type TemplateTextFillReply = z.infer<typeof templateTextFillReplySchema>;

/**
 * Write every TEXT slot's value for this run's template. Any slot the model
 * misses (or returns blank) falls back to its own placeholder text (the
 * template's original wording) — a slot is never left blank.
 */
export async function fillTemplateText(
  ctx: SkillContext,
): Promise<TemplateTextFillEntry[]> {
  const runId = ctx.runId;
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, runId),
    });
    if (!run) throw new Error(`template_fill: run ${runId} not found`);
    const tpl = runTemplateSchema.parse(run.template);
    const textSlots = tpl.slots.filter((s) => s.asset === "TEXT");

    // An all-media template (no TEXT slots) — nothing to write.
    if (textSlots.length === 0) return [];

    // `template_plan` gave each slot a purpose; the storyboard gave the ad its
    // spoken script. Both make the copy specific to THIS ad instead of a guess
    // from the raw prompt. Either may be absent (a plan that skipped a slot, a
    // storyboard with no transcript) — the placeholder still covers us.
    const plan = templatePlanSchema.safeParse(run.templatePlan).data ?? null;
    const intentByName = new Map(
      (plan?.slots ?? []).map((s) => [s.jobLayerName, s.copyIntent]),
    );
    const transcript = await latestTranscript(runId);

    const messages = buildTemplateTextFillPrompt({
      userPrompt: run.prompt,
      brandText: run.brandText ?? undefined,
      conceptSummary: plan?.conceptSummary || undefined,
      transcript,
      slots: textSlots.map((s) => ({
        jobLayerName: s.jobLayerName,
        currentText: s.currentText,
        copyIntent: intentByName.get(s.jobLayerName),
        charBudget: s.charBudget,
      })),
    });

    // One retry with a larger ceiling on an unparseable reply, same pattern
    // as every other one-shot LLM skill in this codebase. Short, mechanical
    // copywriting — the small backend, not Sonnet.
    let reply: TemplateTextFillReply;
    try {
      const raw = await ctx.openai.chat(messages, {
        backend: "small",
        jsonMode: true,
        maxTokens: 1500,
      });
      reply = parseJsonObject<TemplateTextFillReply>(
        raw,
        templateTextFillReplySchema,
      );
    } catch {
      const raw = await ctx.openai.chat(messages, {
        backend: "small",
        jsonMode: true,
        maxTokens: 2048,
      });
      reply = parseJsonObject<TemplateTextFillReply>(
        raw,
        templateTextFillReplySchema,
      );
    }

    const byName = new Map(reply.fills.map((f) => [f.jobLayerName, f.value]));
    // Map back onto the ORIGINAL slot list by jobLayerName — never trust the
    // model's own list shape/order. The character budget is ENFORCED here, not
    // merely requested in the prompt: an overrun renders clipped in After
    // Effects, and a model that ignores the ceiling must not be able to break
    // the designer's layout.
    return textSlots.map((s) => ({
      jobLayerName: s.jobLayerName,
      value: fitToBudget(
        byName.get(s.jobLayerName)?.trim() || "",
        s.charBudget,
        s.currentText ?? "",
      ),
    }));
  } catch (err) {
    throw classifyRunError(err, "TEMPLATE_FILL_FAILED");
  }
}

/**
 * Keep a written line inside the box the designer drew.
 *
 * An empty line falls back to the template's own placeholder — a slot is never
 * left blank. An overlong line is trimmed at a word boundary; if that leaves a
 * stub (a single very long word), it is cut hard, because a clipped word still
 * beats a clipped layout.
 */
export function fitToBudget(
  value: string,
  budget: number | undefined,
  placeholder: string,
): string {
  const text = value.trim() || placeholder.trim();
  if (!budget || text.length <= budget) return text;

  const clipped = text.slice(0, budget);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only honour the word boundary when it keeps most of the box filled;
  // otherwise a long first word would collapse the line to almost nothing.
  if (lastSpace >= Math.floor(budget * 0.6)) {
    return clipped.slice(0, lastSpace).trimEnd();
  }
  return clipped.trimEnd();
}

/**
 * The spoken script of the generated clip, joined across its scenes. Gives the
 * on-screen copy something to echo, so the ad reads as one piece.
 */
async function latestTranscript(runId: string): Promise<string | undefined> {
  const sheet = await latestStoryboardSheet(runId);
  const scenes = (sheet?.scenes ?? []) as Array<{ transcript?: string }>;
  const lines = scenes
    .map((s) => s.transcript?.trim())
    .filter((l): l is string => Boolean(l));
  return lines.length ? lines.join(" ") : undefined;
}
