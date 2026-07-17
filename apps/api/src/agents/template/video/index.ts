// Template pipeline - the `template_video` step.
//
// SEPARATE from the normal `video` builder: a template run's footage is PLAIN
// live action (the After Effects template composites every overlay on top), the
// prompt is authored entirely from the template's plan + storyboard beats (no
// ad-type registry).
//
// The footage spans the template's FULL length (`templateTotalSeconds`, ≤60s).
// Seedance caps a single clip at 15s, so a longer template is generated as several
// ≤15s segment clips (`planFootageSegments`) that share ONE run-stable seed for
// identity/voice continuity and are MERGED (`mergeSegmentUrls`) into the master.
// `template_render` then slices that master 1:1 by composition time (`slices.ts`)
// into a piece per video slot — a longer template now shows real footage in its
// late slots instead of a reused 15s loop.

import { eq } from "drizzle-orm";

import { type AspectRatio, runTemplateSchema, templatePlanSchema } from "@ugc/shared";

import type { SkillContext } from "../../types.js";
import type { StoryboardScene } from "../../image/storyboard/prompt.js";
import { db, schema } from "../../../db/index.js";
import { env } from "../../../config/index.js";
import { pollVideoTolerant, type VideoProvider } from "../../../providers/video.js";
import { parseJsonObject } from "../../json.js";
import { persistSheet } from "../../persist.js";
import { writeStepEvent } from "../../events.js";
import { createLogger, type Logger } from "../../../lib/log.js";
import {
  cleanStoryboardRefUrl,
  providerSafeRefUrl,
} from "../../../lib/provider-refs.js";
import { downloadToBuffer } from "../../../lib/download.js";
import { mergeSegmentUrls } from "../../../lib/video/merge.js";
import { classifyRunError, runFailureWithCode } from "../../../lib/run-failure.js";
import {
  latestProductSheet,
  latestStoryboardSheet,
  loadUploads,
  persistedFinalVideo,
  persistedSegmentVideoIndices,
  resolvePersonRef,
  segmentVideos,
} from "../../creative-direction/inputs.js";
import { stableSeed } from "../../video/index.js";
import { targetSizeFor } from "../../merge/index.js";
import { planFootageSegments, templateTotalSeconds } from "../geometry.js";
import { beatsToScenes, deriveTemplateBeats } from "../beats.js";
import {
  buildDeterministicTemplateVideoPrompt,
  buildTemplateVideoPrompt,
  buildVoiceBlock,
  castOf,
  TEMPLATE_VIDEO_NEGATIVES,
  type TemplateVideoPromptInput,
  type TemplateVideoScene,
} from "./prompt.js";

type Video = typeof schema.videos.$inferSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** At most this many submit → poll → download attempts per segment before giving up. */
const MAX_ATTEMPTS = 2;

/**
 * Failure codes a re-submit can't help - a content/audio moderation block or a
 * rejected input image. Everything else (network / 5xx / timeout / rate-limit)
 * is treated as transient and re-submitted while attempts remain.
 */
const NON_RETRYABLE = new Set<string>([
  "PROVIDER_CONTENT_BLOCKED",
  "PROVIDER_AUDIO_BLOCKED",
  "PERSON_IMAGE_INVALID",
]);

/** Even time windows across a clip, for the no-beats fallback. */
function evenWindows(
  count: number,
  durationSec: number,
): { startSec: number; durationSec: number }[] {
  if (count <= 0) return [];
  const step = durationSec / count;
  return Array.from({ length: count }, (_, i) => {
    const start = i * step;
    const end = i === count - 1 ? durationSec : (i + 1) * step;
    return { startSec: start, durationSec: end - start };
  });
}

/** Project stored storyboard scenes onto the template prompt's beat shape. */
function toPromptScenes(scenes: StoryboardScene[]): TemplateVideoScene[] {
  return scenes.map((s) => ({
    sceneDescription: s.sceneDescription?.trim() || s.actionMovement?.trim() || "",
    transcript: s.transcript?.trim() ?? "",
    cameraAction: s.cameraAngle?.trim() || "",
    ...(s.speaker ? { speaker: s.speaker } : {}),
  }));
}

/** The full-take beats projected onto scenes + their master-timeline windows. */
interface Beats {
  scenes: TemplateVideoScene[];
  slotWindows: { startSec: number; durationSec: number }[];
}

/**
 * Select the beats that fall inside a segment's master-timeline window and offset
 * them to segment-local time (each Seedance clip starts at 0). A beat that spans a
 * boundary is clamped to the segment. When no beat overlaps (sparse beats), steer
 * the whole segment with the nearest scene.
 */
function beatsForSegment(all: Beats, segStart: number, segDur: number): Beats {
  const segEnd = segStart + segDur;
  const scenes: TemplateVideoScene[] = [];
  const slotWindows: { startSec: number; durationSec: number }[] = [];
  all.slotWindows.forEach((w, i) => {
    const wEnd = w.startSec + w.durationSec;
    if (w.startSec >= segEnd - 0.01 || wEnd <= segStart + 0.01) return;
    const localStart = Math.max(0, w.startSec - segStart);
    const localEnd = Math.min(segDur, wEnd - segStart);
    const scene = all.scenes[i];
    if (scene && localEnd - localStart > 0.3) {
      scenes.push(scene);
      slotWindows.push({ startSec: localStart, durationSec: localEnd - localStart });
    }
  });
  if (scenes.length === 0) {
    const mid = segStart + segDur / 2;
    let idx = all.slotWindows.findIndex((w) => w.startSec + w.durationSec > mid);
    if (idx < 0) idx = Math.max(0, all.scenes.length - 1);
    const scene =
      all.scenes[idx] ??
      all.scenes[0] ?? { sceneDescription: "", transcript: "", cameraAction: "" };
    return { scenes: [scene], slotWindows: [{ startSec: 0, durationSec: segDur }] };
  }
  return { scenes, slotWindows };
}

/** Provider-safe reference URLs shared by every segment of one run. */
interface RefBundle {
  referenceImages: string[];
  personReferences: string[];
  rolesText: string;
}

/**
 * Compose the Seedance prompt body for one segment: try the LLM up to twice, fall
 * back to the deterministic prompt so a prompt/parse hiccup NEVER fails the step.
 */
async function composeVideoBody(
  ctx: SkillContext,
  input: TemplateVideoPromptInput,
  log: Logger,
): Promise<string> {
  const messages = buildTemplateVideoPrompt(input);
  let llm = "";
  for (let attempt = 1; attempt <= 2 && !llm.trim(); attempt++) {
    try {
      const raw = await ctx.openai.chat(messages, { jsonMode: true });
      llm = parseJsonObject<{ videoPrompt?: string }>(raw).videoPrompt?.trim() ?? "";
    } catch (err) {
      log.warn("template video prompt unparseable", {
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!llm.trim()) {
    log.warn("template video prompt: LLM failed twice - using deterministic fallback");
    return buildDeterministicTemplateVideoPrompt(input);
  }
  return llm;
}

/**
 * Generate ONE Seedance clip: submit → poll → download, up to MAX_ATTEMPTS times.
 * A transient provider failure re-submits after backoff; a content/input block
 * throws immediately. Returns the downloaded bytes (never persists).
 */
async function generateClip(
  video: VideoProvider,
  opts: {
    refs: RefBundle;
    referenceTag: string;
    prompt: string;
    durationSec: number;
    aspectRatio: AspectRatio;
    seed?: number;
    label: string;
    log: Logger;
  },
): Promise<{ bytes: Uint8Array; hasAudio: boolean; taskId: string }> {
  const { refs, log, durationSec, label } = opts;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let taskId = "";
    try {
      const task = await video.submitVideo({
        referenceImages: refs.referenceImages,
        personReferences: refs.personReferences,
        referenceTag: opts.referenceTag,
        prompt: opts.prompt,
        durationSec,
        aspectRatio: opts.aspectRatio,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      });
      taskId = task.taskId;
      const submittedAt = Date.now();
      const deadline = submittedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
      log.info("task submitted - polling BytePlus", { label, taskId, attempt, durationSec });

      // `pollVideoTolerant` absorbs a transient DNS/connect blip while polling
      // (EAI_AGAIN etc.) — the clip is still rendering on BytePlus, so it returns a
      // synthetic "processing" and the loop re-polls the SAME task rather than
      // discarding a paid generation. The deadline still bounds a total outage.
      let result = await pollVideoTolerant(video, task, log);
      let lastStatus = result.status ?? "running";
      while (result.state === "processing") {
        const elapsedSec = Math.round((Date.now() - submittedAt) / 1000);
        if (Date.now() > deadline) {
          throw new Error(
            `video task ${taskId} timed out after ${env.BYTEPLUS_POLL_TIMEOUT_MS}ms - ${elapsedSec}s elapsed, last status=${lastStatus}, ${durationSec}s`,
          );
        }
        await sleep(env.BYTEPLUS_POLL_INTERVAL_MS);
        result = await pollVideoTolerant(video, task, log);
        lastStatus = result.status ?? lastStatus;
        log.debug("still processing", { label, taskId, status: lastStatus, elapsedSec });
      }
      if (result.state === "failed" || !result.videoUrl) {
        throw new Error(
          result.error ??
            `video task ${taskId} produced no video - last status=${lastStatus}, ${durationSec}s`,
        );
      }
      log.info("✓ task ready - downloading", { label, taskId });

      // Stream the mp4 to disk with a STALL (idle) timeout — never a total-duration
      // cap, so a healthy large clip download is never aborted mid-transfer.
      const bytes = await downloadToBuffer(result.videoUrl, {
        label: `seedance-${label}`,
        ...(result.downloadHeaders ? { headers: result.downloadHeaders } : {}),
      });
      log.info("✓ video downloaded", { label, taskId, bytes: bytes.length });
      return { bytes, hasAudio: result.hasAudio ?? true, taskId };
    } catch (attemptErr) {
      const failure = classifyRunError(attemptErr, "TEMPLATE_VIDEO_FAILED");
      if (NON_RETRYABLE.has(failure.code) || attempt >= MAX_ATTEMPTS) throw attemptErr;
      log.warn("template video attempt failed - retrying", {
        label,
        attempt,
        code: failure.code,
        err: failure.detail ?? failure.message,
      });
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`template video produced no clip (${label})`);
}

/**
 * Template Video Builder - build the PLAIN footage for the whole ad, at the
 * template's real length. One Seedance clip when ≤15s; several ≤15s clips merged
 * when longer. Persists the master as `final_video`; the template composites all
 * overlays on top downstream.
 */
export async function buildTemplateVideo(ctx: SkillContext): Promise<void> {
  const runId = ctx.runId;
  const step = "template_video" as const;
  const log = createLogger("template-video", { run: runId });

  // 1. Load the run + template snapshot + plan; the footage follows the template's
  // full length, generated as one or more ≤15s Seedance segments.
  const run = await db.query.runs.findFirst({ where: eq(schema.runs.id, runId) });
  if (!run) throw new Error(`template_video: run ${runId} not found`);
  const tpl = runTemplateSchema.parse(run.template);
  const plan = templatePlanSchema.safeParse(run.templatePlan).data;
  const footageSec = templateTotalSeconds(tpl);
  const segments = planFootageSegments(footageSec);
  const masterSec = segments.reduce((a, s) => a + s.durationSec, 0);

  // 2. Idempotent resume - never regenerate a paid master after a crash/restart.
  if (await persistedFinalVideo(runId)) {
    log.info("final video already persisted - skipping", { footageSec });
    return;
  }

  log.info("▶ building template video", {
    footageSec,
    segments: segments.length,
    masterSec,
  });
  await writeStepEvent({ runId, step, status: "started" });

  try {
    // 3. Load references ONCE (shared by every segment): the clean N-panel look
    // board, the product sheet, and the person face when the ad has a person.
    const sheet = await latestStoryboardSheet(runId);
    const productSheet = await latestProductSheet(runId);
    const { personUpload } = await loadUploads(runId);
    const personRef = await resolvePersonRef(runId, personUpload);
    const hasPerson = Boolean(ctx.hasPerson) || Boolean(personRef);
    const sheetScenes = (sheet?.scenes as StoryboardScene[] | null | undefined) ?? [];
    // The sheet's panel count = its persisted scene count (duration-derived at the
    // keyframe step); `panelGrid(sheetPanels)` reproduces the same grid at clean time.
    const sheetPanels = sheetScenes.length || 4;

    // 4. Derive the beats from the template's OWN video-slot timeline over the FULL
    // footage length, mapped onto the N-scene arc so each slot shows its own
    // moment while the voiceover reads front-to-back.
    const derived = plan ? deriveTemplateBeats(tpl, plan, masterSec) : undefined;
    let all: Beats;
    if (derived && derived.length >= 1) {
      all = {
        scenes: toPromptScenes(beatsToScenes(derived, sheetScenes, masterSec)),
        slotWindows: derived.map((b) => ({
          startSec: b.startSec,
          durationSec: b.durationSec,
        })),
      };
    } else {
      let scenes = toPromptScenes(sheetScenes);
      if (scenes.length === 0) {
        scenes = [
          {
            sceneDescription:
              plan?.conceptSummary?.trim() ||
              run.prompt ||
              "the product in a natural, well-lit setting",
            transcript: "",
            cameraAction: "",
          },
        ];
      }
      all = { scenes, slotWindows: evenWindows(scenes.length, masterSec) };
    }

    // 5. Provider-safe references, assembled once. Submit order is referenceImages
    // (plain) → personReferences (asset), so @Image numbers follow that order.
    const referenceImages: string[] = productSheet?.assetUrl
      ? [await providerSafeRefUrl(productSheet.assetUrl, runId, "product_sheet", log)]
      : [];
    const personReferences: string[] = [];
    if (sheet?.assetUrl) {
      // The keyframe sheet is an N-panel board (N = duration-derived, matches the
      // persisted scene count) — clean-crop its number badges + caption bars off
      // before Seedance (the template composites the real graphics itself), then
      // feed the N clean keyframes as the shot/look guide.
      personReferences.push(
        await cleanStoryboardRefUrl(sheet.assetUrl, runId, log, sheetPanels),
      );
    }
    if (hasPerson && personRef?.source) {
      personReferences.push(
        await providerSafeRefUrl(personRef.source, runId, "person_sheet", log),
      );
    }

    // Compact @Image legend, deterministic from the submit order above.
    const hasProduct = referenceImages.length > 0;
    const lookNo = hasProduct ? 2 : 1;
    const roles: string[] = [];
    if (hasProduct) {
      roles.push(
        "@Image1 (the product) - keep its exact identity, shape, colour, finish and markings in every beat",
      );
    }
    if (sheet?.assetUrl) {
      roles.push(
        `@Image${lookNo} (the storyboard) - match its look, identity and shot order across the take`,
      );
    }
    if (hasPerson && personRef?.source) {
      const faceNo = sheet?.assetUrl ? lookNo + 1 : lookNo;
      roles.push(
        `@Image${faceNo} (the on-screen face) - keep this exact face and identity throughout`,
      );
    }
    const rolesText = roles.length ? `${roles.join(". ")}. ` : "";
    const refs: RefBundle = { referenceImages, personReferences, rolesText };

    // WHO speaks, and how they sound — resolved ONCE from the FULL beat list and
    // reused unchanged by every segment, so a merged multi-segment ad keeps one
    // voice per character instead of re-rolling it each clip. Derived from
    // `all.scenes` (post-`beatsToScenes`) so only speakers that survived onto a
    // real beat earn a voice. Sits beside `rolesText` because both are frozen
    // legends: deterministic, never rewritten by the LLM.
    const cast = castOf(all.scenes);
    const voiceText = buildVoiceBlock(cast);
    log.info("▶ cast resolved", {
      speakers: cast.length,
      voices: cast.map((c) => `${c.role}=${c.voice}`).join(" | ") || "none",
    });

    /** Compose one segment's final Seedance prompt from its local beats. */
    const promptFor = async (
      segBeats: Beats,
      durationSec: number,
    ): Promise<{ prompt: string; body: string }> => {
      const input: TemplateVideoPromptInput = {
        userPrompt: run.prompt ?? "",
        brandText: ctx.brandText,
        productBrief: ctx.productBrief || undefined,
        conceptSummary: plan?.conceptSummary?.trim() || undefined,
        visualStyle: ctx.visualStyle,
        aspectRatio: ctx.aspectRatio,
        durationSec,
        hasPerson,
        characterAnchor: ctx.personBrief || undefined,
        scenes: segBeats.scenes,
        slotWindows: segBeats.slotWindows,
        ...(cast.length ? { cast } : {}),
      };
      const body = await composeVideoBody(ctx, input, log);
      // `voiceText` joins `rolesText` in the deterministic PREFIX — the LLM never
      // sees or rewrites either, so both are byte-identical across segments. It
      // also lands before any quoted line, which is the order Seedance expects a
      // voice to be declared in.
      return {
        prompt: `${rolesText}${voiceText}${body}\n\n${TEMPLATE_VIDEO_NEGATIVES}`,
        body,
      };
    };

    // 6a. SINGLE clip (≤15s template): generate + persist the master directly.
    if (segments.length === 1) {
      const only = segments[0]!;
      const { prompt, body } = await promptFor(all, only.durationSec);
      const clip = await generateClip(ctx.video, {
        refs,
        referenceTag: runId,
        prompt,
        durationSec: only.durationSec,
        aspectRatio: ctx.aspectRatio,
        label: "clip",
        log,
      });
      await persistMaster(runId, clip.bytes, {
        durationSec: only.durationSec,
        hasAudio: clip.hasAudio,
        taskId: clip.taskId,
        videoPrompt: body,
      });
      await writeStepEvent({
        runId,
        step,
        status: "passed",
        payload: { durationSec: only.durationSec, segments: 1 },
      });
      log.info("✓ template video persisted (single clip)", {
        durationSec: only.durationSec,
      });
      return;
    }

    // 6b. MULTI clip (>15s template): generate each ≤15s segment sharing ONE
    // run-stable seed (identity/voice continuity), persist each as `segment_video`
    // (idempotent — skip indices already done), then MERGE into the master.
    const seed = stableSeed(runId);
    const done = await persistedSegmentVideoIndices(runId);
    for (let i = 0; i < segments.length; i++) {
      if (done.has(i)) {
        log.info("segment already persisted - skipping", { segment: i });
        continue;
      }
      const seg = segments[i]!;
      const segBeats = beatsForSegment(all, seg.startSec, seg.durationSec);
      const { prompt, body } = await promptFor(segBeats, seg.durationSec);
      const clip = await generateClip(ctx.video, {
        refs,
        referenceTag: `${runId}-seg${i}`,
        prompt,
        durationSec: seg.durationSec,
        aspectRatio: ctx.aspectRatio,
        seed,
        label: `seg${i}`,
        log,
      });
      await persistSheet<Video>({
        runId,
        kind: "segment_video",
        bytes: clip.bytes,
        mime: "video/mp4",
        artifactInsert: async (tx, assetId) => {
          const [row] = await tx
            .insert(schema.videos)
            .values({
              runId,
              assetId,
              durationSec: String(seg.durationSec),
              segmentIndex: i,
              hasAudio: clip.hasAudio,
              providerMeta: {
                provider: "byteplus",
                model: env.BYTEPLUS_VIDEO_MODEL,
                taskId: clip.taskId,
                videoPrompt: body,
              },
              status: "completed",
            })
            .returning();
          return row;
        },
      });
      log.info("✓ segment persisted", { segment: i, durationSec: seg.durationSec });
    }

    // 6c. Merge the ordered segment clips into the full-length master.
    const clips = await segmentVideos(runId);
    if (clips.length < segments.length) {
      throw new Error(
        `template video: expected ${segments.length} segments, found ${clips.length}`,
      );
    }
    log.info("▶ merging segments into the master", { count: clips.length });
    const { bytes } = await mergeSegmentUrls(
      clips.map((c) => c.assetUrl),
      { targetSize: targetSizeFor(ctx.aspectRatio) },
    );
    await persistMaster(runId, bytes, {
      durationSec: masterSec,
      hasAudio: true,
      merged: segments.length,
    });
    await writeStepEvent({
      runId,
      step,
      status: "passed",
      payload: { durationSec: masterSec, segments: segments.length },
    });
    log.info("✓ template video persisted (merged)", {
      durationSec: masterSec,
      segments: segments.length,
    });
  } catch (err) {
    // Force the template code: a Seedance/download failure would otherwise
    // reclassify to a VIDEO_* code, and the template retry
    // (`rewindStepForTemplateRegen`) would not know to resume at template_images.
    const failure = runFailureWithCode("TEMPLATE_VIDEO_FAILED", err);
    log.error("✗ template video failed", {
      footageSec,
      segments: segments.length,
      err: failure.detail ?? failure.message,
    });
    throw failure;
  }
}

/** Persist the master clip as the run's `final_video` (+ its `videos` row). */
async function persistMaster(
  runId: string,
  bytes: Uint8Array,
  meta: {
    durationSec: number;
    hasAudio: boolean;
    taskId?: string;
    videoPrompt?: string;
    merged?: number;
  },
): Promise<void> {
  await persistSheet<Video>({
    runId,
    kind: "final_video",
    bytes,
    mime: "video/mp4",
    artifactInsert: async (tx, assetId) => {
      const [row] = await tx
        .insert(schema.videos)
        .values({
          runId,
          assetId,
          durationSec: String(meta.durationSec),
          segmentIndex: null,
          hasAudio: meta.hasAudio,
          providerMeta: {
            provider: "byteplus",
            model: env.BYTEPLUS_VIDEO_MODEL,
            ...(meta.taskId ? { taskId: meta.taskId } : {}),
            ...(meta.videoPrompt ? { videoPrompt: meta.videoPrompt } : {}),
            ...(meta.merged ? { merged: true, segments: meta.merged } : {}),
          },
          status: "completed",
        })
        .returning();
      return row;
    },
  });
}
