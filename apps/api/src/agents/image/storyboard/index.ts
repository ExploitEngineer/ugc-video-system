// StoryBoard Generator — Image Agent skill.
//
// (a) LLM plans ordered scenes → image prompt + scenes (each tagged adStyle)
// (b) GPT Image 2 generates a composite storyboard sheet, referencing the
//     product sheet (+ person sheet when present) for consistency
// (c) persist: storage → assets(storyboard_sheet) → storyboard_sheets

import { schema } from "../../../db/index.js";
import { createLogger } from "../../../lib/log.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { IMAGE_SIZE_BY_RATIO } from "../../../providers/openai/constants.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";
import { PANELS_PER_SEGMENT } from "../../creative-direction/narrative-outline/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../../persist.js";
import {
  buildStoryboardPrompt,
  type StoryboardPlan,
  type StoryboardScene,
} from "./prompt.js";

type StoryboardSheet = typeof schema.storyboardSheets.$inferSelect;

export interface StoryboardInput {
  productSheetRef: ImageRef;
  /** Present whether the person was uploaded or generated. */
  personSheetRef?: ImageRef;
  userPrompt: string;
  /** Critic feedback from a rejected prior attempt — steers a full regen (F5). */
  critique?: string;
  /** Broken-down USER revision directive (confirm-mode storyboard gate). */
  directive?: RevisionDirective;
  // ── 60s segment fields (absent ⇒ the original single-sheet 15s behavior) ──
  /** This sheet's segment position in a 60s run (0..3); persisted on the row. */
  segmentIndex?: number;
  /** This segment's own brief from the narrative outline. */
  segmentSummary?: string;
  /** The OTHER three segments' summaries, for cross-segment continuity. */
  otherSummaries?: string[];
}

/** A rendered storyboard image + its parsed scenes, BEFORE persistence. */
interface RenderedStoryboard {
  bytes: Uint8Array;
  mime: string;
  scenes: StoryboardScene[];
  imagePrompt: string;
}

/**
 * Plan (LLM) + render (gpt-image-2) a storyboard sheet WITHOUT persisting.
 * Shared by the 15s `storyboardGenerator` (4-panel 2×2) and the multi-segment
 * `generateMaster` (N×4-panel grid — 8/12/16 panels for 30/45/60s).
 * `opts.full60s` switches into master mode; `opts.segmentCount` (rows) sizes the
 * panel count, the token ceiling, and the prompt's layout/scene-count mode.
 */
async function renderStoryboard(
  ctx: SkillContext,
  input: StoryboardInput,
  opts: { full60s?: boolean; segmentCount?: number } = {},
): Promise<RenderedStoryboard> {
  const full60s = Boolean(opts.full60s);
  const segmentCount = opts.segmentCount ?? 4;
  const panelCount = full60s ? segmentCount * PANELS_PER_SEGMENT : 4;
  const log = createLogger("image", {
    run: ctx.runId,
    skill: full60s ? "storyboard-master" : "storyboard",
  });
  log.info("▶ planning storyboard", {
    full60s,
    hasPerson: Boolean(input.personSheetRef),
    critique: Boolean(input.critique),
    revise: Boolean(input.directive),
  });

  const messages = buildStoryboardPrompt({
    adStyle: ctx.adStyle,
    adType: ctx.adType,
    productBrief: ctx.productBrief,
    productUse: ctx.productUse,
    personBrief: ctx.personBrief,
    userPrompt: input.userPrompt,
    hasPerson: Boolean(input.personSheetRef),
    aspectRatio: ctx.aspectRatio,
    critique: input.critique,
    directive: input.directive,
    segmentIndex: input.segmentIndex,
    segmentSummary: input.segmentSummary,
    otherSummaries: input.otherSummaries,
    visualStyle: ctx.visualStyle,
    full60s,
    segmentCount,
  });
  // The storyboard plan is the longest LLM output in the pipeline, so JSON mode
  // + a generous token ceiling are essential (a truncated reply = invalid JSON).
  // The master carries up to 4× the scenes of a 15s sheet, so it needs a far
  // larger ceiling. Retry ONCE with an even larger ceiling before failing.
  const ceilings = full60s ? [12288, 16384] : [5120, 8192];
  let plan: StoryboardPlan | undefined;
  for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
    const reply = await ctx.openai.chat(messages, {
      jsonMode: true,
      maxTokens: ceilings[attempt - 1],
    });
    try {
      plan = parseJsonObject<StoryboardPlan>(reply);
    } catch (err) {
      log.warn("storyboard plan unparseable — retrying", {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      if (attempt === 2) throw err;
    }
  }
  if (!plan) throw new Error("storyboard plan missing after retries");
  // Clamp to the expected panel count in case the model overshoots.
  plan.scenes = plan.scenes.slice(0, panelCount);

  // The planner tends to write the META-instruction ("quote each panelCaption
  // exactly") into `imagePrompt` instead of the caption TEXT, so the image model
  // never sees the captions and letters its own invented (first-person) lines.
  // Append the real panelCaption strings so the authored shot-type captions are
  // the ones rendered into the bottom bars.
  const captionDirective = plan.scenes.some((s) => s.panelCaption?.trim())
    ? `\n\nBOTTOM CAPTION BARS — letter EXACTLY these strings into each panel's bottom bar, one per panel, VERBATIM, uppercase, in order; do NOT paraphrase, shorten, translate, rewrite in first person, merge, or invent different wording:\n${plan.scenes
        .map(
          (s, i) =>
            `Panel ${String(i + 1).padStart(2, "0")}: "${(s.panelCaption ?? "").trim()}"`,
        )
        .join("\n")}`
    : "";
  const imagePrompt = `${plan.imagePrompt}${captionDirective}`;

  const refs: ImageRef[] = [input.productSheetRef];
  if (input.personSheetRef) refs.push(input.personSheetRef);

  log.debug("✓ plan ready — generating image", {
    scenes: plan.scenes.length,
    refs: refs.length,
  });
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: imagePrompt,
    refs,
    size: IMAGE_SIZE_BY_RATIO[ctx.aspectRatio],
    // High quality: these panels are the final frames that feed the video — the
    // product/label fidelity and per-panel sharpness ride directly into Seedance.
    quality: "high",
  });
  log.debug("✓ image generated", { bytes: bytes.length, mime });
  return { bytes, mime, scenes: plan.scenes, imagePrompt };
}

export async function storyboardGenerator(
  ctx: SkillContext,
  input: StoryboardInput,
): Promise<SkillResult<StoryboardSheet>> {
  const log = createLogger("image", { run: ctx.runId, skill: "storyboard" });
  const { bytes, mime, scenes, imagePrompt } = await renderStoryboard(
    ctx,
    input,
  );

  const { assetId, assetUrl, artifact } = await persistSheet({
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
          scenes,
          segmentIndex: input.segmentIndex ?? null,
          promptUsed: imagePrompt,
          status: "draft",
        })
        .returning();
      return row as StoryboardSheet;
    },
  });

  log.info("✓ storyboard persisted", { assetId, scenes: scenes.length });
  return { assetId, assetUrl, artifact, promptUsed: imagePrompt };
}

/** Input for the multi-segment master sheet — one coherent N×4-panel scene. */
export interface GenerateMasterInput {
  productSheetRef: ImageRef;
  personSheetRef?: ImageRef;
  userPrompt: string;
  /** Confirm-mode storyboard-gate revise — applies to the whole master sheet. */
  directive?: RevisionDirective;
  /** Segment rows (2/3/4 for 30/45/60s) — sizes the master grid to N×4 panels. */
  segmentCount: number;
}

/** A multi-segment N×4-panel master storyboard — raw bytes + scenes, NOT persisted. */
export interface MasterStoryboard {
  bytes: Uint8Array;
  mime: string;
  scenes: StoryboardScene[];
  imagePrompt: string;
}

/**
 * MULTI-SEGMENT ONE-MASTER: plan + render the single N×4-panel storyboard sheet
 * as ONE continuous coherent scene, authored from the user prompt + briefs (no
 * per-segment summaries). Returns the raw image bytes + all N×4 scenes so the
 * orchestrator can crop the sheet into row strips and own persistence. Does NOT
 * persist.
 */
export async function generateMaster(
  ctx: SkillContext,
  input: GenerateMasterInput,
): Promise<MasterStoryboard> {
  return renderStoryboard(
    ctx,
    {
      productSheetRef: input.productSheetRef,
      personSheetRef: input.personSheetRef,
      userPrompt: input.userPrompt,
      directive: input.directive,
    },
    { full60s: true, segmentCount: input.segmentCount },
  );
}
