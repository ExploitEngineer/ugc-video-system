// Classify a Nexrender template's raw v3 introspection (compositions + layers)
// into the SLOTS the pipeline fills. Single source of truth, shared by the
// template routes AND the read-only `scripts/inspect-nexrender-layers.ts`
// (which imports these) so the two never drift.
//
// Real v3 fields (lowercase, proven by the script): `layer_type` `text`/`av`/
// `shape`/`null`/`camera`; `source_type` `file`/`comp`/`solid`/null. No value
// field — but a `text` layer's `name` IS its current words, and an `av/file`
// layer's `name` carries the source filename+extension. Footage often sits in
// PLACEHOLDER PRECOMPS (`av/comp` named PH_*/Media_*/…), usually EMPTY: the
// designer expects you to drop your footage into the comp yourself.
//
// Beyond classification this captures what v2 needs and v1 threw away:
//   - the main comp's `duration` + `frame_rate`
//   - each layer's box → the gpt-image-2 size for an image slot, and the
//     icon-vs-backdrop signal behind `imageClass`
//   - each TEXT layer's `charBudget`, so the copywriter has a hard ceiling
//   - each slot's ABSOLUTE window on the main timeline (`timeline.ts`), which is
//     the second of the 15s master it receives
//
// A placeholder precomp is NO LONGER assumed to hold video: `classifyPlaceholderSlot`
// follows it one level in, because assuming VIDEO injected the generated clip
// into every image placeholder in the template.

import type {
  AspectRatio,
  SlotCounts,
  TemplateMetadata,
  TemplateSlot,
  TemplateSlotInstance,
  TemplateStructure,
} from "@ugc/shared";
import type {
  NexComposition,
  NexLayer,
} from "../../providers/template-render.js";
import type { AepLayerIndex } from "./aep.js";
import {
  classifyImageSlot,
  deriveCharBudget,
} from "./geometry.js";
import { resolveWindows } from "./timeline.js";

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

// A layer's timing does NOT live in the opaque `data` bag — that bag is `{}` on
// every layer of every real project we have introspected. It lives in the
// top-level `start_time` / `in_point` / `out_point` fields, which Nexrender does
// not document, and `timeline.ts` resolves through the nesting chain.
//
// Fonts are nowhere at all: no endpoint reports which fonts a template needs.
// We never need them either. Nexrender's font bank auto-resolves by family name
// at submit time, and we never SEND a `font`, so the designer's typography is
// preserved untouched.

/** A finite, strictly-positive number, else null. Guards a duration of 0 or -1. */
export function positiveOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
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

/**
 * Build the editable-slot structure the editor form renders from.
 *
 * `aepLayers` is the uploaded project's own view of its layers (`aep.ts`), and
 * it decides HOW each media layer is addressed. Without it every media asset
 * falls back to the name Nexrender reported, which is the SOURCE's name and
 * fails for any layer the designer never renamed — that is, nearly all of them.
 */
export function buildStructure(
  comps: NexComposition[],
  layers: NexLayer[],
  aepLayers?: AepLayerIndex | null,
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
  // Where each layer sits on the FINAL timeline, resolved through the nesting
  // chain. A placeholder comp's own `duration` is not a slot length: an empty
  // `PH_2` reports 60 seconds while the scene placing it runs for 2.3.
  const windows = mainName ? resolveWindows(mainName, comps, layers) : new Map();
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
  // One VIDEO slot per placeholder COMP (a comp re-used across scenes is a single
  // slot that fills every placement), keyed by the child comp id.
  const videoPlaceholderComps = new Set<string>();
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

  /** When a layer first reaches the screen, on the main comp's clock. */
  const startOf = (l: NexLayer): number | null =>
    windows.get(l.aeid)?.startSec ?? null;

  /**
   * How a render job must address `l`.
   *
   * A layer the designer never renamed stores an empty name; the name Nexrender
   * reports for it belongs to its SOURCE. Aiming a media asset at that name is
   * the failure that shipped a template ad with no video in it. Such a layer is
   * reachable only by its stacking index, which lives in the project file.
   */
  const targetOf = (
    l: NexLayer,
  ): { targetBy: "name" | "index"; layerIndex: number | null } => {
    const aep = aepLayers?.[String(l.aeid)];
    if (!aep) return { targetBy: "name", layerIndex: null };
    if (aep.name) return { targetBy: "name", layerIndex: aep.index };
    return { targetBy: "index", layerIndex: aep.index };
  };

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
    target: NexLayer = box,
  ) =>
    add({
      asset: "IMAGE",
      composition: comp,
      layerName,
      jobLayerName,
      ...targetOf(target),
      injectVia: "asset",
      width: box.width ?? null,
      height: box.height ?? null,
      startSec: startOf(box),
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
      add({
        asset: "TEXT",
        composition: comp,
        layerName: l.name,
        jobLayerName: l.name,
        // A text layer's NAME is its current words — Nexrender exposes no
        // separate value field. See the header note. After Effects stores that
        // name, so a text layer is always addressable by it.
        currentText: l.name,
        targetBy: "name",
        layerIndex: aepLayers?.[String(l.aeid)]?.index ?? null,
        injectVia: comp === mainName ? "asset" : "function",
        width: l.width ?? null,
        height: l.height ?? null,
        startSec: startOf(l),
        // The placeholder the designer typed is the ceiling. The box is not
        // usable: a split-text layer spreads four glyphs across 1040px.
        charBudget: deriveCharBudget(l.name, l.width, l.height),
        durationSec: null, // text has no length
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
          ...targetOf(l),
          injectVia: "asset",
          width: l.width ?? null,
          height: l.height ?? null,
          startSec: startOf(l),
          durationSec: positiveOrNull(windows.get(l.aeid)?.durationSec),
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
      const child = comps.find((c) => String(c.aeid) === String(l.source_comp_id));
      const inner = layersByComp.get(String(l.source_comp_id)) ?? [];

      // Only an `av` layer can hold footage. A comp named `Placeholder _Text`
      // holding a single TEXT layer is a copy placeholder, not a footage one —
      // and injecting media into it makes After Effects call `replaceSource` on a
      // text layer, which dies with "layer does not have a source". The text
      // branch above already gave that layer its own TEXT slot, so leave it be.
      //
      // An EMPTY child comp still counts: the designer expects footage dropped
      // into it, and we target the outer layer.
      const media = inner.filter((x) => {
        const lt = lower(x.layer_type);
        return lt === "av" || lt === "avlayer";
      });
      if (inner.length > 0 && media.length === 0) {
        ignore("placeholder-comp/no-media-layer");
        continue;
      }

      const target =
        media.find(
          (x) =>
            lower(x.source_type) === "file" || lower(x.source_type) === "solid",
        ) ?? media[0];

      const kind = classifyPlaceholderSlot(l, target);

      if (kind === "IMAGE") {
        // Geometry comes from the OUTER placeholder layer: it is the box the
        // designer laid out in the main comp. The inner layer is 0,0-anchored.
        // Classify on BOTH names — `logo_placeholder` wrapping `Solid 1` must
        // still read as brand.
        addImage(
          l,
          target ? childComp : comp,
          target ? target.name : l.name,
          target ? target.name : l.name,
          `${l.name} ${target?.name ?? ""}`,
          {},
          target ?? l,
        );
      } else {
        // A placeholder comp is USUALLY EMPTY: the designer expects you to drop
        // footage into it, so there is no inner layer to replace. Target the
        // outer `av/comp` layer instead, in the comp that places it. Nexrender's
        // own ExtendScript calls `layer.replaceSource(theImport, true)` with no
        // guard on the current source type, so swapping a precomp layer's source
        // for an mp4 is legal After Effects.
        //
        // CRUCIALLY, a placeholder comp is often RE-USED — placed in several
        // scenes, or twice in a split-screen. Each placement is its own layer:
        // targeting only one leaves the rest showing the template's own solid
        // (the blue block). So build ONE slot per placeholder comp (the plan/copy
        // author it once) carrying EVERY placement, and fill them all at render.
        const scid = String(l.source_comp_id);
        if (videoPlaceholderComps.has(scid)) continue;
        videoPlaceholderComps.add(scid);

        const placements = layers.filter(
          (x) =>
            (lower(x.layer_type) === "av" || lower(x.layer_type) === "avlayer") &&
            lower(x.source_type) === "comp" &&
            isPlaceholder(x.name) &&
            String(x.source_comp_id) === scid,
        );
        // When the child comp HAS an inner media layer, replacing it fills every
        // placement at once (they share the comp) — one instance. When the child
        // is EMPTY, each placement must be targeted in its own parent comp.
        const instances: TemplateSlotInstance[] = [];
        const seenInst = new Set<string>();
        for (const p of placements) {
          const inst: TemplateSlotInstance = target
            ? { composition: childComp, jobLayerName: target.name, ...targetOf(target) }
            : { composition: nameOf(p.composition_id), jobLayerName: p.name, ...targetOf(p) };
          const key = `${inst.composition}|${inst.targetBy}|${inst.layerIndex ?? inst.jobLayerName}`;
          if (seenInst.has(key)) continue;
          seenInst.add(key);
          instances.push(inst);
        }
        // Primary placement = the earliest on screen; it drives the slice window.
        const primary =
          placements
            .slice()
            .sort(
              (a, b) =>
                (windows.get(a.aeid)?.startSec ?? Number.POSITIVE_INFINITY) -
                (windows.get(b.aeid)?.startSec ?? Number.POSITIVE_INFINITY),
            )[0] ?? l;
        const window = windows.get(primary.aeid);
        add({
          asset: "VIDEO",
          composition: target ? childComp : nameOf(primary.composition_id),
          layerName: target ? target.name : primary.name,
          jobLayerName: target ? target.name : primary.name,
          ...targetOf(target ?? primary),
          injectVia: "asset",
          // The ORIGINAL SOURCE's size, which for a placeholder is its child
          // composition. `replaceSource` keeps the layer's authored transform, so
          // footage of exactly this size lands exactly where the designer put it —
          // and an index-targeted layer cannot be autoscaled after the fact.
          width: child?.width ?? l.width ?? null,
          height: child?.height ?? l.height ?? null,
          startSec: window?.startSec ?? null,
          // How long the slot is ON SCREEN, resolved through the nesting chain —
          // NOT the placeholder comp's own `duration`, which is routinely 60s for
          // a scene that runs for two.
          durationSec: positiveOrNull(window?.durationSec),
          // Only when the placeholder truly has multiple distinct placements.
          ...(instances.length > 1 ? { instances } : {}),
        });
      }
      continue;
    }

    // Everything else — structure/control.
    const k = t === "av" && s === "comp" ? "nested-comp" : t === "av" ? `av/${s}` : t || "?";
    ignore(k);
  }

  // A slot the main composition never places is not a slot. `resolveWindows`
  // reaches a layer if and only if the render actually does, so "no window" IS
  // "never renders" — and an orphan is not a harmless extra row:
  //
  //   - the plan LLM writes copy and image subjects for it
  //   - the Image Agent pays gpt-image-2 for a still nothing will ever show
  //   - ONE windowless slot flips `planClipSlices` onto its even-split fallback
  //     for EVERY slot (`slices.ts`), throwing away the real timing we resolved
  //     for the slots that do render
  //   - it hides whether the project marks anything as replaceable at all
  //     (`validateForLibrary`)
  //
  // They are common: a finished ad built from a template pack keeps the pack's
  // demo comps (`PUT YOUR IMAGE TEXT 1`, `PUT YOUR VIDEO`) lying beside the real
  // work, unplaced and invisible.
  //
  // Guarded on a non-empty resolution. An empty `windows` means the resolver
  // found no main composition and placed NOTHING; dropping every slot on the back
  // of our own failure is the destructive move this file avoids everywhere else.
  // Counted in `ignored` so the admin console still shows they were seen.
  const rendered =
    windows.size > 0
      ? slots.filter((slot) => {
          if (slot.startSec != null) return true;
          ignore("unreachable");
          return false;
        })
      : slots;

  // Group by kind (the editable order), then by WHEN each slot appears. Time
  // order is what the slice planner and the copywriter both read: slice 2 must
  // come from later in the master than slice 1, and the second line of copy must
  // follow the first. Layer-list order is not time order, so sorting on it — as
  // this used to — was luck.
  const order = ["VIDEO", "IMAGE", "AUDIO", "TEXT"];
  rendered.sort(
    (a, b) =>
      order.indexOf(a.asset) - order.indexOf(b.asset) ||
      (a.startSec ?? Number.POSITIVE_INFINITY) -
        (b.startSec ?? Number.POSITIVE_INFINITY),
  );

  return {
    status: "ready",
    mainComposition: mainName,
    renderCompositions: renderCompositions.length ? renderCompositions : comps.map((c) => c.name),
    slots: rendered,
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

/**
 * The VIDEO slots, in the order they appear on screen.
 *
 * Every emitted VIDEO slot is fillable: an empty placeholder comp is targeted
 * through its outer layer, so there is no longer such a thing as a slot with
 * nothing to inject into.
 */
export function fillableVideoSlots(slots: TemplateSlot[]): TemplateSlot[] {
  return slots.filter((s) => s.asset === "VIDEO");
}

/** The template's own audio layer, if it has one. */
export function audioSlot(slots: TemplateSlot[]): TemplateSlot | undefined {
  return slots.find((s) => s.asset === "AUDIO");
}
