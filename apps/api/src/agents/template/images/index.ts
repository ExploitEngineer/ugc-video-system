// Template Images skill — the `template_images` step.
//
// One gpt-image-2 still per fillable IMAGE slot, sized to that slot's own
// geometry and conditioned on `template_plan`'s subject plus the product
// reference sheet, so the stills belong to the SAME ad as the clip and the copy.
//
// This step NEVER hard-fails. A slot that cannot be generated keeps the
// template's own artwork, which is always a valid render. One bad image must not
// destroy a run that is about to pay for a video.

import { and, eq } from "drizzle-orm";

import {
  runTemplateSchema,
  templatePlanSchema,
  type TemplatePlan,
  type TemplateSlot,
} from "@ugc/shared";

import { db, schema } from "../../../db/index.js";
import { neutralizeCast } from "../../../lib/image/color.js";
import { createLogger } from "../../../lib/log.js";
import { latestProductSheet } from "../../creative-direction/inputs.js";
import { writeStepEvent } from "../../events.js";
import { persistAsset } from "../../persist.js";
import type { SkillContext } from "../../types.js";
import { gptImageSizeForSlot } from "../geometry.js";
import { buildTemplateImagePrompt } from "./prompt.js";

const log = createLogger("template-images");

/** Generate at most this many stills at once — gpt-image-2 is slow and heavy. */
const CONCURRENCY = 2;

export interface PlannedImage {
  slot: TemplateSlot;
  imageSubject: string;
  role?: string;
}

/**
 * The slots this step will actually generate.
 *
 * Three gates, all of which must pass:
 *   1. the deterministic heuristic called it `content` (never a logo/background)
 *   2. the plan agent set `fill`
 *   3. the plan agent said WHAT to depict
 *
 * Pure, so the selection rules are unit-testable without an LLM or a DB.
 */
export function plannedImages(
  slots: TemplateSlot[],
  plan: TemplatePlan | null,
): PlannedImage[] {
  const byName = new Map((plan?.slots ?? []).map((s) => [s.jobLayerName, s]));
  const out: PlannedImage[] = [];
  for (const slot of slots) {
    if (slot.asset !== "IMAGE" || slot.imageClass !== "content") continue;
    const planned = byName.get(slot.jobLayerName);
    const subject = planned?.imageSubject?.trim();
    if (!planned?.fill || !subject) continue;
    out.push({ slot, imageSubject: subject, role: planned.role || undefined });
  }
  return out;
}

/** `jobLayerName`s that already have a persisted still — a crash-resume skip. */
async function alreadyGenerated(runId: string): Promise<Set<string>> {
  const rows = await db
    .select({ meta: schema.assets.meta })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.runId, runId),
        eq(schema.assets.kind, "template_image"),
      ),
    );
  const names = new Set<string>();
  for (const r of rows) {
    const name = (r.meta as { jobLayerName?: string } | null)?.jobLayerName;
    if (name) names.add(name);
  }
  return names;
}

/** Run `work` over `items`, at most `limit` at a time. */
async function bounded<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      const item = items[i];
      if (item === undefined) return;
      await work(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Generate every fillable IMAGE slot for this run's template.
 *
 * Writes its own step events. Records which slots fell back to the template's
 * own artwork in the `passed` payload, so a half-filled template is visible in
 * the timeline rather than silently shipped.
 */
export async function generateTemplateImages(ctx: SkillContext): Promise<void> {
  const runId = ctx.runId;
  const step = "template_images" as const;
  await writeStepEvent({ runId, step, status: "started" });

  const run = await db.query.runs.findFirst({
    where: eq(schema.runs.id, runId),
  });
  if (!run) throw new Error(`template_images: run ${runId} not found`);

  const tpl = runTemplateSchema.parse(run.template);
  const plan = templatePlanSchema.safeParse(run.templatePlan).data ?? null;
  const wanted = plannedImages(tpl.slots, plan);

  const done = await alreadyGenerated(runId);
  const todo = wanted.filter((w) => !done.has(w.slot.jobLayerName));

  if (todo.length === 0) {
    log.info("no images to generate", { planned: wanted.length, resumed: done.size });
    await writeStepEvent({
      runId,
      step,
      status: "passed",
      payload: { generated: 0, resumed: done.size, fellBack: 0 },
    });
    return;
  }

  // The product sheet identity-locks the actual product. The STORYBOARD sheet is
  // deliberately NOT passed: it is a labelled contact sheet with burned-in panel
  // badges and caption bars, and feeding it as an edit reference paints those
  // straight into the still. Look consistency comes from `adStyle` in words.
  const productSheet = await latestProductSheet(runId);
  const productRef = productSheet?.assetUrl
    ? [{ source: productSheet.assetUrl }]
    : undefined;

  const fellBack: string[] = [];
  let generated = 0;

  await bounded(todo, CONCURRENCY, async ({ slot, imageSubject, role }) => {
    const size = gptImageSizeForSlot(slot.width, slot.height);
    const prompt = buildTemplateImagePrompt({
      imageSubject,
      role,
      conceptSummary: plan?.conceptSummary || undefined,
      adStyle: ctx.adStyle,
      productBrief: ctx.productBrief,
      brandText: ctx.brandText,
      hasProductRef: Boolean(productRef),
      width: slot.width,
      height: slot.height,
    });

    try {
      log.info("▶ generating slot image", { slot: slot.jobLayerName, size });
      const { bytes: raw, mime } = await ctx.openai.generateImage({
        prompt,
        refs: productRef,
        size,
        quality: "high",
      });
      // Same tonal correction the reference sheets get — this pipeline's stills
      // otherwise drift warm/red.
      const bytes = await neutralizeCast(raw);

      await persistAsset({
        runId,
        kind: "template_image",
        bytes,
        mime,
        meta: {
          jobLayerName: slot.jobLayerName,
          composition: slot.composition,
          size,
          imageSubject,
        },
      });
      generated++;
      log.info("✓ slot image persisted", { slot: slot.jobLayerName });
    } catch (err) {
      // Non-fatal BY DESIGN. The template keeps its own artwork for this slot,
      // which always renders. Failing the whole run here would throw away the
      // storyboard and reference sheets already paid for, moments before the
      // video step.
      fellBack.push(slot.jobLayerName);
      log.warn("slot image failed — template keeps its own artwork", {
        slot: slot.jobLayerName,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });

  log.info("✓ template images done", {
    generated,
    fellBack: fellBack.length,
    resumed: done.size,
  });
  await writeStepEvent({
    runId,
    step,
    status: "passed",
    payload: {
      generated,
      resumed: done.size,
      fellBack: fellBack.length,
      ...(fellBack.length ? { fellBackSlots: fellBack.join(", ") } : {}),
    },
  });
}
