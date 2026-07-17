// Template Plan skill — the `template_plan` step (the template's ANALYSIS step).
//
// Runs FIRST, before any image or video spend. It SEES the template — the
// preview poster plus frames sampled across the preview clip — through the
// template-vision provider (Claude Sonnet v1; the Gemini .mp4 path is a deferred
// seam), and combines what it sees with the deterministic slot inventory +
// timeline windows into a per-slot BLUEPRINT plus a template-wide look bible.
// Every downstream agent reads that blueprint, which stops the copy, the stills
// and the clip from describing three unrelated ads AND makes them match the
// template's own look.

import { eq } from "drizzle-orm";

import {
  runTemplateSchema,
  templatePlanSchema,
  type TemplatePlan,
  type TemplateSlot,
  type TemplateSlotPlan,
} from "@ugc/shared";

import { env } from "../../../config/index.js";
import { db, schema } from "../../../db/index.js";
import { fetchWithRetry } from "../../../lib/http.js";
import { dominantPalette } from "../../../lib/image/color.js";
import { createLogger } from "../../../lib/log.js";
import { classifyRunError } from "../../../lib/run-failure.js";
import { sampleFrames } from "../../../lib/video/merge.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { createClaudeStillVisionProvider } from "../../../providers/template-vision/claude.js";
import {
  createTemplateVisionProvider,
  type TemplateVisionProvider,
} from "../../../providers/template-vision/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import { templateTotalSeconds } from "../geometry.js";
import { getTemplate, parseMetadata } from "../library.js";
import { buildTemplateBlueprintPrompt, type PlanSlotInput } from "./prompt.js";

const log = createLogger("template-plan");

/**
 * Which slots the model is even allowed to see.
 *
 * IMAGE slots the deterministic heuristic called `brand` (a logo) or
 * `decorative` (a background) are withheld entirely — a generated photo in a
 * logo layer is wrong every time, so the model never gets the chance to argue.
 * EVERY video slot is shown; AUDIO slots receive the master's voiceover, nothing
 * for the model to plan.
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
  startSec: s.startSec,
  durationSec: s.durationSec,
});

/**
 * Merge the model's reply onto OUR slot list, keyed by `jobLayerName`.
 *
 * The model's order, its slot count, and any slot it invents are all ignored:
 * every entry comes from the template's real structure. `fill` is decided
 * deterministically rather than taken on trust — a slot is generated only when
 * the model actually described what to depict.
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
    return {
      ...base,
      videoScene: got?.videoScene?.trim() || undefined,
      cameraAction: got?.cameraAction?.trim() || undefined,
      onScreenMoment: got?.onScreenMoment?.trim() || undefined,
    };
  });
}

/**
 * Which seconds of the preview clip to sample. A DENSE strip — not a few
 * snapshots — so the model reads the template's animation across the whole take:
 * the midpoint of every video slot's window, t=0, and an even ~1/sec grid,
 * deduped, spread and capped at the configured ceiling.
 */
function frameTimestamps(
  slots: TemplateSlot[],
  durationSec: number,
  cap: number,
): number[] {
  if (cap <= 0) return [];
  const set = new Set<number>([0]);
  for (const s of slots) {
    if (s.asset === "VIDEO" && s.startSec != null && s.durationSec != null) {
      set.add(Math.round(Math.min(s.startSec + s.durationSec / 2, durationSec - 0.1)));
    }
  }
  for (let t = 1; t < durationSec; t++) set.add(t);
  const sorted = [...set]
    .filter((t) => t >= 0 && t < durationSec)
    .sort((a, b) => a - b);
  if (sorted.length <= cap) return sorted;
  // Keep an even spread across the timeline rather than the first `cap`.
  const step = sorted.length / cap;
  return Array.from({ length: cap }, (_, i) => sorted[Math.floor(i * step)] as number);
}

/**
 * Analyze this run's template into a blueprint (persisted to `runs.template_plan`
 * by the orchestrator). Never throws a raw error: failures surface as
 * `TEMPLATE_PLAN_FAILED`, a hard fail — nothing downstream has run, so recovery
 * restarts the run cheaply.
 */
export async function planTemplate(ctx: SkillContext): Promise<TemplatePlan> {
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, ctx.runId),
    });
    if (!run) throw new Error(`template_plan: run ${ctx.runId} not found`);

    const tpl = runTemplateSchema.parse(run.template);
    const slots = planningSlots(tpl.slots);

    // Preview media lives on the templates row, not the run snapshot — fetch it.
    const templateRow = await getTemplate(tpl.templateId).catch(() => undefined);

    // The run snapshot is immutable ON PURPOSE — editing a template must not change
    // a run already in flight. A duration CORRECTION is different in kind: the
    // snapshot recorded a WRONG FACT about a template that never changed, and every
    // beat, segment and slice below is derived from it. This is the first step and
    // runs before any spend, so refresh it here. Idempotent.
    const live = parseMetadata(templateRow?.metadata);
    if (
      live?.measuredDurationSec != null &&
      live.measuredDurationSec !== tpl.metadata.durationSec
    ) {
      log.info("refreshing a stale duration on the run snapshot", {
        was: tpl.metadata.durationSec,
        now: live.measuredDurationSec,
      });
      tpl.metadata = { ...tpl.metadata, ...live };
      await db
        .update(schema.runs)
        .set({ template: tpl })
        .where(eq(schema.runs.id, ctx.runId));
    }

    // Analyze against the FULL ad length so the frame sampling spans the whole preview
    // and the blueprint's per-slot windows cover the entire timeline (not just 15s).
    const durationSec = templateTotalSeconds(tpl);
    const posterUrl = templateRow?.previewPosterUrl ?? undefined;
    const previewVideoUrl = templateRow?.previewVideoUrl ?? undefined;

    // Sample the template's real colour palette from the rendered poster — GROUND-TRUTH
    // look anchors for the blueprint. The poster carries the template's grade/gradients/
    // effects, so it is a better palette than the project file's raw solid colours.
    // Best-effort: any fetch/decode hiccup just omits the palette.
    let palette: string[] = [];
    if (posterUrl) {
      try {
        const res = await fetchWithRetry(posterUrl, undefined, {
          label: "template-poster-palette",
        });
        if (res.ok) {
          palette = await dominantPalette(
            new Uint8Array(await res.arrayBuffer()),
            5,
          );
        }
      } catch (err) {
        log.warn("poster palette skipped", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Shared prompt inputs — only the frame-specific fields differ per vision path.
    const promptBase = {
      userPrompt: run.prompt,
      brandText: run.brandText ?? undefined,
      productBrief: run.productBrief ?? undefined,
      clipSeconds: durationSec,
      aspectRatio: tpl.metadata.aspectRatio ?? ctx.aspectRatio,
      slots: slots.map(toPromptSlot),
      palette,
    } satisfies Omit<
      Parameters<typeof buildTemplateBlueprintPrompt>[0],
      "hasPoster" | "frameTimestampsSec" | "videoMode"
    >;

    // One retry with a larger ceiling on an unparseable reply — same pattern as
    // every other one-shot skill in this codebase. The blueprint is O(slots): a
    // per-slot videoScene/cameraAction/onScreenMoment across a many-slot template
    // runs long, so the ceiling is generous (a short template still stops early —
    // maxTokens is a cap, not a target). Applies to BOTH the Claude and Gemini
    // paths; Gemini 2.5 counts thinking against this budget, so the headroom
    // covers reasoning + the JSON.
    const parseWithRetry = async (
      analyze: (maxTokens: number) => Promise<string>,
    ): Promise<TemplatePlan> => {
      try {
        return parseJsonObject<TemplatePlan>(await analyze(12000), templatePlanSchema);
      } catch {
        log.warn("template blueprint: first reply unparseable — retrying");
        return parseJsonObject<TemplatePlan>(await analyze(20000), templatePlanSchema);
      }
    };

    type Analysis = {
      reply: TemplatePlan;
      visionSource: NonNullable<TemplatePlan["visionSource"]>;
      frames: number;
    };

    // Claude still-vision — the guaranteed floor. Samples a dense frame strip
    // across the whole preview clip (best-effort) and reads poster + frames.
    const runStill = async (): Promise<Analysis> => {
      const timestamps = previewVideoUrl
        ? frameTimestamps(tpl.slots, durationSec, env.TEMPLATE_VISION_FRAME_COUNT)
        : [];
      const frames: ImageRef[] = timestamps.length
        ? await sampleFrames(previewVideoUrl as string, timestamps, {
            maxEdge: 512,
          }).catch((err) => {
            log.warn("frame sampling failed — analyzing on the poster alone", {
              err: err instanceof Error ? err.message : String(err),
            });
            return [] as ImageRef[];
          })
        : [];
      const poster: ImageRef | undefined = posterUrl
        ? { source: posterUrl }
        : undefined;
      const visionSource: NonNullable<TemplatePlan["visionSource"]> =
        frames.length > 0 ? "poster+frames" : poster ? "poster" : "text-only";
      const { system, user } = buildTemplateBlueprintPrompt({
        ...promptBase,
        hasPoster: Boolean(poster),
        // The legend is numbered poster-then-frames, so it only lists the frames
        // that actually came back.
        frameTimestampsSec: timestamps.slice(0, frames.length),
      });
      const still = createClaudeStillVisionProvider(ctx.openai);
      const reply = await parseWithRetry((maxTokens) =>
        still.analyze({
          system,
          user,
          poster,
          frames,
          previewVideoUrl,
          durationSec,
          maxTokens,
        }),
      );
      return { reply, visionSource, frames: frames.length };
    };

    // Gemini video-vision — watches the whole preview clip; no frames to sample.
    const runVideo = async (
      provider: TemplateVisionProvider,
    ): Promise<Analysis> => {
      const { system, user } = buildTemplateBlueprintPrompt({
        ...promptBase,
        hasPoster: false,
        frameTimestampsSec: [],
        videoMode: true,
      });
      const reply = await parseWithRetry((maxTokens) =>
        provider.analyze({ system, user, previewVideoUrl, durationSec, maxTokens }),
      );
      return { reply, visionSource: "video", frames: 0 };
    };

    // Prefer the configured provider; a video-provider failure (missing clip,
    // dead ~14d preview URL, upload error) degrades to Claude still — never fatal.
    const provider = createTemplateVisionProvider(ctx.openai);
    const wantVideo = provider.kind === "video" && Boolean(previewVideoUrl);
    let analysis: Analysis;
    if (wantVideo) {
      try {
        analysis = await runVideo(provider);
      } catch (err) {
        log.warn("Gemini video-vision failed — falling back to Claude still-vision", {
          err: err instanceof Error ? err.message : String(err),
        });
        analysis = await runStill();
      }
    } else {
      analysis = await runStill();
    }
    const { reply, visionSource } = analysis;

    const planned = reconcilePlan(slots, reply);
    const textSlots = tpl.slots.filter((s) => s.asset === "TEXT").length;
    // Fold the sampled palette into the look-bible so every downstream agent (keyframe,
    // images, video) carries the template's real colours even without re-running vision.
    const styleText = reply.visualStyle?.trim() ?? "";
    const paletteText = palette.length
      ? `${styleText ? " " : ""}Colour palette (match these template hues): ${palette.join(", ")}.`
      : "";
    const visualStyle = (styleText + paletteText).trim() || undefined;
    const blueprint: TemplatePlan = {
      conceptSummary: reply.conceptSummary?.trim() ?? "",
      slots: planned,
      visualStyle,
      // Default to the template owning text (clean footage) — the safe choice —
      // when the model didn't decide, keyed on whether the template has TEXT slots.
      onScreenText: reply.onScreenText ?? {
        owner: textSlots > 0 ? "template" : "none",
        requireCleanFootage: true,
      },
      audio: reply.audio
        ? {
            voiceover: reply.audio.voiceover?.trim() ?? "",
            tone: reply.audio.tone?.trim() ?? "",
          }
        : undefined,
      visionSource,
    };

    const fills = planned.filter((s) => s.asset === "IMAGE" && s.fill).length;
    log.info("✓ template analyzed", {
      slots: planned.length,
      imagesToGenerate: fills,
      visionSource,
      frames: analysis.frames,
      visualStyle: Boolean(blueprint.visualStyle),
    });
    return blueprint;
  } catch (err) {
    throw classifyRunError(err, "TEMPLATE_PLAN_FAILED");
  }
}
