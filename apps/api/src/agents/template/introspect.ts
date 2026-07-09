// Classify a Nexrender template's raw v3 introspection (compositions + layers)
// into the SLOTS the pipeline fills. Single source of truth, shared by the
// template routes AND the read-only `scripts/inspect-nexrender-layers.ts`
// (which imports these) so the two never drift.
//
// Real v3 fields (lowercase, proven by the script): `layer_type` `text`/`av`/
// `shape`/`null`/`camera`; `source_type` `file`/`comp`/`solid`/null. No value
// field — but a `text` layer's `name` IS its current words, and an `av/file`
// layer's `name` carries the source filename+extension. Footage often sits in
// PLACEHOLDER PRECOMPS (`av/comp` named PH_*/Media_*/…), sometimes empty.
//
// Beyond classification this captures what v2 needs and v1 threw away:
//   - the main comp's `duration` + `frame_rate` → `clipSeconds` (generate a clip
//     as long as the template, not a fixed 15s)
//   - each layer's box → the gpt-image-2 size for an image slot, and the
//     icon-vs-backdrop signal behind `imageClass`
//   - each TEXT layer's `charBudget`, so the copywriter has a hard ceiling
//
// A placeholder precomp is NO LONGER assumed to hold video: `classifyPlaceholderSlot`
// follows it one level in, because assuming VIDEO injected the generated clip
// into every image placeholder in the template.

import type {
  AspectRatio,
  SlotCounts,
  TemplateMetadata,
  TemplateSlot,
  TemplateStructure,
} from "@ugc/shared";
import type {
  NexComposition,
  NexLayer,
} from "../../providers/template-render.js";
import {
  classifyImageSlot,
  deriveCharBudget,
} from "./geometry.js";

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
  /^img[_\s-]?\d*/i,
  /your\s*(image|photo|logo)/i,
];
export function isPlaceholder(name: string): boolean {
  return PLACEHOLDER.some((re) => re.test(name));
}

// Layer names use underscores (`PH_IMAGE_2`), and `_` is a word character — so
// a naive /\bimage\b/ never matches. Normalize separators to spaces FIRST, then
// match whole words. Getting this wrong makes every name test silently fall
// through to the default.
const normalizeName = (name: string): string =>
  ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasAnyWord = (haystack: string, words: readonly string[]): boolean =>
  words.some((w) => haystack.includes(` ${w} `));

/** Words that mark a placeholder precomp as holding a still, not a clip. */
const IMAGE_PLACEHOLDER_WORDS = [
  "img", "image", "photo", "picture", "still",
  "logo", "poster", "bg", "background", "thumb", "icon",
] as const;
/** Words that mark it as holding a clip. */
const VIDEO_PLACEHOLDER_WORDS = [
  "video", "clip", "footage", "movie", "reel",
] as const;

/**
 * A placeholder precomp (`av/comp` named `PH_1`, `Media_2`, …) holds either a
 * clip or a still. v1 assumed VIDEO unconditionally, which quietly turned every
 * image placeholder into a slot the generated clip was injected into.
 *
 * The inner layer's filename extension is the ground truth; when the inner
 * layer is a solid, a nested comp, or absent entirely, fall back to the names.
 * Default VIDEO only when nothing at all disambiguates — a template must have a
 * video slot to be usable, so an unclassifiable placeholder is more likely the
 * hero clip than a still.
 */
export function classifyPlaceholderSlot(
  outer: NexLayer,
  inner: NexLayer | undefined,
): "VIDEO" | "IMAGE" {
  // 1. The inner layer's real filename wins outright.
  if (inner && lower(inner.source_type) === "file") {
    const ext = extType(inner.name);
    if (ext === "IMAGE") return "IMAGE";
    if (ext === "VIDEO") return "VIDEO";
  }
  // 2. Then the names — inner first, it is closer to the actual footage.
  for (const raw of [inner?.name, outer.name]) {
    if (!raw) continue;
    const name = normalizeName(raw);
    if (hasAnyWord(name, VIDEO_PLACEHOLDER_WORDS)) return "VIDEO";
    if (hasAnyWord(name, IMAGE_PLACEHOLDER_WORDS)) return "IMAGE";
  }
  return "VIDEO";
}

// Nexrender's v3 layers response carries an opaque `data` bag
// (`additionalProperties: true`). Its contents are UNDOCUMENTED, and no endpoint
// anywhere reports which fonts a template needs — checked against the v3
// template-metadata and fonts endpoints. So probe defensively across the shapes
// a parser plausibly emits, and let `scripts/inspect-nexrender-layers.ts` dump
// the real keys against a real .aep before anything depends on this.
//
// We never SEND a font back to Nexrender: its font bank auto-resolves by family
// name at submit time, so the designer's typography is preserved untouched.
// These values exist only so the plan agent knows how wide the copy will render.

const FONT_PATHS = [
  ["font"], ["fontName"], ["fontFamily"], ["family"],
  ["text", "font"], ["text", "fontFamily"],
  ["properties", "font"], ["style", "font"], ["style", "fontFamily"],
] as const;

const FONT_SIZE_PATHS = [
  ["fontSize"], ["size"], ["text", "fontSize"],
  ["properties", "fontSize"], ["style", "fontSize"],
] as const;

function dig(bag: Record<string, unknown> | undefined, path: readonly string[]): unknown {
  let cur: unknown = bag;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** The text layer's font family, if the opaque `data` bag happens to carry it. */
export function extractFont(data?: Record<string, unknown>): string | undefined {
  if (!data) return undefined;
  for (const path of FONT_PATHS) {
    const v = dig(data, path);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** The text layer's font size in px, if present. Refines `charBudget`. */
export function extractFontSize(data?: Record<string, unknown>): number | undefined {
  if (!data) return undefined;
  for (const path of FONT_SIZE_PATHS) {
    const v = dig(data, path);
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** A finite, strictly-positive number, else null. Guards a duration of 0 or -1. */
export function positiveOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A VIDEO layer's length in seconds, IF the opaque `data` bag happens to carry
 * it. The documented v3 layers response has no time fields at all, so this is a
 * defensive probe over the shapes a parser plausibly emits — including an
 * in/out pair, which we turn into a duration.
 *
 * Run `pnpm --filter api nexrender:inspect <templateId>` against a real .aep to
 * see the real key names before trusting any of these.
 */
const DURATION_PATHS = [
  ["duration"], ["durationSec"], ["length"],
  ["source", "duration"], ["properties", "duration"],
] as const;

const IN_OUT_PAIRS = [
  [["inPoint"], ["outPoint"]],
  [["in"], ["out"]],
  [["startTime"], ["endTime"]],
] as const;

export function extractLayerDuration(
  data?: Record<string, unknown>,
): number | undefined {
  if (!data) return undefined;
  const num = (v: unknown): number | undefined => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
  };

  for (const path of DURATION_PATHS) {
    const n = num(dig(data, path));
    if (n !== undefined && n > 0) return n;
  }
  for (const [inPath, outPath] of IN_OUT_PAIRS) {
    const a = num(dig(data, inPath));
    const b = num(dig(data, outPath));
    if (a !== undefined && b !== undefined && b > a) return b - a;
  }
  return undefined;
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
  // Keep the comps BY ID, not just their names. A placeholder precomp's child
  // composition carries its own `duration`, and that is the only place a video
  // slot's length exists — Nexrender's layers response has no time fields at
  // all. Losing it here is what forced every slot to receive the whole clip.
  const compById = new Map(comps.map((c) => [String(c.aeid), c]));
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

  const compW = main?.width ?? null;
  const compH = main?.height ?? null;

  /**
   * An IMAGE slot, classified so the Image Agent knows whether it may fill it.
   * `classifyName` may differ from `layerName`: for a placeholder precomp we
   * classify on BOTH names, because the intent usually lives on the outer layer
   * (`logo_placeholder`) while the inner one is a meaningless `Solid 1`.
   */
  const addImage = (
    box: NexLayer,
    comp: string,
    jobLayerName: string,
    layerName: string,
    classifyName: string = layerName,
    extra: Partial<TemplateSlot> = {},
  ) =>
    add({
      asset: "IMAGE",
      composition: comp,
      layerName,
      jobLayerName,
      injectVia: "asset",
      width: box.width ?? null,
      height: box.height ?? null,
      durationSec: null, // stills have no length
      imageClass: classifyImageSlot({
        layerName: classifyName,
        width: box.width,
        height: box.height,
        compWidth: compW,
        compHeight: compH,
      }),
      ...extra,
    });

  for (const l of layers) {
    const t = lower(l.layer_type);
    const s = lower(l.source_type);
    const comp = nameOf(l.composition_id);

    if (t === "text" || t === "textlayer") {
      const font = extractFont(l.data);
      const fontSize = extractFontSize(l.data);
      add({
        asset: "TEXT",
        composition: comp,
        layerName: l.name,
        jobLayerName: l.name,
        // A text layer's NAME is its current words — Nexrender exposes no
        // separate value field. See the header note.
        currentText: l.name,
        injectVia: comp === mainName ? "asset" : "function",
        width: l.width ?? null,
        height: l.height ?? null,
        // The box wins over the placeholder's length; when the `data` bag has no
        // font size, the layer's HEIGHT stands in for it.
        charBudget: deriveCharBudget(l.name, l.width, fontSize, l.height),
        durationSec: null, // text has no length
        ...(font ? { font } : {}),
      });
      continue;
    }

    // Direct file-backed media layer (name carries the extension).
    if ((t === "av" || t === "avlayer") && s === "file") {
      const m = extType(l.name);
      if (!m) {
        ignore("av/file(no-ext)");
        continue;
      }
      if (m === "IMAGE") {
        addImage(l, comp, l.name, l.name, l.name);
      } else {
        add({
          asset: m,
          composition: comp,
          layerName: l.name,
          jobLayerName: l.name,
          injectVia: "asset",
          width: l.width ?? null,
          height: l.height ?? null,
          // A direct file layer exposes no length. The `data` bag might, but it
          // is undocumented; the slice planner falls back to an even split.
          durationSec: extractLayerDuration(l.data) ?? null,
        });
      }
      continue;
    }

    // Placeholder precomp → a media slot; follow one level in for the real layer.
    // The inner layer decides VIDEO vs IMAGE: assuming VIDEO (as v1 did) turns
    // every image placeholder into a slot the clip gets injected into.
    if (
      (t === "av" || t === "avlayer") &&
      s === "comp" &&
      isPlaceholder(l.name)
    ) {
      const childComp = nameOf(l.source_comp_id);
      const child = compById.get(String(l.source_comp_id));
      const inner = layersByComp.get(String(l.source_comp_id)) ?? [];
      const target =
        inner.find(
          (x) =>
            lower(x.layer_type) === "av" &&
            (lower(x.source_type) === "file" || lower(x.source_type) === "solid"),
        ) ?? inner[0];

      const kind = classifyPlaceholderSlot(l, target);
      const layerName = target ? target.name : `(empty ${childComp})`;
      const jobLayerName = target ? target.name : childComp;

      if (kind === "IMAGE") {
        // Geometry comes from the OUTER placeholder layer: it is the box the
        // designer laid out in the main comp. The inner layer is 0,0-anchored.
        // Classify on BOTH names — `logo_placeholder` wrapping `Solid 1` must
        // still read as brand.
        addImage(l, childComp, jobLayerName, layerName, `${l.name} ${target?.name ?? ""}`, {
          empty: !target,
        });
      } else {
        add({
          asset: "VIDEO",
          composition: childComp,
          layerName,
          jobLayerName,
          empty: !target,
          injectVia: "asset",
          width: l.width ?? null,
          height: l.height ?? null,
          // THE slot length. The child composition the designer built around this
          // placeholder is as long as the footage it expects, so a 2s cutaway
          // precomp reports 2. This is the only per-slot time signal Nexrender
          // exposes; the inner layer itself carries none.
          durationSec:
            positiveOrNull(child?.duration) ??
            extractLayerDuration(l.data) ??
            extractLayerDuration(target?.data) ??
            null,
        });
      }
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
    mainCompositionWidth: compW,
    mainCompositionHeight: compH,
    mainCompositionDurationSec: main?.duration ?? null,
    mainCompositionFrameRate: main?.frame_rate ?? null,
    suggestedAspectRatio: deriveAspectRatio(compW, compH),
    ignored,
  };
}

/** How many slots of each kind a structure has. Drives the picker card. */
export function countSlots(slots: TemplateSlot[]): SlotCounts {
  return {
    video: slots.filter((s) => s.asset === "VIDEO").length,
    image: slots.filter((s) => s.asset === "IMAGE").length,
    text: slots.filter((s) => s.asset === "TEXT").length,
    audio: slots.filter((s) => s.asset === "AUDIO").length,
  };
}

/** The IMAGE slots the Image Agent is allowed to generate. */
export function fillableImageSlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter((s) => s.asset === "IMAGE" && s.imageClass === "content");
}

/**
 * The composition-level summary derived from an introspected structure — the
 * surface the picker card, the `POST /runs` gate and the video agent read.
 * `clipSeconds` is the whole point: the clip must be as long as the template's
 * video slot, not a fixed 15s.
 */
export function buildMetadata(structure: TemplateStructure): TemplateMetadata {
  return {
    durationSec: structure.mainCompositionDurationSec,
    frameRate: structure.mainCompositionFrameRate,
    width: structure.mainCompositionWidth,
    height: structure.mainCompositionHeight,
    aspectRatio: structure.suggestedAspectRatio,
    slotCounts: countSlots(structure.slots),
  };
}

/** The VIDEO slots, in layer order, that actually have a layer to fill. */
export function fillableVideoSlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter((s) => s.asset === "VIDEO" && !s.empty);
}

/** The template's own audio layer, if it has one. */
export function audioSlot(slots: TemplateSlot[]): TemplateSlot | undefined {
  return slots.find((s) => s.asset === "AUDIO");
}
