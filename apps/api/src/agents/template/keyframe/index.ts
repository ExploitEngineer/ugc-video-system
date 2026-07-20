// Template Keyframe skill — the `template_keyframe` step. This is the template
// pipeline's STORYBOARD (template-owned, no ad-type).
//
// Runs in the TEMPLATE chain AFTER the reference phase (product/person sheets)
// and BEFORE `template_fill`. It:
//   (a) authors a per-beat script — one scene per video-slot window, in order;
//   (b) renders ONE labelled multi-panel storyboard sheet — one panel per beat.
//
// The multi-panel sheet (not a single still) is what stops the Seedance master
// from drifting: `template_video` feeds it as the shot guide (clean-cropped of
// its badges/captions first), so the clip holds a consistent look and transitions
// through the beats. The AE template composites the FINAL graphics, so the sheet's
// badges/captions are direction only and never reach the footage.
//
// It persists onto the SAME `storyboard_sheet` surface the rest of the pipeline
// already reads: `template_video` picks up the scenes + the sheet via
// `latestStoryboardSheet`, and `template_fill` reads the spoken script the same
// way. So downstream code needs no template-specific loader.

import { eq } from "drizzle-orm";

import { runTemplateSchema, templatePlanSchema } from "@ugc/shared";

import { db, schema } from "../../../db/index.js";
import { neutralizeCast } from "../../../lib/image/color.js";
import { createLogger } from "../../../lib/log.js";
import { runFailureWithCode } from "../../../lib/run-failure.js";
import { IMAGE_SIZE_BY_RATIO } from "../../../providers/openai/constants.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import {
  latestProductSheet,
  latestStoryboardSheet,
  loadUploads,
  resolvePersonRef,
} from "../../creative-direction/inputs.js";
import { writeStepEvent } from "../../events.js";
import type { SceneSpeaker, StoryboardScene } from "../../image/storyboard/prompt.js";
import { parseJsonObject } from "../../json.js";
import { persistSheet } from "../../persist.js";
import type { SkillContext } from "../../types.js";
import { deriveTemplateBeats } from "../beats.js";
import { templateKeyframePanels, templateTotalSeconds } from "../geometry.js";
import { buildTemplateKeyframePrompt } from "./prompt.js";

/** The strict-JSON shape the LLM returns. */
interface KeyframeReply {
  sheetImagePrompt: string;
  /** Everyone who speaks, authored once. Optional: an older/leaner reply omits it. */
  cast?: { id?: string; role?: string; voice?: string }[];
  scenes: {
    sceneDescription: string;
    /** The `id` of the cast member who says `spokenLine`. */
    speaker?: string;
    spokenLine?: string;
    cameraAction?: string;
    panelCaption?: string;
  }[];
}

/**
 * The cast is reproduced VERBATIM in every segment's Seedance prompt, so bound it
 * here rather than trusting the model: a chatty reply must not be able to inflate
 * the video prompt, which is held to a tight word budget.
 */
const MAX_CAST = 3;
const MAX_ROLE_CHARS = 24;
const MAX_VOICE_CHARS = 90;

/**
 * Clean the authored cast: trim, cap, drop entries missing an id/role/voice, and
 * de-dupe ids.
 *
 * Returns [] when the model authored none — the video step then takes the
 * single-voice path, i.e. today's exact behaviour. Deliberately does NOT invent a
 * fallback cast by parsing gender out of `personBrief`: a misparse would apply the
 * WRONG voice confidently, which is worse than letting Seedance infer. Degrade to
 * today, never to wrong.
 */
export function toCast(raw: KeyframeReply["cast"]): SceneSpeaker[] {
  const out = new Map<string, SceneSpeaker>();
  for (const c of raw ?? []) {
    const id = c.id?.trim().toUpperCase();
    const role = c.role?.trim().slice(0, MAX_ROLE_CHARS);
    const voice = c.voice?.trim().slice(0, MAX_VOICE_CHARS);
    if (!id || !role || !voice || out.has(id)) continue;
    out.set(id, { id, role, voice });
    if (out.size >= MAX_CAST) break;
  }
  return [...out.values()];
}

/** A beat window fed to the prompt (a subset of `TemplateBeat`). */
interface Beat {
  startSec: number;
  durationSec: number;
  scene: string;
}

/** One entry of the panel arc. */
type KeyframeScene = KeyframeReply["scenes"][number];

/**
 * Coerce the model's reply to EXACTLY `panelCount` scenes (the duration-derived
 * panel count). Trim any extras and pad from the beats (or the concept) so a
 * short/failed reply never leaves an empty panel.
 */
function toNScenes(
  parsed: KeyframeReply["scenes"] | undefined,
  beats: Beat[],
  concept: string,
  panelCount: number,
): KeyframeScene[] {
  const base: KeyframeScene[] =
    parsed && parsed.length
      ? parsed
      : (beats.length
          ? beats
          : [{ startSec: 0, durationSec: 0, scene: concept }]
        ).map((b, i) => ({
          sceneDescription: b.scene || concept,
          spokenLine: "",
          cameraAction: i === 0 ? "slow push-in" : "gentle hold",
          panelCaption: `SHOT ${i + 1}`,
        }));
  const out = base.slice(0, panelCount);
  while (out.length < panelCount) {
    const last = out[out.length - 1];
    out.push({
      sceneDescription: last?.sceneDescription ?? concept,
      spokenLine: "",
      cameraAction: "gentle hold",
      panelCaption: `SHOT ${out.length + 1}`,
    });
  }
  return out;
}

export async function buildTemplateKeyframe(ctx: SkillContext): Promise<void> {
  const log = createLogger("template-keyframe", { run: ctx.runId });

  // 1. Idempotent resume — a keyframe sheet already exists (crash/restart), so
  //    do not re-author the script or re-pay for the still.
  const existing = await latestStoryboardSheet(ctx.runId);
  if (existing) {
    log.info("keyframe sheet already persisted — skipping");
    return;
  }

  await writeStepEvent({
    runId: ctx.runId,
    step: "template_keyframe",
    status: "started",
  });

  try {
    // 3. Load the run + its template snapshot and plan.
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, ctx.runId),
    });
    if (!run) throw new Error(`template_keyframe: run ${ctx.runId} not found`);

    const tpl = runTemplateSchema.parse(run.template);
    const plan = templatePlanSchema.safeParse(run.templatePlan).data ?? null;
    // The board's arc + the beats span the FULL ad length (the footage is now built
    // to the template's real duration via multi-segment merge), not a single ≤15s clip.
    const clipSeconds = templateTotalSeconds(tpl);
    // Panel count scales with the ad's LENGTH (4 per 15s, like the normal pipeline),
    // laid out in a near-square grid — so a longer template gets more distinct
    // keyframes instead of one scene stretched across 4 panels.
    const { panelCount, rows, cols } = templateKeyframePanels(clipSeconds);

    // 4. Derive the beat list (one per video slot). Undefined for a single-slot
    //    or no-scene template → synthesize one beat covering the whole take.
    const derived = plan
      ? deriveTemplateBeats(tpl, plan, clipSeconds)
      : undefined;
    const beats: Beat[] = derived ?? [
      {
        startSec: 0,
        durationSec: clipSeconds,
        scene:
          plan?.slots.find((s) => s.asset === "VIDEO")?.videoScene ??
          plan?.conceptSummary ??
          run.prompt,
      },
    ];

    // 5. Author the per-beat script + the clean look-still prompt. On an LLM /
    //    parse hiccup, retry ONCE with a larger ceiling, then fall back to a
    //    deterministic script — a script glitch must never crash the run.
    const messages = buildTemplateKeyframePrompt({
      userPrompt: run.prompt,
      brandText: run.brandText ?? undefined,
      productBrief: run.productBrief ?? undefined,
      conceptSummary: plan?.conceptSummary,
      // The vision-derived look bible from `template_plan` (persisted to
      // runs.visual_style), so the look-still matches the template.
      visualStyle: run.visualStyle ?? plan?.visualStyle ?? undefined,
      aspectRatio: tpl.metadata.aspectRatio ?? ctx.aspectRatio,
      clipSeconds,
      hasProduct: Boolean(ctx.hasProduct),
      hasPerson: Boolean(ctx.hasPerson),
      personBrief: ctx.personBrief,
      supportingCast: ctx.supportingCast,
      beats,
      panelCount,
      rows,
      cols,
    });

    const ceilings = [2000, 3000];
    let parsed: KeyframeReply | undefined;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      try {
        const raw = await ctx.openai.chat(messages, {
          jsonMode: true,
          maxTokens: ceilings[attempt - 1],
        });
        parsed = parseJsonObject<KeyframeReply>(raw);
      } catch (err) {
        log.warn("keyframe reply unparseable — retrying", {
          attempt,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Deterministic fallbacks (concept/brief) so a provider glitch degrades
    // gracefully instead of failing the run. Prefer the PRODUCT brief here:
    // `conceptSummary` is now a subject-agnostic structural arc, so leading with it
    // would drop the product from the fallback board/scenes. The brief keeps the
    // fallback on-subject.
    const concept =
      run.productBrief?.trim() || plan?.conceptSummary?.trim() || run.prompt.trim();
    const styleHint = run.visualStyle?.trim()
      ? ` Match this look: ${run.visualStyle.trim()}.`
      : run.adStyle?.trim()
        ? ` Match this look: ${run.adStyle.trim()}.`
        : "";
    // N keyframes of the ONE continuous take, in a near-square grid sized to the ad's
    // length (more panels for a longer ad). The per-slot timing is mapped onto these
    // scenes downstream (`beatsToScenes` in the video step).
    const scenes = toNScenes(parsed?.scenes, beats, concept, panelCount);
    // WHO speaks. Authored once by the model; [] when it authored none, which
    // leaves every scene speaker-less and the video step on its single-voice path.
    const cast = toCast(parsed?.cast);
    const byId = new Map(cast.map((c) => [c.id, c]));
    const sheetImagePrompt =
      parsed?.sheetImagePrompt?.trim() ||
      `A storyboard board: one single image with ${panelCount} equal photographic panels in a ${rows}×${cols} grid, thin white borders, read left-to-right then top-to-bottom; the ${panelCount} panels are consecutive keyframes of this ad's ONE continuous take (opening → close): ${concept}.${styleHint} Soft diffused light, neutral white balance, true colour, natural 85mm/35mm perspective; keep the same place, person, product and lighting across every panel — only the camera and the moment advance. A small number badge in each panel's top-left and one caption bar along its bottom; no other graphics, no baked headline, logo, price or UI.`;

    // Letter the authored panel captions verbatim into the bottom bars — the model
    // otherwise invents its own.
    const captionDirective = scenes.some((s) => s.panelCaption?.trim())
      ? `\n\nBOTTOM CAPTION BARS — letter EXACTLY these strings into each panel's bottom bar, one per panel, VERBATIM, uppercase, in order; do NOT paraphrase, translate, merge, or invent different wording:\n${scenes
          .map(
            (s, i) =>
              `Panel ${String(i + 1).padStart(2, "0")}: "${(s.panelCaption ?? "").trim()}"`,
          )
          .join("\n")}`
      : "";

    log.info("▶ keyframe scripted", {
      beats: beats.length,
      panels: panelCount,
      grid: `${rows}×${cols}`,
      fallback: !parsed,
      cast: cast.length,
      voices: cast.map((c) => `${c.role}=${c.voice}`).join(" | ") || "none",
    });

    // 6. Render the labelled storyboard sheet, referencing the product sheet (+
    //    the person ref when present) for identity, then neutralize the gpt-image
    //    warm cast exactly as the shared storyboard does.
    const refs: ImageRef[] = [];
    const productSheet = await latestProductSheet(ctx.runId);
    if (productSheet) refs.push({ source: productSheet.assetUrl });
    const { personUpload } = await loadUploads(ctx.runId);
    const personRef = await resolvePersonRef(ctx.runId, personUpload);
    if (personRef) refs.push(personRef);

    const { bytes: rawBytes, mime } = await ctx.openai.generateImage({
      prompt: `${sheetImagePrompt}${captionDirective}`,
      refs,
      size: IMAGE_SIZE_BY_RATIO[ctx.aspectRatio],
      quality: "high",
    });
    const bytes = await neutralizeCast(rawBytes);

    // 7. Project the panel arc onto the `StoryboardScene[]` shape the downstream
    //    template steps read (one scene per panel, opening → close). The video step
    //    maps the template's slot-windows onto these scenes (`beatsToScenes`).
    //    Each scene also carries WHO speaks its line. The cast is authored once,
    //    but it is denormalized onto every scene because `scenes` jsonb is the only
    //    payload that reaches `template_video` (via `latestStoryboardSheet`) — and
    //    both `beatsToScenes` and `beatsForSegment` RE-SLICE this array, so a
    //    speaker travelling inside its scene survives both. The video step dedupes
    //    it back to one legend, so the repetition never reaches Seedance.
    const mapped: StoryboardScene[] = scenes.map((s, i) => {
      const speaker = s.speaker?.trim()
        ? byId.get(s.speaker.trim().toUpperCase())
        : undefined;
      return {
        index: i,
        cameraAngle: s.cameraAction ?? "",
        actionMovement: "",
        sceneDescription: s.sceneDescription ?? concept,
        panelCaption: s.panelCaption ?? "",
        transcript: s.spokenLine ?? "",
        adStyle: run.adStyle ?? "",
        // Key ABSENT (not undefined) when unknown, so a no-speaker scene is
        // byte-identical in jsonb to every row written before speakers existed.
        ...(speaker ? { speaker } : {}),
      };
    });

    // 8. Persist: storage → assets(storyboard_sheet) → storyboard_sheets.
    const { assetId } = await persistSheet({
      runId: ctx.runId,
      kind: "storyboard_sheet",
      bytes,
      mime,
      artifactInsert: async (tx, newAssetId) => {
        const [row] = await tx
          .insert(schema.storyboardSheets)
          .values({
            runId: ctx.runId,
            assetId: newAssetId,
            scenes: mapped,
            segmentIndex: null,
            promptUsed: sheetImagePrompt,
            status: "draft",
          })
          .returning();
        return row;
      },
    });

    log.info("✓ keyframe persisted", { assetId, scenes: mapped.length });

    // 9. Terminal pass event for the timeline.
    await writeStepEvent({
      runId: ctx.runId,
      step: "template_keyframe",
      status: "passed",
      payload: { scenes: mapped.length, cast: cast.length },
    });
  } catch (err) {
    // 10. Surface a classified failure with the code FORCED to the template step
    //     (a gpt-image error would otherwise reclassify to IMAGE_GENERATION_FAILED
    //     and the template retry would not know where to resume). `failRun` writes
    //     the single `failed` step event. Recovery re-runs only the keyframe.
    throw runFailureWithCode("TEMPLATE_KEYFRAME_FAILED", err);
  }
}
