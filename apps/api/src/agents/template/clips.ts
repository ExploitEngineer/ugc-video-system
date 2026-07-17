// Cut the full-length master clip into one piece per video slot, and pull out its
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
import { extractAudio, sliceClipsFromMaster } from "../../lib/video/merge.js";
import { persistAsset } from "../persist.js";
import { templateTotalSeconds } from "./geometry.js";
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
 * The main composition's own box — the last resort for a slot that reports none.
 * A full-frame slice in a layer that wanted a small one is wrong, but it is
 * wrong at the right aspect, which the master's raw 16:9 need not be.
 */
function fallbackSize(
  template: RunTemplate,
): { width: number; height: number } | undefined {
  const { width, height } = template.metadata ?? {};
  return width && height ? { width, height } : undefined;
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

  const plans = planClipSlices(videoSlots, {
    // The master now spans the template's full length (multi-segment merge), so slots
    // slice 1:1 from their true time — the modulo-wrap in `planClipSlices` is a no-op.
    masterSec: templateTotalSeconds(template),
  });
  const done = await existingByLayer(runId, "template_clip");
  const clipUrls = new Map<string, string>();

  const slotByLayer = new Map(videoSlots.map((s) => [s.jobLayerName, s]));

  // Reuse slices already on disk (idempotent resume); only cut the rest.
  const todo = plans.filter((plan) => {
    const cached = done.get(plan.jobLayerName);
    if (cached) {
      clipUrls.set(plan.jobLayerName, cached);
      return false;
    }
    return true;
  });

  if (todo.length > 0) {
    // Cut ALL remaining slices from ONE download of the master. A slideshow template
    // has dozens of video slots; re-downloading the master per slot would be dozens
    // of full fetches (slow, and a network blip each time). Size each slice to the
    // placeholder's own source — an unnamed footage layer can't be autoscaled by
    // Nexrender, so the footage must arrive already the right shape.
    const specs = todo.map((plan) => {
      const slot = slotByLayer.get(plan.jobLayerName);
      // An index-targeted layer gets NO autoscale — `nx:layer-autoscale` takes a
      // layerName and has no index form — so pre-sizing is the only thing standing
      // between the master's native 1920×1080 and a layer whose transform was
      // authored for something else. Every media slot in the library today reports
      // its box, so this fallback is insurance, not a workaround: without it a
      // missing box means no sizing AND no autoscale, which fails silently and
      // looks exactly like a bad render rather than a missing number.
      const size =
        slot?.width && slot?.height
          ? { width: slot.width, height: slot.height }
          : fallbackSize(template);
      if (!(slot?.width && slot?.height)) {
        log.warn("slot reports no box — sizing the slice to the composition", {
          slot: plan.jobLayerName,
          ...(size ?? {}),
        });
      }
      return { startSec: plan.startSec, durationSec: plan.durationSec, targetSize: size };
    });
    const cut = await sliceClipsFromMaster(masterUrl, specs);
    for (let i = 0; i < todo.length; i++) {
      const plan = todo[i] as (typeof todo)[number];
      const { bytes, mime } = cut[i] as { bytes: Uint8Array; mime: string };
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

  // An audio layer is usable ONLY if Nexrender can address it by name. An
  // unnamed one is addressable by stacking index alone, and while index targeting
  // is fine for footage, the encode action rejects an audio asset that carries no
  // layerName and kills the WHOLE render:
  //   "@nexrender/action-encode: assetRedefinition must include src, layerName,
  //    and filename"
  // Every template that has rendered successfully happened to have no audio slot
  // at all, which is why this only surfaced on a template with seven.
  //
  // Falling back to the mux is not a downgrade: `audioSlot` returns the FIRST
  // audio layer, and a template's audio layers are its own sound design ("TING
  // SOUND EFFECT.mp3", "Busy Cafe Restaurant Ambiance.mp3"), not a voiceover
  // slot. Injecting speech into one would overwrite a sound effect and leave the
  // voiceover chopped to that effect's few frames.
  if (audio && audio.targetBy !== "index") {
    log.info("✓ voiceover routed to the template's audio layer", {
      slot: audio.jobLayerName,
    });
    return { clipUrls, audioUrl, audioLayerName: audio.jobLayerName };
  }

  if (audio) {
    log.info("audio layer is unnamed — voiceover will be muxed over the render", {
      slot: audio.jobLayerName,
    });
  } else {
    log.info("no audio layer — voiceover will be muxed over the render");
  }
  return { clipUrls, audioUrl };
}
