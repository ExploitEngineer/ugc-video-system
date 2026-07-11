// Cut the 15s master clip into one piece per video slot, and pull out its
// voiceover.
//
// Called from `template_render`, before the Nexrender job is assembled. Both
// halves are idempotent: a rewind that re-enters the render step reuses the
// slices already on disk rather than re-cutting them, which matters because a
// failed composite must not cost another minute of ffmpeg.

import { and, eq } from "drizzle-orm";

import type { RunTemplate } from "@ugc/shared";

import { db, schema } from "../../db/index.js";
import { createLogger } from "../../lib/log.js";
import { extractAudio, sliceClip } from "../../lib/video/merge.js";
import { persistAsset } from "../persist.js";
import { audioSlot, fillableVideoSlots } from "./introspect.js";
import { planClipSlices } from "./slices.js";

const log = createLogger("template-clips");

/**
 * The `meta.jobLayerName` the extracted voiceover is persisted under. A sentinel,
 * not a layer: the track is a property of the master clip, and most templates
 * have no audio layer to name it after.
 */
const VOICEOVER_KEY = "__master__";

export interface ClipAssets {
  /** `jobLayerName` → the URL to inject into that video slot. */
  clipUrls: Map<string, string>;
  /** The master's full voiceover, as its own asset. */
  audioUrl?: string;
  /**
   * The template's own audio layer, when it has one. Absent means the voiceover
   * has nowhere to live inside After Effects and is muxed over the finished
   * render instead — which is the usual case.
   */
  audioLayerName?: string;
}

/** Existing assets of one kind for this run, keyed by `meta.jobLayerName`. */
async function existingByLayer(
  runId: string,
  kind: "template_clip" | "template_audio",
): Promise<Map<string, string>> {
  const rows = await db
    .select({ url: schema.assets.url, meta: schema.assets.meta })
    .from(schema.assets)
    .where(and(eq(schema.assets.runId, runId), eq(schema.assets.kind, kind)));

  const out = new Map<string, string>();
  for (const r of rows) {
    const name = (r.meta as { jobLayerName?: string } | null)?.jobLayerName;
    if (name && r.url) out.set(name, r.url);
  }
  return out;
}

/**
 * Prepare the footage for every video slot, plus the voiceover.
 *
 * Each slot receives the second of the master it actually occupies in the
 * finished ad, cut 1:1, so the scenes read as one continuous take AND stay in
 * sync with the voiceover. Every slice is muted; the speech is carried whole,
 * either by the template's own audio layer or — far more often — by a mux over
 * the finished render.
 *
 * The ad is capped at the master's 15s downstream (`capVideoDuration`): a
 * composition longer than that keeps its design, but anything past 15s is
 * cropped rather than compressed into frame.
 */
export async function prepareTemplateClips(
  runId: string,
  template: RunTemplate,
  masterUrl: string,
): Promise<ClipAssets> {
  const videoSlots = fillableVideoSlots(template.slots);
  const audio = audioSlot(template.slots);

  if (videoSlots.length === 0) {
    // The library rejects such templates, but a stale snapshot could still
    // reach here. Nothing to cut.
    log.warn("template has no video slot");
    return { clipUrls: new Map() };
  }

  const plans = planClipSlices(videoSlots);
  const done = await existingByLayer(runId, "template_clip");
  const clipUrls = new Map<string, string>();

  const slotByLayer = new Map(videoSlots.map((s) => [s.jobLayerName, s]));

  // Cut sequentially. `sliceClip` shares the single-slot ffmpeg semaphore with
  // the merge path, so parallelism here would only queue behind itself.
  for (const plan of plans) {
    const cached = done.get(plan.jobLayerName);
    if (cached) {
      clipUrls.set(plan.jobLayerName, cached);
      continue;
    }

    // Size the slice to the placeholder's own source. An unnamed layer — which
    // is what a footage placeholder is — cannot be autoscaled by Nexrender, so
    // the footage has to arrive already the right shape.
    const slot = slotByLayer.get(plan.jobLayerName);
    const targetSize =
      slot?.width && slot?.height
        ? { width: slot.width, height: slot.height }
        : undefined;

    const { bytes, mime } = await sliceClip(masterUrl, {
      startSec: plan.startSec,
      durationSec: plan.durationSec,
      targetSize,
    });
    const { assetUrl } = await persistAsset({
      runId,
      kind: "template_clip",
      bytes,
      mime,
      meta: {
        jobLayerName: plan.jobLayerName,
        startSec: plan.startSec,
        durationSec: plan.durationSec,
      },
    });
    clipUrls.set(plan.jobLayerName, assetUrl);
    log.info("✓ slice persisted", {
      slot: plan.jobLayerName,
      startSec: plan.startSec,
      durationSec: plan.durationSec,
    });
  }

  // Always extracted, whether it will be injected into an audio layer or muxed
  // over the render.
  const doneAudio = await existingByLayer(runId, "template_audio");
  const cached = doneAudio.get(VOICEOVER_KEY);
  const audioUrl =
    cached ??
    (
      await persistAsset({
        runId,
        kind: "template_audio",
        ...(await extractAudio(masterUrl)),
        meta: { jobLayerName: VOICEOVER_KEY },
      })
    ).assetUrl;

  if (audio) {
    log.info("✓ voiceover routed to the template's audio layer", {
      slot: audio.jobLayerName,
    });
    return { clipUrls, audioUrl, audioLayerName: audio.jobLayerName };
  }

  log.info("no audio layer — voiceover will be muxed over the render");
  return { clipUrls, audioUrl };
}
