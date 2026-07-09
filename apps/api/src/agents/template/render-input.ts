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
  /** The generated Seedance clip. */
  clipUrl: string;
}

/** Media whose source will not match the designer's layer box exactly. */
function pushMediaWithAutoscale(
  assets: TemplateJobAssetInput[],
  slot: TemplateSlot,
  mediaType: "video" | "image",
  src: string,
): void {
  assets.push({
    kind: "media",
    mediaType,
    composition: slot.composition,
    layerName: slot.jobLayerName,
    src,
  });
  // MUST follow its media asset. Nexrender applies assets in array order, so an
  // autoscale placed first would scale the placeholder that is about to be
  // replaced, and the real source would land at the wrong size.
  assets.push({
    kind: "autoscale",
    composition: slot.composition,
    layerName: slot.jobLayerName,
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
 * - every non-empty VIDEO slot gets the generated clip
 * - every IMAGE slot the Image Agent filled gets its still; one it did not fill
 *   (a logo, a background, or a generation that failed) is simply omitted, and
 *   the template keeps its own artwork
 * - every TEXT slot gets its written copy, falling back to the template's own
 *   placeholder rather than rendering blank
 * - AUDIO slots keep the template's own track
 * - a composition longer than the clip is trimmed to it
 */
export function buildRenderInput(
  parts: BuildRenderInputParts,
): TemplateRenderInput {
  const { template, clipUrl, imageUrls, runId } = parts;
  const textByName = new Map(
    parts.textFill.map((f) => [f.jobLayerName, f.value] as const),
  );

  const assets: TemplateJobAssetInput[] = [];

  for (const slot of template.slots) {
    switch (slot.asset) {
      case "VIDEO": {
        // A placeholder precomp with no fillable inner layer: nothing to target.
        if (slot.empty) continue;
        pushMediaWithAutoscale(assets, slot, "video", clipUrl);
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
      case "AUDIO":
        break; // v1: the template keeps its own track
    }
  }

  // Last, so nothing above can re-lengthen the work area. Only when the
  // composition outruns the clip — otherwise the tail plays past the footage.
  if (template.metadata.trimComp) {
    assets.push({
      kind: "compDuration",
      composition: template.mainComposition,
      valueSec: template.metadata.clipSeconds,
    });
  }

  return {
    nexrenderTemplateId: template.nexrenderTemplateId,
    composition: template.mainComposition,
    assets,
    referenceTag: runId,
  };
}
