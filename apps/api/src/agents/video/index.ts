import type { AssetKind } from "@ugc/shared";
import type { SkillContext, SkillResult } from "../types.js";
import type { ImageRef } from "../../providers/openai/index.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { parseJsonObject } from "../json.js";
import { persistSheet } from "../persist.js";
import { writeStepEvent } from "../critic/events.js";
import { type Logger, createLogger } from "../../lib/log.js";
import { padToProviderAspect } from "../../lib/image/normalize.js";
import { uploadAsset } from "../../lib/storage.js";
import { classifyRunError, truncateDetail } from "../../lib/run-failure.js";
import { buildDeterministicVideoPrompt, buildVideoPrompt } from "./prompt.js";

export interface VideoBuilderInput {
  /**
   * The LABELLED storyboard sheet — four numbered keyframe panels (01–04), each
   * with a caption. Sent to the video provider as the ordered shot-sequence /
   * framing guide (alongside the product sheet and, when present, the person
   * face). Shot order + framing reach the model through these numbered keyframes
   * plus the `scenes` text and `transcript`s. The badges/captions are direction
   * only and must not be rendered into the final clip (enforced via the prompt).
   */
  storyboardSheetRef: ImageRef;
  /**
   * Whether the ad features a person. When true the storyboard is routed
   * through the face-asset path so Seedance's real-human face filter accepts it.
   */
  hasPerson: boolean;
  /**
   * The person's IDENTITY image — the uploaded person photo (or the generated
   * person sheet when nothing was uploaded). When present it is registered as
   * the PRIMARY face reference so Seedance locks the on-screen person to this
   * exact face; the storyboard is then a secondary layout/shot-order reference.
   * Without it, identity comes only from the storyboard (which may have drifted).
   */
  personFaceRef?: ImageRef;
  /**
   * The shared PRODUCT reference sheet (both 15s and 60s). Sent as a plain
   * `reference_image` (`@Image 1`) so Seedance locks the product's exact
   * identity/finish/markings instead of inheriting the storyboard's drift. It
   * carries no real human, so it is the raw-URL ref Seedance's privacy filter
   * accepts; the storyboard + face go through the asset:// path when there is a
   * person. Absent ⇒ falls back to storyboard-only product identity.
   */
  productSheetRef?: ImageRef;
  /** Scene metadata (incl. transcripts) from the storyboard_sheets row. */
  scenes: StoryboardScene[];
  /**
   * Presenter identity (gender/age/hair) to PIN in the video prompt — from
   * `runs.person_brief`. Empty for no-person ads and uploaded persons; the
   * gender-locked scene text + `@Image 1` carry identity in that case.
   */
  characterAnchor?: string;
  userPrompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
  /** Optional critique to steer a regen (reserved for F7). */
  critique?: string;
  // ── Multi-segment fields (absent ⇒ the original single 15s final_video) ──
  /**
   * This clip's segment position in a multi-segment run (0..N-1). When set, the
   * clip is persisted as a `segment_video` asset with this `segmentIndex` and its
   * step events are written under the `segment_video` step; the merge step later
   * concatenates the N segments into the `final_video`.
   */
  segmentIndex?: number;
  /** Total segment count (N) of the run — for accurate "part X of N" prompt wording. */
  segmentCount?: number;
  /** The OTHER segments' summaries — continuity context for the prompt. */
  otherSummaries?: string[];
}

const DEFAULT_DURATION_SEC = 15;

type Video = typeof schema.videos.$inferSelect;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Make a person-reference URL safe for BytePlus `CreateAsset`, which rejects
 * aspect ratios outside 0.4–2.5. Generated sheets/strips (which skip the upload
 * normalizer) occasionally drift out of band → `AspectRatioTooSmall/Large` and
 * the whole run fails before it even starts rendering. Pad a PROVIDER-ONLY copy
 * when needed (the stored original — reused as an OpenAI reference + shown in the
 * UI — stays untouched); in-band images and any fetch/encode hiccup fall back to
 * the original URL unchanged.
 */
async function providerSafeFaceUrl(
  url: string,
  runId: string,
  kind: AssetKind,
  log: Logger,
): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/png";
    const norm = await padToProviderAspect(bytes, mime);
    if (!norm.adjusted) return url;
    const { url: paddedUrl } = await uploadAsset({
      runId,
      kind,
      bytes: norm.bytes,
      contentType: norm.mime,
    });
    log.info("padded face ref into provider aspect band", { kind });
    return paddedUrl;
  } catch (err) {
    // Never let a normalization hiccup mask the real generation — fall back to
    // the raw URL and let CreateAsset speak if it's genuinely out of band.
    log.warn("face-ref aspect normalization skipped", {
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    return url;
  }
}

/**
 * Video Builder skill — compose an LLM motion/audio prompt from the storyboard
 * scenes + transcripts (text plan) and send it to Seedance 2.0 (via the
 * injected video provider) together with the LABELLED storyboard sheet as the
 * ordered shot-sequence guide. The sheet's four numbered panels (01–04) are the
 * shot sequence — the model follows them in order while rendering ONE clean
 * continuous clip; the badges/captions are direction only and (per the prompt)
 * must not appear in the output. The product sheet (plain ref) and, when there
 * is a person, the face (asset ref) are sent alongside it to lock identity.
 * Poll until ready, download, and persist `assets` (final_video) + `videos`.
 * Final output of the pipeline; no merge step.
 */
export async function videoBuilder(
  ctx: SkillContext,
  input: VideoBuilderInput,
): Promise<SkillResult<Video>> {
  const durationSec = input.durationSec ?? DEFAULT_DURATION_SEC;
  // 60s segment vs the single 15s clip: a segment is one of four parts merged
  // later, so it persists as a `segment_video` (with its index) and reports under
  // the `segment_video` step; the 15s clip stays the single `final_video`.
  const isSegment = input.segmentIndex != null;
  const step = isSegment ? "segment_video" : "video";
  const assetKind = isSegment ? "segment_video" : "final_video";
  const log = createLogger("video", {
    run: ctx.runId,
    seg: input.segmentIndex ?? null,
  });
  log.info("▶ building video", {
    durationSec,
    hasPerson: input.hasPerson,
    scenes: input.scenes.length,
    segment: input.segmentIndex ?? null,
  });

  await writeStepEvent({
    runId: ctx.runId,
    step,
    status: "started",
    payload: isSegment ? { segmentIndex: input.segmentIndex } : undefined,
  });

  // Hoisted so the catch can report exactly which task, how far it got, and the
  // last provider status it saw — even for failures before/around submit.
  let taskId: string | undefined;
  let startedAt: number | undefined;
  let lastStatus: string | undefined;

  try {
    // 1. Compose the cinematic motion/audio prompt from the scenes + transcripts.
    // Try the LLM up to twice; if it returns empty/unparseable JSON, fall back to
    // a deterministic prompt built straight from the scenes so the video step
    // NEVER fails on a prompt/parse hiccup.
    const messages = buildVideoPrompt({
      adStyle: ctx.adStyle,
      adType: ctx.adType,
      userPrompt: input.userPrompt,
      scenes: input.scenes,
      durationSec,
      aspectRatio: ctx.aspectRatio,
      characterAnchor: input.characterAnchor,
      critique: input.critique,
      segmentIndex: input.segmentIndex,
      segmentCount: input.segmentCount,
      otherSummaries: input.otherSummaries,
      visualStyle: ctx.visualStyle,
      hasProductSheet: Boolean(input.productSheetRef?.source),
    });
    let videoPrompt = "";
    for (let attempt = 1; attempt <= 2 && !videoPrompt.trim(); attempt++) {
      try {
        const planRaw = await ctx.openai.chat(messages, { jsonMode: true });
        videoPrompt =
          parseJsonObject<{ videoPrompt?: string }>(
            planRaw,
          ).videoPrompt?.trim() ?? "";
      } catch (err) {
        log.warn("video prompt unparseable", {
          attempt,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!videoPrompt) {
      videoPrompt = buildDeterministicVideoPrompt({
        adStyle: ctx.adStyle,
        adType: ctx.adType,
        scenes: input.scenes,
        durationSec,
        aspectRatio: ctx.aspectRatio,
        characterAnchor: input.characterAnchor,
        segmentIndex: input.segmentIndex,
        hasProductSheet: Boolean(input.productSheetRef?.source),
      });
      log.warn("video prompt: LLM failed twice — using deterministic fallback");
    }

    // 2. Submit to the video provider. The detailed scene descriptions +
    // transcripts ride in the text prompt; the reference images carry identity,
    // framing and shot order. The prompt tells the model to follow panels 01→04
    // in order yet keep the badges/captions/grid out of the rendered frame.
    const storyboardUrl = input.storyboardSheetRef.source;
    const productUrl = input.productSheetRef?.source;

    // The @Image numbering is built from the SAME content[] order submit uses
    // (provider appends `referenceImages` (plain) then `personReferences`
    // (asset) after the text), so the legend can never drift from the array.
    let prompt: string;
    let referenceImages: string[];
    let personReferences: string[];

    // Reference routing + @Image legend, shared by the 15s and 60s paths.
    // Submit order is text → referenceImages (plain) → personReferences (asset),
    // so @Image numbers follow that order. The PRODUCT sheet carries no human →
    // safe as a plain ref at @Image1. The STORYBOARD panels show the person (and
    // 60s segments always treat it as person content), so it rides the asset://
    // face path when the ad has a person — a raw human ref trips Seedance's
    // privacy filter (InputImageSensitiveContentDetected.PrivacyInformation);
    // with no person it is a plain ref. The face, when present, follows the
    // storyboard. Net numbering: product=1, storyboard=2, face=3 (each shifts
    // down by one when no product sheet is attached).
    const faceUrl = input.hasPerson ? input.personFaceRef?.source : undefined;
    const storyboardIsPersonContent = input.hasPerson || isSegment;

    referenceImages = productUrl ? [productUrl] : [];
    personReferences = [];
    if (storyboardIsPersonContent) {
      // Person refs ride the CreateAsset path (aspect 0.4–2.5) — pad a provider
      // copy first so a stray generated dimension can't fail the run. Order +
      // count are preserved, so the @Image legend below stays correct.
      personReferences.push(
        await providerSafeFaceUrl(
          storyboardUrl,
          ctx.runId,
          "storyboard_sheet",
          log,
        ),
      );
      if (faceUrl) {
        personReferences.push(
          await providerSafeFaceUrl(faceUrl, ctx.runId, "person_sheet", log),
        );
      }
    } else {
      // Plain reference_image (raw image_url, no CreateAsset) — no aspect limit.
      referenceImages.push(storyboardUrl);
    }

    const boardNo = productUrl ? 2 : 1;
    const roles: string[] = [];
    if (productUrl) {
      roles.push(
        "@Image1 (the product) locks the product's exact identity, shape, colour, finish and markings — keep the product visually identical to it in every beat",
      );
    }
    roles.push(
      `@Image${boardNo} (the storyboard) sets shot composition, framing and timeline — a 2×2 grid of four panels (top-left, top-right, bottom-left, bottom-right = 01→04); follow them in order, one per beat`,
    );
    if (faceUrl) {
      roles.push(
        `@Image${boardNo + 1} (the on-screen face) is the presenter — keep this exact face and identity for the entire shot`,
      );
    }
    prompt = `${roles.join(". ")}. Render ONE continuous live-action shot showing only the clean live scene (no grid, badges, caption bars, labels or text).\n\n${videoPrompt}`;

    const task = await ctx.video.submitVideo({
      referenceImages,
      personReferences,
      // Per-SEGMENT face-asset namespace: every 60s segment submits a DIFFERENT
      // crop strip (all showing the same person), but the provider names face
      // assets `${tag}-person-${i}` with `i` reset per submit — so a shared
      // `ctx.runId` tag would register seg0 and seg1 both as `${runId}-person-0`
      // and `findAssetByName` would hand segments 1-3 segment 0's strip. Scope
      // the tag by segment so each strip registers (and resolves) distinctly.
      referenceTag: isSegment
        ? `${ctx.runId}-seg${input.segmentIndex}`
        : ctx.runId,
      prompt,
      durationSec,
      aspectRatio: ctx.aspectRatio,
    });

    // 3. Poll until completed / failed / timeout.
    taskId = task.taskId;
    const submittedAt = Date.now();
    startedAt = submittedAt;
    const deadline = submittedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
    const resolution = env.BYTEPLUS_VIDEO_RESOLUTION;
    const segLabel = isSegment ? `, segment ${input.segmentIndex}` : "";
    log.info("task submitted — polling BytePlus", { taskId: task.taskId });
    let result = await ctx.video.pollVideo(task);
    lastStatus = result.status ?? "running";
    // Split the wall-clock into BytePlus QUEUE wait vs actual RENDER: mark the
    // first poll that reports `running`. Tells us whether a slow run is provider
    // capacity (long queue) or pure 1080p render time — invisible while `queued`
    // and `running` both read as "processing".
    let runningSince: number | undefined =
      lastStatus === "running" ? submittedAt : undefined;
    while (result.state === "processing") {
      const elapsedSec = Math.round((Date.now() - submittedAt) / 1000);
      if (Date.now() > deadline) {
        throw new Error(
          `video task ${task.taskId} timed out after ${env.BYTEPLUS_POLL_TIMEOUT_MS}ms — ${elapsedSec}s elapsed, last status=${lastStatus}, ${resolution} ${durationSec}s${segLabel}`,
        );
      }
      await sleep(env.BYTEPLUS_POLL_INTERVAL_MS);
      result = await ctx.video.pollVideo(task);
      lastStatus = result.status ?? lastStatus;
      if (runningSince === undefined && lastStatus === "running") {
        runningSince = Date.now();
        log.info("task left queue — rendering", {
          taskId: task.taskId,
          queuedSec: Math.round((runningSince - submittedAt) / 1000),
        });
      }
      log.debug("still processing", {
        taskId: task.taskId,
        status: lastStatus,
        elapsedSec: Math.round((Date.now() - submittedAt) / 1000),
      });
    }
    if (result.state === "failed" || !result.videoUrl) {
      const elapsedSec = Math.round((Date.now() - submittedAt) / 1000);
      // pollVideo already prefixes failures with the taskId + raw status; only
      // synthesize a message for the (rare) completed-without-url case.
      throw new Error(
        result.error ??
          `video task ${task.taskId} produced no video — last status=${lastStatus}, ${resolution} ${durationSec}s${segLabel} (${elapsedSec}s elapsed)`,
      );
    }

    // Generation timing (submit → ready, excludes download). queuedSec falls
    // back to 0 when we never observed a `running` poll (treat as render).
    const readyAt = Date.now();
    const totalSec = Math.round((readyAt - submittedAt) / 1000);
    const queuedSec = runningSince
      ? Math.round((runningSince - submittedAt) / 1000)
      : 0;
    log.info("✓ task ready", {
      taskId: task.taskId,
      totalSec,
      queuedSec,
      renderSec: totalSec - queuedSec,
      resolution,
      durationSec,
    });

    // 4. Download the mp4. Pass any auth headers the provider supplied
    // (Seedance's video_url is directly fetchable, so this is usually empty).
    // Retry transient network blips so a flaky download doesn't waste the
    // already-generated (paid) clip.
    let res: Response | undefined;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(result.videoUrl, { headers: result.downloadHeaders });
        break;
      } catch (err) {
        const cause = (err as { cause?: { code?: string; message?: string } })
          .cause;
        lastErr = cause?.code ?? cause?.message ?? (err as Error).message;
        if (attempt < 3) await sleep(800 * attempt);
      }
    }
    if (!res) throw new Error(`failed to download video: ${lastErr}`);
    if (!res.ok) {
      throw new Error(`failed to download video: ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const hasAudio = result.hasAudio ?? true;

    // 5. Persist: Storage → assets (final_video) → videos row, in one tx.
    const persisted = await persistSheet<Video>({
      runId: ctx.runId,
      kind: assetKind,
      bytes,
      mime: "video/mp4",
      // Carry the segment index onto the asset so the UI can order the four
      // segment clips deterministically (they finish in parallel, random order).
      meta: isSegment ? { segmentIndex: input.segmentIndex } : undefined,
      artifactInsert: async (tx, assetId) => {
        const [row] = await tx
          .insert(schema.videos)
          .values({
            runId: ctx.runId,
            assetId,
            durationSec: String(durationSec),
            segmentIndex: input.segmentIndex ?? null,
            hasAudio,
            providerMeta: {
              provider: "byteplus",
              model: env.BYTEPLUS_VIDEO_MODEL,
              taskId: task.taskId,
              videoPrompt,
            },
            status: "completed",
          })
          .returning();
        return row;
      },
    });

    await writeStepEvent({
      runId: ctx.runId,
      step,
      status: "passed",
      payload: {
        taskId: task.taskId,
        durationSec,
        hasAudio,
        ...(isSegment ? { segmentIndex: input.segmentIndex } : {}),
      },
    });
    log.info("✓ video persisted", {
      assetId: persisted.assetId,
      durationSec,
      hasAudio,
    });

    return {
      assetId: persisted.assetId,
      assetUrl: persisted.assetUrl,
      artifact: persisted.artifact,
      promptUsed: JSON.stringify({ messages, videoPrompt }),
    };
  } catch (err) {
    // Classify here so raw provider text (BytePlus task errors, download
    // failures) never propagates as the failure message — only as `detail`.
    const failure = classifyRunError(err, "VIDEO_GENERATION_FAILED");
    const raw = err instanceof Error ? err.message : String(err);
    const elapsedSec =
      startedAt != null ? Math.round((Date.now() - startedAt) / 1000) : undefined;
    // Self-contained ERR line: code + which task/clip + how far it got (taskId /
    // lastStatus / elapsedSec are undefined for failures before submit — fmtCtx
    // drops them). `seg` is already bound on the base logger.
    log.error("✗ video failed", {
      code: failure.code,
      taskId,
      durationSec,
      lastStatus,
      elapsedSec,
      err: failure.detail ?? raw,
    });
    await writeStepEvent({
      runId: ctx.runId,
      step,
      status: "failed",
      payload: {
        error: failure.userMessage,
        code: failure.code,
        detail: truncateDetail(failure.detail ?? raw),
        ...(taskId ? { taskId } : {}),
        ...(lastStatus ? { lastStatus } : {}),
        ...(isSegment ? { segmentIndex: input.segmentIndex } : {}),
      },
    });
    throw failure;
  }
}

/** Video Generation Agent — the F6 skill as one barrel. */
export const videoAgent = {
  videoBuilder,
};
