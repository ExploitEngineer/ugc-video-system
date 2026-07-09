// Template Plan skill — the `template_plan` step.
//
// Runs FIRST, before any image or video spend. One cheap call on the small model
// turns the template's slot inventory + the ad brief into a per-slot plan that
// every downstream agent reads. That single plan is what stops the copy, the
// generated stills and the clip from describing three unrelated ads.

import { eq } from "drizzle-orm";

import {
  runTemplateSchema,
  templatePlanSchema,
  type TemplatePlan,
  type TemplateSlot,
  type TemplateSlotPlan,
} from "@ugc/shared";

import { db, schema } from "../../../db/index.js";
import { createLogger } from "../../../lib/log.js";
import { classifyRunError } from "../../../lib/run-failure.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import { buildTemplatePlanPrompt, type PlanSlotInput } from "./prompt.js";

const log = createLogger("template-plan");

/**
 * Which slots the model is even allowed to see.
 *
 * IMAGE slots the deterministic heuristic called `brand` (a logo) or
 * `decorative` (a background) are withheld entirely — a generated photo in a
 * logo layer is wrong every time, so the model never gets the chance to argue.
 * AUDIO slots keep the template's own track in v1.
 */
export function planningSlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter((s) => {
    if (s.asset === "AUDIO") return false;
    if (s.asset === "IMAGE") return s.imageClass === "content";
    return true;
  });
}

const toPromptSlot = (s: TemplateSlot): PlanSlotInput => ({
  jobLayerName: s.jobLayerName,
  asset: s.asset as "VIDEO" | "IMAGE" | "TEXT",
  currentText: s.currentText,
  charBudget: s.charBudget,
  width: s.width,
  height: s.height,
});

/**
 * Merge the model's reply onto OUR slot list, keyed by `jobLayerName`.
 *
 * The model's order, its slot count, and any slot it invents are all ignored:
 * every entry here comes from the template's real structure. A slot the model
 * skipped still gets a plan entry, just an empty one, so downstream agents can
 * rely on the plan having a row per slot.
 *
 * `fill` is decided deterministically rather than taken on trust: a slot is
 * generated only when the model actually described what to depict. "Fill this,
 * but I won't say with what" is not a plan, and the template's own artwork is
 * always the safer fallback.
 */
export function reconcilePlan(
  slots: TemplateSlot[],
  reply: TemplatePlan,
): TemplateSlotPlan[] {
  const byName = new Map(reply.slots.map((s) => [s.jobLayerName, s]));

  return slots.map((slot) => {
    const got = byName.get(slot.jobLayerName);
    const base: TemplateSlotPlan = {
      jobLayerName: slot.jobLayerName,
      asset: slot.asset,
      role: got?.role?.trim() ?? "",
    };

    if (slot.asset === "TEXT") {
      return { ...base, copyIntent: got?.copyIntent?.trim() || undefined };
    }
    if (slot.asset === "IMAGE") {
      const subject = got?.imageSubject?.trim();
      // Explicit `false` vetoes; a missing `fill` with a real subject is a yes.
      const fill = Boolean(subject) && got?.fill !== false;
      return {
        ...base,
        fill,
        imageSubject: fill ? subject : undefined,
      };
    }
    return { ...base, videoScene: got?.videoScene?.trim() || undefined };
  });
}

/**
 * Plan every fillable slot of this run's template.
 *
 * Persisted by the orchestrator to `runs.template_plan`. Never throws a raw
 * error: failures surface as `TEMPLATE_PLAN_FAILED`, which is a hard fail —
 * nothing downstream has run, so recovery restarts the run cheaply.
 */
export async function planTemplate(ctx: SkillContext): Promise<TemplatePlan> {
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, ctx.runId),
    });
    if (!run) throw new Error(`template_plan: run ${ctx.runId} not found`);

    const tpl = runTemplateSchema.parse(run.template);
    const slots = planningSlots(tpl.slots);

    // An all-decorative template (no text, no fillable image, just the clip) has
    // nothing to plan beyond the video scene — but the video slot always exists,
    // so `slots` is never empty here.
    const messages = buildTemplatePlanPrompt({
      userPrompt: run.prompt,
      adType: run.adType ?? "",
      adStyle: run.adStyle ?? "",
      brandText: run.brandText ?? undefined,
      productBrief: run.productBrief ?? undefined,
      clipSeconds: tpl.metadata.clipSeconds,
      aspectRatio: tpl.metadata.aspectRatio ?? ctx.aspectRatio,
      slots: slots.map(toPromptSlot),
    });

    // One retry with a larger ceiling on an unparseable reply — the same pattern
    // every other one-shot skill in this codebase uses.
    let reply: TemplatePlan;
    try {
      const raw = await ctx.openai.chat(messages, {
        backend: "small",
        jsonMode: true,
        maxTokens: 1500,
      });
      reply = parseJsonObject<TemplatePlan>(raw, templatePlanSchema);
    } catch {
      log.warn("template plan: first reply unparseable — retrying");
      const raw = await ctx.openai.chat(messages, {
        backend: "small",
        jsonMode: true,
        maxTokens: 2500,
      });
      reply = parseJsonObject<TemplatePlan>(raw, templatePlanSchema);
    }

    const planned = reconcilePlan(slots, reply);
    const fills = planned.filter((s) => s.asset === "IMAGE" && s.fill).length;
    log.info("✓ template planned", {
      slots: planned.length,
      imagesToGenerate: fills,
    });

    return {
      conceptSummary: reply.conceptSummary?.trim() ?? "",
      slots: planned,
    };
  } catch (err) {
    throw classifyRunError(err, "TEMPLATE_PLAN_FAILED");
  }
}
