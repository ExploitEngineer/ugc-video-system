// Turn the plan's per-slot `videoScene` + each video slot's resolved timeline
// window into an ordered BEAT LIST that steers the ONE 15s master.
//
// WHY THIS EXISTS. The master is a single continuous Seedance clip, and
// `template_render` slices it 1:1 by composition-time (`slices.ts`): a slot that
// plays 0:02–0:05 is cut the master's 2s–5s. So if the master SHOWS that slot's
// intended beat during those seconds, the slice lands on the right footage. This
// module carries the per-slot intent — captured by `template_plan` and, until
// now, dead after that step — to the video prompt as a timestamped shot list.
//
// Pure: no I/O, no provider, no DB — same contract as `slices.ts`/`timeline.ts`,
// so the normalization is unit-testable without a run.

import type { RunTemplate, TemplatePlan } from "@ugc/shared";

import type { StoryboardScene } from "../image/storyboard/prompt.js";
import { MASTER_CLIP_SECONDS } from "./geometry.js";
import { fillableVideoSlots } from "./introspect.js";

export interface TemplateBeat {
  /** The video slot this beat is authored for. */
  jobLayerName: string;
  /** Seconds into the master where this beat begins. */
  startSec: number;
  /** How long the beat is on screen (shot-list length; see `makeContiguous`). */
  durationSec: number;
  /** What the master shows during the window — the slot's `videoScene`. */
  scene: string;
}

/**
 * A slot on screen for less than this is too fleeting to earn its own Seedance
 * shot; it is folded into the previous beat so the shot list stays legible.
 */
const MIN_BEAT_SEC = 1.5;

/** Never ask Seedance to hold more than this many distinct beats in one take. */
const MAX_BEATS = 6;

/**
 * Derive the beat list that steers the master, or `undefined` to leave the video
 * path exactly as it is today.
 *
 * Returns `undefined` — falling back to the generic even-split clip — when:
 *  - there are fewer than 2 video slots (a single-slot template is one scene,
 *    which the existing prompt already handles);
 *  - any video slot's timeline window is unresolved (an older snapshot); or
 *  - the plan authored no `videoScene` at all (no intent to steer with).
 */
export function deriveTemplateBeats(
  tpl: RunTemplate,
  plan: TemplatePlan,
  masterSec: number = MASTER_CLIP_SECONDS,
): TemplateBeat[] | undefined {
  const slots = fillableVideoSlots(tpl.slots);
  if (slots.length < 2) return undefined;
  if (slots.some((s) => s.startSec == null || s.durationSec == null)) {
    return undefined;
  }

  const sceneByLayer = new Map(
    plan.slots.map((p) => [p.jobLayerName, p.videoScene?.trim() ?? ""]),
  );

  let beats: TemplateBeat[] = slots
    .map((s) => ({
      jobLayerName: s.jobLayerName,
      // Non-null asserted: the guard above returned early if any were null.
      startSec: s.startSec as number,
      durationSec: s.durationSec as number,
      scene: sceneByLayer.get(s.jobLayerName) ?? "",
    }))
    // A slot beginning at/after the master's end never reaches the screen.
    .filter((b) => b.startSec < masterSec)
    .sort((a, b) => a.startSec - b.startSec);

  if (beats.length < 2) return undefined;
  if (beats.every((b) => b.scene === "")) return undefined;

  beats = mergeShort(beats);
  beats = capBeats(beats, MAX_BEATS);
  return makeContiguous(beats, masterSec);
}

/** Fold every beat shorter than `MIN_BEAT_SEC` into the beat before it. */
function mergeShort(beats: TemplateBeat[]): TemplateBeat[] {
  const out: TemplateBeat[] = [];
  for (const b of beats) {
    const prev = out[out.length - 1];
    if (prev && b.durationSec < MIN_BEAT_SEC) {
      prev.durationSec = Math.max(
        prev.durationSec,
        b.startSec + b.durationSec - prev.startSec,
      );
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/** Merge the shortest beats into their predecessor until at most `max` remain. */
function capBeats(beats: TemplateBeat[], max: number): TemplateBeat[] {
  const out = beats.map((b) => ({ ...b }));
  while (out.length > max) {
    let idx = 1;
    for (let i = 2; i < out.length; i++) {
      if (out[i].durationSec < out[idx].durationSec) idx = i;
    }
    const b = out[idx];
    const prev = out[idx - 1];
    prev.durationSec = Math.max(
      prev.durationSec,
      b.startSec + b.durationSec - prev.startSec,
    );
    out.splice(idx, 1);
  }
  return out;
}

/**
 * Make the shot list gapless: each beat runs until the next beat starts, and the
 * last runs to the end of the master. This only shapes the timestamped brackets
 * fed to Seedance — the real slicer cuts each ORIGINAL slot window and is never
 * touched by this.
 */
function makeContiguous(
  beats: TemplateBeat[],
  masterSec: number,
): TemplateBeat[] {
  return beats.map((b, i) => {
    const nextStart =
      i < beats.length - 1 ? beats[i + 1].startSec : masterSec;
    return { ...b, durationSec: Math.max(0.5, nextStart - b.startSec) };
  });
}

/**
 * Project the beats onto the video builder's `StoryboardScene[]` shape: the beat
 * text becomes each scene's description, and camera/look/transcript are borrowed
 * from the storyboard scene covering the beat's midpoint — so the muxed
 * voiceover still reads front-to-back as one coherent arc while the visuals hit
 * each slot's beat. A beat past the storyboard's coverage falls back to its own
 * scene text with an empty transcript (Seedance then narrates from the concept).
 */
export function beatsToScenes(
  beats: TemplateBeat[],
  storyboard: StoryboardScene[],
  masterSec: number = MASTER_CLIP_SECONDS,
): StoryboardScene[] {
  return beats.map((b, i) => {
    const mid = b.startSec + b.durationSec / 2;
    const src =
      storyboard.length > 0
        ? storyboard[
            Math.min(
              storyboard.length - 1,
              Math.max(0, Math.floor((mid / masterSec) * storyboard.length)),
            )
          ]
        : undefined;
    return {
      index: i,
      cameraAngle: src?.cameraAngle ?? "",
      actionMovement: src?.actionMovement ?? "",
      sceneDescription: b.scene || src?.sceneDescription || "",
      panelCaption: src?.panelCaption ?? "",
      transcript: src?.transcript ?? "",
      adStyle: src?.adStyle ?? "",
    };
  });
}
