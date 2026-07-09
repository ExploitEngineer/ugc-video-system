// Classify a Nexrender template's raw v3 introspection (compositions + layers)
// into the editable SLOTS the in-app editor renders. Single source of truth,
// shared by the API's `/template-structure` endpoint AND the read-only
// `scripts/inspect-nexrender-layers.ts` (which imports these) so they never drift.
//
// Real v3 fields (lowercase, proven by the script): `layer_type` `text`/`av`/
// `shape`/`null`/`camera`; `source_type` `file`/`comp`/`solid`/null. No value
// field — but a `text` layer's `name` IS its current words, and an `av/file`
// layer's `name` carries the source filename+extension. Footage often sits in
// PLACEHOLDER PRECOMPS (`av/comp` named PH_*/Media_*/…), sometimes empty.

import type { AspectRatio, TemplateSlot, TemplateStructure } from "@ugc/shared";
import type {
  NexComposition,
  NexLayer,
} from "../../providers/template-render.js";

/**
 * Nearest-match aspect ratio from a composition's pixel dimensions — only two
 * shapes are supported today, so this is a coarse landscape/portrait split.
 * Null when either dimension is unknown (some templates don't report them),
 * in which case the run-creation form falls back to a manual pick.
 */
export function deriveAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): AspectRatio | null {
  if (!width || !height) return null;
  return width / height >= 1 ? "16:9" : "9:16";
}

const lower = (s: string | null) => (s ?? "").toLowerCase();

/** Media family from a file-backed layer's name extension, else null. */
export function extType(name: string): "VIDEO" | "IMAGE" | "AUDIO" | null {
  if (/\.(mp4|mov|avi|webm|mkv|m4v|mxf|flv)$/i.test(name)) return "VIDEO";
  if (/\.(png|jpe?g|ai|tiff?|psd|exr|tga|bmp|gif|webp)$/i.test(name)) return "IMAGE";
  if (/\.(mp3|wav|aac|m4a|aiff?|ogg|flac)$/i.test(name)) return "AUDIO";
  return null;
}

const PLACEHOLDER = [
  /^ph[_\s-]?\d*/i,
  /placeholder/i,
  /media[_\s-]?\d*/i,
  /your\s*video/i,
  /video[_\s-]?\d*/i,
  /footage/i,
];
export function isPlaceholder(name: string): boolean {
  return PLACEHOLDER.some((re) => re.test(name));
}

/**
 * The composition to render: the root nobody nests (not any layer's
 * `source_comp_id`), preferring a Final/Main/Master/1920/1080/Render name, else
 * the largest by dimensions.
 */
export function detectMainComposition(
  comps: NexComposition[],
  layers: NexLayer[],
): NexComposition | undefined {
  const nested = new Set(
    layers.map((l) => l.source_comp_id).filter(Boolean).map(String),
  );
  const roots = comps.filter((c) => !nested.has(String(c.aeid)));
  return (
    roots.find((c) => /final|main|master|1920|1080|render|comp/i.test(c.name)) ??
    roots
      .slice()
      .sort(
        (a, b) =>
          (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      )[0] ??
    comps[0]
  );
}

/** Build the editable-slot structure the editor form renders from. */
export function buildStructure(
  comps: NexComposition[],
  layers: NexLayer[],
): TemplateStructure {
  const compName = new Map(comps.map((c) => [String(c.aeid), c.name]));
  const nameOf = (id: number | string | null) =>
    compName.get(String(id)) ?? `comp#${id}`;
  const layersByComp = new Map<string, NexLayer[]>();
  for (const l of layers) {
    const k = String(l.composition_id);
    (layersByComp.get(k) ?? layersByComp.set(k, []).get(k)!).push(l);
  }

  const main = detectMainComposition(comps, layers);
  const mainName = main?.name ?? null;
  // Root/renderable comps (nothing nests them) — the composition-dropdown options.
  const nested = new Set(
    layers.map((l) => l.source_comp_id).filter(Boolean).map(String),
  );
  const renderCompositions = comps
    .filter((c) => !nested.has(String(c.aeid)))
    .map((c) => c.name);

  const slots: TemplateSlot[] = [];
  const ignored: Record<string, number> = {};
  const seen = new Set<string>();
  const add = (slot: TemplateSlot) => {
    const key = `${slot.asset}|${slot.composition}|${slot.jobLayerName}`;
    if (seen.has(key)) return;
    seen.add(key);
    slots.push(slot);
  };
  const ignore = (k: string) => {
    ignored[k] = (ignored[k] ?? 0) + 1;
  };

  for (const l of layers) {
    const t = lower(l.layer_type);
    const s = lower(l.source_type);
    const comp = nameOf(l.composition_id);

    if (t === "text" || t === "textlayer") {
      add({
        asset: "TEXT",
        composition: comp,
        layerName: l.name,
        jobLayerName: l.name,
        currentText: l.name,
        injectVia: comp === mainName ? "asset" : "function",
      });
      continue;
    }
    // Direct file-backed media layer (name carries the extension).
    if ((t === "av" || t === "avlayer") && s === "file") {
      const m = extType(l.name);
      if (m) {
        add({
          asset: m,
          composition: comp,
          layerName: l.name,
          jobLayerName: l.name,
          injectVia: "asset",
        });
      } else {
        ignore("av/file(no-ext)");
      }
      continue;
    }
    // Placeholder precomp → a media slot; follow one level in for the real layer.
    if (
      (t === "av" || t === "avlayer") &&
      s === "comp" &&
      isPlaceholder(l.name)
    ) {
      const childComp = nameOf(l.source_comp_id);
      const inner = layersByComp.get(String(l.source_comp_id)) ?? [];
      const target =
        inner.find(
          (x) =>
            lower(x.layer_type) === "av" &&
            (lower(x.source_type) === "file" || lower(x.source_type) === "solid"),
        ) ?? inner[0];
      add({
        asset: "VIDEO",
        composition: childComp,
        layerName: target ? target.name : `(empty ${childComp})`,
        jobLayerName: target ? target.name : childComp,
        empty: !target,
        injectVia: "asset",
      });
      continue;
    }
    // Everything else — structure/control.
    const k = t === "av" && s === "comp" ? "nested-comp" : t === "av" ? `av/${s}` : t || "?";
    ignore(k);
  }

  // Editable order: VIDEO, IMAGE, AUDIO, TEXT.
  const order = ["VIDEO", "IMAGE", "AUDIO", "TEXT"];
  slots.sort((a, b) => order.indexOf(a.asset) - order.indexOf(b.asset));

  return {
    status: "ready",
    mainComposition: mainName,
    renderCompositions: renderCompositions.length ? renderCompositions : comps.map((c) => c.name),
    slots,
    mainCompositionWidth: main?.width ?? null,
    mainCompositionHeight: main?.height ?? null,
    suggestedAspectRatio: deriveAspectRatio(main?.width, main?.height),
    ignored,
  };
}
