import type { SkillContext, SkillResult } from "../types.js";
import type { ImageRef } from "../../providers/openai/index.js";
import { pollVideoTolerant } from "../../providers/video.js";
import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { parseJsonObject } from "../json.js";
import { persistSheet } from "../persist.js";
import { writeStepEvent } from "../critic/events.js";
import { downloadToBuffer } from "../../lib/download.js";
import { createLogger } from "../../lib/log.js";
import {
  cleanStoryboardRefUrl,
  providerSafeRefUrl,
} from "../../lib/provider-refs.js";
import { classifyRunError, truncateDetail } from "../../lib/run-failure.js";
import {
  buildDeterministicVideoPrompt,
  buildVideoPrompt,
  videoRenderDirective,
} from "./prompt.js";
import { getAdType } from "../ad-types/registry.js";
import { videoNegatives } from "../ad-types/fragments/looks.js";
import {
  MAX_VIDEO_ATTEMPTS,
  promptTierForAttempt,
  videoFailureDisposition,
} from "./retry.js";

export interface VideoBuilderInput {
  /**
   * The LABELLED storyboard sheet — four keyframe panels in a 2×2, each with a
   * scene badge + caption bar. Used as the ordered shot-sequence / framing guide
   * (alongside the product sheet and, when present, the person face). Shot order
   * + framing reach the model through the panels plus the `scenes` text and
   * `transcript`s. The badges/captions are direction only — the sheet is CROPPED
   * clean of them (`cleanStoryboardRefUrl`) before it is sent, so nothing leaks
   * into the final clip; this stored labelled copy stays the UI/review artifact.
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
   * How many panels the ATTACHED sheet actually has, for the clean-crop grid and
   * the board-description wording. Normally equals `scenes.length`, but a
   * template run whose `scenes` were projected from the beats can differ from the
   * rendered sheet, so the orchestrator passes the sheet's own scene count.
   * Defaults to `scenes.length`.
   */
  boardPanelCount?: number;
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
 * Deterministic non-negative 31-bit seed from a string (FNV-1a). Used to derive
 * a RUN-STABLE seed from the runId for multi-segment ads: every segment of one
 * run hashes the SAME runId → the SAME seed, so the synthesized person/voice
 * stay consistent across the merged clips, while different runs still vary.
 */
export function stableSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647;
}

/**
 * Video Builder skill — compose an LLM motion/audio prompt from the storyboard
 * scenes + transcripts (text plan) and send it to Seedance 2.0 (via the
 * injected video provider) together with the storyboard sheet as the ordered
 * shot-sequence guide. The sheet's four panels are the shot sequence — the model
 * follows them in order; the sheet is CROPPED clean of its badges/captions
 * before submit (`cleanStoryboardRefUrl`), so no annotations leak into the
 * output. The product sheet (plain ref) and, when there
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
      hooks: ctx.hooks,
      hasPerson: input.hasPerson,
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
      brandText: ctx.brandText,
      supportingCast: ctx.supportingCast,
      boardPanelCount: input.boardPanelCount,
    });
    let llmVideoPrompt = "";
    for (let attempt = 1; attempt <= 2 && !llmVideoPrompt.trim(); attempt++) {
      try {
        const planRaw = await ctx.openai.chat(messages, { jsonMode: true });
        llmVideoPrompt =
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
    // The simpler, camerafixed deterministic prompt — the retry ladder's final
    // tier (and the fallback when the LLM returned nothing). Built lazily so a
    // healthy first attempt never pays for it. `audioSafe` swaps the verbatim
    // scripted lines for a generic brand-safe audio directive (the ladder's
    // "safe" audioMode, used after an OUTPUT-AUDIO moderation block).
    const detCache = new Map<boolean, string>();
    const detVideoPrompt = (audioSafe = false): string => {
      const cached = detCache.get(audioSafe);
      if (cached !== undefined) return cached;
      const built = buildDeterministicVideoPrompt(
        {
          adStyle: ctx.adStyle,
          adType: ctx.adType,
          scenes: input.scenes,
          durationSec,
          aspectRatio: ctx.aspectRatio,
          characterAnchor: input.characterAnchor,
          segmentIndex: input.segmentIndex,
          hasProductSheet: Boolean(input.productSheetRef?.source),
          brandText: ctx.brandText,
          supportingCast: ctx.supportingCast,
          boardPanelCount: input.boardPanelCount,
        },
        { audioSafe },
      );
      detCache.set(audioSafe, built);
      return built;
    };
    // The prompt BODY for a ladder tier + audio mode: "safe" audioMode always
    // uses the audio-safe deterministic prompt (the flagged verbatim lines are
    // dropped); otherwise the LLM prompt for early attempts (or the
    // deterministic one if the LLM returned nothing), deterministic on the final.
    const videoPromptBody = (
      tier: "llm" | "deterministic",
      audioMode: "full" | "safe" = "full",
    ): string =>
      audioMode === "safe"
        ? detVideoPrompt(true)
        : tier === "deterministic" || !llmVideoPrompt
          ? detVideoPrompt()
          : llmVideoPrompt;
    if (!llmVideoPrompt) {
      log.warn("video prompt: LLM failed twice — using deterministic fallback");
    }

    // 2. Submit to the video provider. The detailed scene descriptions +
    // transcripts ride in the text prompt; the reference images carry identity,
    // framing and shot order. The storyboard ref is cropped clean of its
    // badges/captions/grid before submit, so the model just follows the panels
    // in order and renders one full-frame scene.
    const storyboardUrl = input.storyboardSheetRef.source;
    const productUrl = input.productSheetRef?.source;

    // The @Image numbering is built from the SAME content[] order submit uses
    // (provider appends `referenceImages` (plain) then `personReferences`
    // (asset) after the text), so the legend can never drift from the array.
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
    // Every storyboard is now LIVE-ACTION and can contain a real human, and a raw
    // human image_url trips Seedance's input privacy filter
    // (InputImageSensitiveContentDetected.PrivacyInformation → the run failed
    // PROVIDER_CONTENT_BLOCKED). So route the sheet through the CreateAsset
    // (asset://) path, which clears moderation and accepts aspect 0.4–2.5. The
    // storyboard ref is first CROPPED clean of its badges/caption bars/gridlines
    // (cleanStoryboardRefUrl) so those baked annotations can't leak into the clip
    // — that also pads a provider copy so a stray generated dimension can't fail
    // the run. Order + count are preserved, so the @Image legend below stays correct.
    const lookFamily = getAdType(ctx.adType).lookFamily;
    referenceImages = productUrl
      ? [await providerSafeRefUrl(productUrl, ctx.runId, "product_sheet", log)]
      : [];
    personReferences = [];
    personReferences.push(
      await cleanStoryboardRefUrl(
        storyboardUrl,
        ctx.runId,
        log,
        input.boardPanelCount ?? input.scenes.length,
      ),
    );
    if (faceUrl) {
      personReferences.push(
        await providerSafeRefUrl(faceUrl, ctx.runId, "person_sheet", log),
      );
    }

    // Compact @Image legend prepended to the Seedance prompt (deterministic, so
    // the numbers can never drift from the submit order). Kept terse — the
    // anti-grid / one-continuous-scene rule lives ONCE in `renderDirective` below
    // (it was previously restated here too), so beat content sits nearer the front.
    const boardNo = productUrl ? 2 : 1;
    const roles: string[] = [];
    if (productUrl) {
      roles.push(
        "@Image1 (the product) — keep its exact identity, shape, colour, finish and markings in every beat",
      );
    }
    roles.push(
      `@Image${boardNo} (the storyboard) — match its look, identity and shot order`,
    );
    if (faceUrl) {
      roles.push(
        `@Image${boardNo + 1} (the on-screen face) — keep this exact face and identity throughout`,
      );
    }
    // Look-aware Seedance tail (per the prompting guide: short, failure-tied,
    // positive-rigidity phrasing). The negatives are tailored per look family
    // (product morph vs warped hands vs identity drift), and `--camerafixed true`
    // — Seedance's strongest anti-morph lever — is appended as a documented prompt
    // SUFFIX (silently ignored if unsupported, so it can never 400 the request the
    // way an unknown body field would). ugc_authentic is an INTENTIONALLY handheld
    // look — locking the camera there produces an uncanny "static but candid"
    // frame, so it is excluded; only the deliberately-controlled looks (demo_clean,
    // cinematic_polished) get it.
    const isHandheld = lookFamily === "ugc_authentic";
    // Service ads are a multi-scene skit (cuts between distinct scenes, multiple
    // synthesized characters, wanted on-screen stat/end-card text) — the per-look
    // negatives ("ONE consistent face… no on-screen text") fight that, so service
    // gets its own directive + negatives.
    const isService = ctx.adType === "service";
    const negatives = isService
      ? "Each character stays consistent within their own scenes; ONE speaker per shot, never two voices at once; clean CUTS between the distinct scenes; one full-frame scene per shot, no panel grid or split-screen. Follow the storyboard for what each scene shows — do NOT invent an app/UI screen that is not on the board; IF a scene does show an app/device screen, render its text abstract and non-readable; keep ONLY the hero stat and the end-card line crisp and legible; the final beat is a clean brand END CARD (logo + short tagline + URL on the brand colour, no people)."
      : videoNegatives(lookFamily);
    // Per-look render directive (single source of truth in ./prompt.js): service
    // = skit cuts; cinematic_polished + demo_clean = clean cuts between beats
    // (demo pins the product rigid); ugc_authentic = one continuous take. Kept in
    // lockstep with buildVideoPrompt / buildDeterministicVideoPrompt so the
    // composed prompt can never carry a cut-vs-continuous contradiction.
    const renderDirective = videoRenderDirective(ctx.adType);
    const cameraFixed = isHandheld ? "" : " --camerafixed true";
    const composePrompt = (
      tier: "llm" | "deterministic",
      audioMode: "full" | "safe" = "full",
    ): string =>
      `${roles.join(". ")}. ${renderDirective}\n\n${videoPromptBody(tier, audioMode)}\n\n${negatives}${cameraFixed}`;

    // RETRY LADDER: submit → poll → download, up to MAX_VIDEO_ATTEMPTS times.
    // A TRANSIENT provider failure (network / 5xx / timeout / expired /
    // rate-limit) re-submits after backoff; the final attempt escalates to the
    // simpler deterministic prompt. A non-transient failure (content block, bad
    // input) throws immediately — re-submitting the same inputs would not help.
    // Reference uploads + the @Image legend are built ONCE above; only the
    // prompt body + submit + poll + download repeat. The clip binds to a fresh
    // provider task each attempt (submit is non-idempotent), so a partial charge
    // is unavoidable — the ladder trades that for a far lower dead-run rate.
    const resolution = env.BYTEPLUS_VIDEO_RESOLUTION;
    const segLabel = isSegment ? `, segment ${input.segmentIndex}` : "";
    let task!: Awaited<ReturnType<typeof ctx.video.submitVideo>>;
    let bytes: Uint8Array | undefined;
    let hasAudio = true;
    let videoPrompt = "";
    // Audio moderation recovery (see the catch below): after Seedance flags the
    // OUTPUT AUDIO, we retry ONCE in "safe" mode — the verbatim scripted lines
    // are dropped for generic brand-safe speech, and the seed re-rolls.
    let audioMode: "full" | "safe" = "full";
    for (let attempt = 1; attempt <= MAX_VIDEO_ATTEMPTS; attempt++) {
      const tier = promptTierForAttempt(attempt);
      videoPrompt = videoPromptBody(tier, audioMode);
      const prompt = composePrompt(tier, audioMode);
      try {
        task = await ctx.video.submitVideo({
          referenceImages,
          personReferences,
          // Per-SEGMENT face-asset namespace: every 60s segment submits a
          // DIFFERENT crop strip (all showing the same person), but the provider
          // names face assets `${tag}-person-${i}` with `i` reset per submit — so
          // a shared `ctx.runId` tag would register seg0 and seg1 both as
          // `${runId}-person-0` and `findAssetByName` would hand segments 1-3
          // segment 0's strip. Scope the tag by segment so each strip registers
          // (and resolves) distinctly. Retries reuse the same tag (idempotent
          // asset registration), so a re-submit does not multiply face assets.
          referenceTag: isSegment
            ? `${ctx.runId}-seg${input.segmentIndex}`
            : ctx.runId,
          // Multi-segment runs share ONE run-stable seed (same runId → same
          // seed) so the synthesized person/voice stay consistent across the
          // merged clips. Single 15s clips omit it for per-run variety; the eval
          // env seed still overrides either way (handled in the provider). In
          // audio-safe mode a segment's seed is salted so the retry actually
          // re-rolls (a single clip already re-rolls via an unset seed).
          seed: isSegment
            ? stableSeed(audioMode === "safe" ? `${ctx.runId}-safe` : ctx.runId)
            : undefined,
          prompt,
          durationSec,
          aspectRatio: ctx.aspectRatio,
        });

        // 3. Poll until completed / failed / timeout.
        taskId = task.taskId;
        const submittedAt = Date.now();
        startedAt = submittedAt;
        const deadline = submittedAt + env.BYTEPLUS_POLL_TIMEOUT_MS;
        log.info("task submitted — polling BytePlus", {
          taskId: task.taskId,
          attempt,
          tier,
        });
        // `pollVideoTolerant` absorbs a transient DNS/connect blip while polling
        // (EAI_AGAIN etc.): the clip is still rendering on BytePlus, so it returns a
        // synthetic "processing" and the loop re-polls the SAME task instead of
        // discarding a paid generation. The deadline still bounds a total outage.
        let result = await pollVideoTolerant(ctx.video, task, log);
        lastStatus = result.status ?? "running";
        // Split the wall-clock into BytePlus QUEUE wait vs actual RENDER: mark
        // the first poll that reports `running`. Tells us whether a slow run is
        // provider capacity (long queue) or pure 1080p render time — invisible
        // while `queued` and `running` both read as "processing".
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
          result = await pollVideoTolerant(ctx.video, task, log);
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
          // pollVideo already prefixes failures with the taskId + raw status;
          // only synthesize a message for the (rare) completed-without-url case.
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

        // 4. Stream the mp4 to disk, bounded by a STALL (idle) timeout — never a
        // total-duration cap, so a healthy large clip download is never aborted
        // mid-transfer. Passes any provider auth headers; retries internally.
        log.info("downloading video", { taskId: task.taskId });
        bytes = await downloadToBuffer(result.videoUrl, {
          label: "seedance-clip-download",
          ...(result.downloadHeaders ? { headers: result.downloadHeaders } : {}),
        });
        log.info("✓ video downloaded", {
          taskId: task.taskId,
          bytes: bytes.length,
        });
        hasAudio = result.hasAudio ?? true;
        break; // attempt succeeded — leave the ladder
      } catch (attemptErr) {
        const failure = classifyRunError(attemptErr, "VIDEO_GENERATION_FAILED");
        const isLast = attempt >= MAX_VIDEO_ATTEMPTS;
        // OUTPUT-AUDIO moderation block: the verbatim scripted lines were
        // flagged. Retry ONCE in "safe" audioMode — drop the exact lines for
        // generic brand-safe speech + a fresh re-roll (keeps audio). A second
        // audio block (or a block on the last attempt) falls through below to
        // the soft-fail disposition → the run parks at awaiting_regen.
        if (
          failure.code === "PROVIDER_AUDIO_BLOCKED" &&
          audioMode === "full" &&
          !isLast
        ) {
          audioMode = "safe";
          log.warn("video audio blocked — retrying with brand-safe speech", {
            attempt,
            ...(taskId ? { taskId } : {}),
          });
          await writeStepEvent({
            runId: ctx.runId,
            step,
            status: "regenerated",
            payload: {
              ladderAttempt: attempt,
              tier,
              code: failure.code,
              reason: "audio-safe",
              ...(taskId ? { taskId } : {}),
              ...(isSegment ? { segmentIndex: input.segmentIndex } : {}),
            },
          }).catch(() => {});
          await sleep(1500 * attempt);
          continue;
        }
        const retryable =
          videoFailureDisposition(failure.code, step) === "retry";
        if (!retryable || isLast) throw attemptErr; // outer catch classifies + throws
        // Transient + attempts remaining: record the attempt (a `regenerated`
        // event WITHOUT a `strategy` key, so it does not count against the
        // Critic's per-run regen budget) and re-submit after backoff.
        log.warn("video attempt failed — retrying", {
          attempt,
          code: failure.code,
          err: failure.detail ?? failure.message,
        });
        await writeStepEvent({
          runId: ctx.runId,
          step,
          status: "regenerated",
          payload: {
            ladderAttempt: attempt,
            tier,
            code: failure.code,
            ...(taskId ? { taskId } : {}),
            ...(isSegment ? { segmentIndex: input.segmentIndex } : {}),
          },
        }).catch(() => {});
        await sleep(1500 * attempt);
      }
    }
    if (!bytes) throw new Error("video ladder produced no clip");

    // 5. Persist: Storage → assets (final_video) → videos row, in one tx.
    log.info("uploading video to storage", { bytes: bytes.length });
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
      startedAt != null
        ? Math.round((Date.now() - startedAt) / 1000)
        : undefined;
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
