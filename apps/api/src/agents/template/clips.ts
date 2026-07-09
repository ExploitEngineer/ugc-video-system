// Cut the 15s master clip into one piece per video slot, and route its audio.
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

export interface ClipAssets {
  /** `jobLayerName` → the URL to inject into that video slot. */
  clipUrls: Map<string, string>;
  /** The master's full voiceover, when the template has a layer to take it. */
  audioUrl?: string;
  /** The audio layer that receives it. */
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
 * The composition is never trimmed to the clip: each slot gets a slice of its
 * own length, so a 30s template renders 30 seconds with its graphics intact.
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
    log.warn("template has no fillable video slot");
    return { clipUrls: new Map() };
  }

  const plans = planClipSlices(videoSlots, { hasAudioLayer: Boolean(audio) });
  const done = await existingByLayer(runId, "template_clip");
  const clipUrls = new Map<string, string>();

  // Cut sequentially. `sliceClip` shares the single-slot ffmpeg semaphore with
  // the merge path, so parallelism here would only queue behind itself.
  for (const plan of plans) {
    const cached = done.get(plan.jobLayerName);
    if (cached) {
      clipUrls.set(plan.jobLayerName, cached);
      continue;
    }

    // The whole master, unmodified: skip ffmpeg and point the slot straight at
    // it. After Effects trims it to whatever the layer needs.
    if (plan.wholeMaster && plan.keepAudio) {
      clipUrls.set(plan.jobLayerName, masterUrl);
      continue;
    }

    const { bytes, mime } = await sliceClip(masterUrl, {
      startSec: plan.startSec,
      durationSec: plan.durationSec,
      keepAudio: plan.keepAudio,
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
        muted: !plan.keepAudio,
      },
    });
    clipUrls.set(plan.jobLayerName, assetUrl);
    log.info("✓ slice persisted", {
      slot: plan.jobLayerName,
      startSec: plan.startSec,
      durationSec: plan.durationSec,
    });
  }

  // No audio layer: the voiceover already rides on whichever slice `keepAudio`
  // marked, and there is nothing to extract.
  if (!audio) {
    log.info("no audio layer — voiceover stays on the longest slice");
    return { clipUrls };
  }

  const doneAudio = await existingByLayer(runId, "template_audio");
  const cachedAudio = doneAudio.get(audio.jobLayerName);
  if (cachedAudio) {
    return { clipUrls, audioUrl: cachedAudio, audioLayerName: audio.jobLayerName };
  }

  // One continuous voiceover across the whole ad, rather than a fragment under
  // each slot. This is the reason the slices are muted.
  const track = await extractAudio(masterUrl);
  const { assetUrl } = await persistAsset({
    runId,
    kind: "template_audio",
    bytes: track.bytes,
    mime: track.mime,
    meta: { jobLayerName: audio.jobLayerName },
  });
  log.info("✓ voiceover routed to the template's audio layer", {
    slot: audio.jobLayerName,
  });
  return { clipUrls, audioUrl: assetUrl, audioLayerName: audio.jobLayerName };
}
