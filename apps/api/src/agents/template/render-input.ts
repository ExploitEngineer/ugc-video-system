// Turn a run's template snapshot + everything the pipeline generated into the
// Nexrender render job. PURE: no DB, no network, no provider — so the asset
// ordering, which is load-bearing and invisible at runtime, is pinned by a test
// rather than discovered in a broken render.

import type {
  RunTemplate,
  TemplateSlot,
  TemplateTextFillEntry,
} from "@ugc/shared";

import type {
  TemplateJobAssetInput,
  TemplateRenderInput,
} from "../../providers/template-render.js";

export interface BuildRenderInputParts {
  /** Stable tag for logs + idempotency. */
  runId: string;
  /** The immutable snapshot resolved at run creation (`runs.template`). */
  template: RunTemplate;
  /** `template_fill` output. A missing entry falls back to the placeholder. */
  textFill: TemplateTextFillEntry[];
  /** `template_images` output, keyed by `jobLayerName`. */
  imageUrls: Map<string, string>;
  /**
   * One slice of the 15s master per video slot, keyed by `jobLayerName`
   * (`agents/template/clips.ts`). A slot with no entry falls back to the whole
   * master, which After Effects then trims to the layer.
   */
  clipUrls: Map<string, string>;
  /** The 15s master itself — the fallback for an unsliced slot. */
  masterClipUrl: string;
  /** The master's full voiceover, when the template has an audio layer. */
  audioUrl?: string;
  /** The `jobLayerName` of that audio layer. */
  audioLayerName?: string;
}

/**
 * One layer target: a slot or one of its placements (`instances`). Both carry the
 * same four addressing fields, so media can be pushed for either.
 */
type MediaTarget = Pick<
  TemplateSlot,
  "composition" | "jobLayerName" | "targetBy" | "layerIndex"
>;

/** Media whose source will not match the designer's layer box exactly. */
function pushMediaWithAutoscale(
  assets: TemplateJobAssetInput[],
  target: MediaTarget,
  mediaType: "video" | "image",
  src: string,
): void {
  const byIndex = target.targetBy === "index" && target.layerIndex != null;
  assets.push({
    kind: "media",
    mediaType,
    composition: target.composition,
    layerName: target.jobLayerName,
    ...(byIndex ? { layerIndex: target.layerIndex ?? undefined } : {}),
    src,
  });

  // An unnamed layer cannot be autoscaled: `nx:layer-autoscale` takes a
  // `layerName` and has no index form. Its media is pre-sized to the original
  // source's dimensions instead (`clips.ts`), so the layer's authored transform
  // still frames it exactly as the designer intended.
  if (byIndex) return;

  // MUST follow its media asset. Nexrender applies assets in array order, so an
  // autoscale placed first would scale the placeholder that is about to be
  // replaced, and the real source would land at the wrong size.
  assets.push({
    kind: "autoscale",
    composition: target.composition,
    layerName: target.jobLayerName,
    // `fill` covers the layer and crops the overflow. Our sources never match
    // the layer exactly — Seedance renders only 16:9 or 9:16, and gpt-image-2
    // clamps aspects wider than 3:1 — so something must give. Cropped edges beat
    // black bars in an ad.
    fit: "fill",
  });
}

/**
 * Assemble the render job.
 *
 * - every VIDEO slot gets ITS OWN slice of the 15s master, cut from the second
 *   of the clip that slot occupies in the finished ad, so a four-scene template
 *   shows four different moments of one continuous shot
 * - every IMAGE slot the Image Agent filled gets its still; one it did not fill
 *   (a logo, a background, or a generation that failed) is simply omitted, and
 *   the template keeps its own artwork
 * - every TEXT slot gets its written copy, falling back to the template's own
 *   placeholder rather than rendering blank
 * - an AUDIO slot receives the master's full voiceover, so the speech runs
 *   continuously across the ad instead of restarting under each video slot
 *
 * The composition is NEVER trimmed. It keeps its full runtime, and its graphics
 * fill whatever the footage does not cover.
 */
export function buildRenderInput(
  parts: BuildRenderInputParts,
): TemplateRenderInput {
  const { template, clipUrls, masterClipUrl, imageUrls, runId } = parts;
  const textByName = new Map(
    parts.textFill.map((f) => [f.jobLayerName, f.value] as const),
  );

  const assets: TemplateJobAssetInput[] = [];

  for (const slot of template.slots) {
    switch (slot.asset) {
      case "VIDEO": {
        // An unsliced slot falls back to the whole master; AE trims it.
        const url = clipUrls.get(slot.jobLayerName) ?? masterClipUrl;
        // A placeholder re-used across scenes (or a split-screen) has multiple
        // placements — fill EVERY one with the same slice, or the untargeted
        // copies render the template's own solid (the blue block). A
        // single-placement slot has no `instances` and fills once, as before.
        const targets = slot.instances?.length ? slot.instances : [slot];
        for (const target of targets) {
          pushMediaWithAutoscale(assets, target, "video", url);
        }
        break;
      }
      case "IMAGE": {
        const url = imageUrls.get(slot.jobLayerName);
        if (!url) continue; // never generated → the template's own artwork
        pushMediaWithAutoscale(assets, slot, "image", url);
        break;
      }
      case "TEXT": {
        assets.push({
          kind: "text",
          composition: slot.composition,
          layerName: slot.jobLayerName,
          // Never blank: an empty text layer renders as a hole in the design.
          value: textByName.get(slot.jobLayerName)?.trim() || slot.currentText || "",
        });
        break;
      }
      case "AUDIO": {
        // Only the layer `clips.ts` routed the voiceover to. Any other audio
        // layer keeps the template's own track (its music bed, typically).
        if (!parts.audioUrl || slot.jobLayerName !== parts.audioLayerName) break;
        assets.push({
          kind: "media",
          mediaType: "audio",
          composition: slot.composition,
          layerName: slot.jobLayerName,
          ...(slot.targetBy === "index" && slot.layerIndex != null
            ? { layerIndex: slot.layerIndex }
            : {}),
          src: parts.audioUrl,
        });
        // Deliberately no autoscale: an audio layer has no dimensions.
        break;
      }
    }
  }

  return {
    nexrenderTemplateId: template.nexrenderTemplateId,
    composition: template.mainComposition,
    assets,
    referenceTag: runId,
  };
}
