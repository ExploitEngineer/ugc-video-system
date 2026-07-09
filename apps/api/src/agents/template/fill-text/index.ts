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
import { runTemplateSchema, type TemplateTextFillEntry } from "@ugc/shared";
import { db, schema } from "../../../db/index.js";
import { classifyRunError } from "../../../lib/run-failure.js";
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

    const messages = buildTemplateTextFillPrompt({
      userPrompt: run.prompt,
      brandText: run.brandText ?? undefined,
      adType: run.adType ?? "",
      adStyle: run.adStyle ?? "",
      slots: textSlots.map((s) => ({
        jobLayerName: s.jobLayerName,
        currentText: s.currentText,
      })),
    });

    // One retry with a larger ceiling on an unparseable reply, same pattern
    // as every other one-shot LLM skill in this codebase.
    let reply: TemplateTextFillReply;
    try {
      const raw = await ctx.openai.chat(messages, {
        jsonMode: true,
        maxTokens: 1500,
      });
      reply = parseJsonObject<TemplateTextFillReply>(
        raw,
        templateTextFillReplySchema,
      );
    } catch {
      const raw = await ctx.openai.chat(messages, {
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
    // model's own list shape/order.
    return textSlots.map((s) => ({
      jobLayerName: s.jobLayerName,
      value: byName.get(s.jobLayerName)?.trim() || s.currentText || "",
    }));
  } catch (err) {
    throw classifyRunError(err, "TEMPLATE_FILL_FAILED");
  }
}
