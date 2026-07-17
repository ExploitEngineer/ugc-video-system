import { describe, it, expect } from "vitest";

import type { TemplateMetadata, TemplateSlot, TemplateStructure } from "@ugc/shared";

import {
  parseMetadata,
  parseStructure,
  templateTypeFromName,
  validateReplaceableFootage,
  validateForLibrary,
  validateMeasuredDuration,
  withMeasuredDuration,
  MAX_VIDEO_SLOTS,
} from "../library.js";

describe("templateTypeFromName", () => {
  it("accepts the two project types our render path can fill", () => {
    expect(templateTypeFromName("promo.aep")).toBe("aep");
    expect(templateTypeFromName("PROMO.AEP")).toBe("aep");
    expect(templateTypeFromName("collected.zip")).toBe("zip");
  });

  it("REJECTS .mogrt", () => {
    // Our render job injects by layerName + nx:text-params-set, which is the
    // .aep composition model. A Motion Graphics Template exposes Essential
    // Graphics properties instead, filled with Nexrender's `essential` asset
    // type — so a .mogrt would register, introspect thinly, and render with
    // NONE of our content in it. Better a clear rejection than an empty video.
    expect(templateTypeFromName("lower-third.mogrt")).toBeNull();
  });

  it("rejects anything else", () => {
    expect(templateTypeFromName("clip.mp4")).toBeNull();
    expect(templateTypeFromName("project.aep.bak")).toBeNull();
    expect(templateTypeFromName("noextension")).toBeNull();
  });
});

// The dedupe key (sha256) is now computed by `spoolToTempFile` as the upload
// streams past, so it is covered by `lib/__tests__/upload-spool.test.ts`.

describe("validateForLibrary — which templates the pipeline can actually fill", () => {
  const slot = (over: Partial<TemplateSlot> = {}): TemplateSlot =>
    ({
      asset: "VIDEO",
      composition: "main",
      layerName: "PH_1",
      jobLayerName: "PH_1",
      targetBy: "index",
      layerIndex: 1,
      injectVia: "asset",
      width: 1920,
      height: 1080,
      startSec: 0,
      durationSec: 5,
      ...over,
    }) as TemplateSlot;

  const structure = (
    mainComposition: string | null,
    slots: TemplateSlot[] = [slot()],
  ): TemplateStructure =>
    ({
      status: "ready",
      mainComposition,
      renderCompositions: [],
      slots,
      mainCompositionWidth: 1920,
      mainCompositionHeight: 1080,
      mainCompositionDurationSec: 12,
      mainCompositionFrameRate: 30,
      suggestedAspectRatio: "16:9",
    }) as TemplateStructure;

  const meta = (video: number): TemplateMetadata =>
    ({
      durationSec: 12,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      slotCounts: { video, image: 2, text: 1, audio: 0 },
    }) as TemplateMetadata;

  it("accepts one video slot", () => {
    expect(validateForLibrary(structure("main"), meta(1))).toBeNull();
  });

  it("accepts SEVERAL video slots — one master is sliced across them", () => {
    // A 7s/2s/2s template costs exactly what a single-slot one costs: one 15s
    // Seedance clip, cut into pieces. There is nothing to reject.
    expect(validateForLibrary(structure("main"), meta(3))).toBeNull();
    expect(validateForLibrary(structure("main"), meta(MAX_VIDEO_SLOTS))).toBeNull();
  });

  it("rejects a template with nowhere to put the clip", () => {
    expect(validateForLibrary(structure("main"), meta(0))?.reason).toMatch(
      /no spot for a video/i,
    );
  });

  it("rejects an absurd number of video slots", () => {
    // Not a cost limit — the slices would simply be too short to read.
    expect(validateForLibrary(structure("main"), meta(MAX_VIDEO_SLOTS + 1))?.reason).toMatch(
      new RegExp(`at most ${MAX_VIDEO_SLOTS}`),
    );
  });

  it("rejects a template with no renderable composition", () => {
    expect(validateForLibrary(structure(null), meta(1))?.reason).toMatch(/which composition/i);
  });

  it("does NOT judge length on the composition's own duration", () => {
    // `comp.duration` is arbitrary — After Effects renders the WORK AREA, and one
    // real template's Main_Comp reports 30.97s while rendering 21.0s. Judging an
    // upload on it was actively harmful: a rejection DISCARDS the uploaded bytes,
    // so a comp that under-reports lost the file over a number that was never
    // true. The real gate is `validateMeasuredDuration`, at preview time.
    const short = { ...meta(1), durationSec: 3 };
    expect(validateForLibrary(structure("main"), short as TemplateMetadata)).toBeNull();
  });

  it("still fuses a comp declaring an absurd length", () => {
    // Purely a cost fuse — we are about to pay to render a preview of it. One real
    // project file contains a comp claiming 3600s.
    const absurd = { ...meta(1), durationSec: 3600 };
    expect(validateForLibrary(structure("main"), absurd as TemplateMetadata)?.reason).toMatch(
      /far past any ad length/i,
    );
  });

  it("NEVER discards the upload on a verdict our own classifier reached", () => {
    // Every rule here reads `buildStructure`'s output, and a classifier is a thing
    // we change. Discarding on one means a regression destroys an upload that a
    // free re-introspect would have rescued. Only an unparseable project loses its
    // bytes, and that verdict is Nexrender's, not ours.
    for (const r of [
      validateForLibrary(structure("main"), meta(0)),
      validateForLibrary(structure("main"), meta(MAX_VIDEO_SLOTS + 1)),
      validateForLibrary(structure(null), meta(1)),
      validateForLibrary(structure("main"), { ...meta(1), durationSec: 3600 } as TemplateMetadata),
      validateForLibrary(structure("main"), meta(0)),
    ]) {
      expect(r?.discard).toBe(false);
    }
  });
});

describe("validateReplaceableFootage — a finished ad is not a template", () => {
  const media = (n: number): TemplateSlot[] =>
    Array.from(
      { length: n },
      (_, i) =>
        ({
          asset: "VIDEO",
          composition: "Main_Comp",
          layerName: `s${i}`,
          jobLayerName: `s${i}.mp4`,
          targetBy: "index",
          layerIndex: i + 1,
          injectVia: "asset",
          startSec: i,
          durationSec: 2,
        }) as TemplateSlot,
    );

  const structure = (slots: TemplateSlot[], noExt?: number): TemplateStructure =>
    ({
      status: "ready",
      mainComposition: "Main_Comp",
      renderCompositions: [],
      slots,
      mainCompositionWidth: 1920,
      mainCompositionHeight: 1080,
      mainCompositionDurationSec: 21,
      mainCompositionFrameRate: 30,
      suggestedAspectRatio: "16:9",
      ...(noExt == null ? {} : { ignored: { "av/file(no-ext)": noExt, "nested-comp": 54, shape: 99 } }),
    }) as TemplateStructure;

  it("rejects the real finished ad: 35 untouchable layers against 12 fillable", () => {
    // Verbatim counts from the IDFC FIRST Bank ad in the library. Its footage sits
    // in layers the designer renamed, so the extension is gone and nothing can
    // address them — they render the bank's own ad no matter what we inject.
    const r = validateReplaceableFootage(structure(media(12), 35));
    expect(r?.reason).toMatch(/cannot replace/i);
    expect(r?.reason).toMatch(/after-effects-template-spec/i);
    // A false reject costs a re-read; a false discard costs the upload.
    expect(r?.discard).toBe(false);
  });

  it("accepts every real template in the library — all have ZERO untouchable media", () => {
    // The measured counts. `wedding` is the one that matters: its only slot is
    // `mixkit-bride-...-18206.mp4`, demo footage under its own filename — which no
    // naming rule could tell from a finished ad's baked footage, and which works
    // perfectly because we can address it.
    for (const [name, slots] of [
      ["wedding", 1],
      ["water-template", 3],
      ["mixkit-split-text-intro-617", 4],
      ["Openers_source_1022801", 7],
      ["free-modern-fast-promo-template", 9],
      ["mixkit-fade-slideshow-593", 60],
    ] as const) {
      expect(validateReplaceableFootage(structure(media(slots), 0)), name).toBeNull();
    }
  });

  it("tolerates a renamed layer or two — it is a MAJORITY test, not a purity test", () => {
    // One renamed decorative layer in an otherwise fillable project is not a
    // frankenstein; the ad still reads as ours.
    expect(validateReplaceableFootage(structure(media(9), 2))).toBeNull();
    expect(validateReplaceableFootage(structure(media(9), 9))).toBeNull();
    expect(validateReplaceableFootage(structure(media(9), 10))).not.toBeNull();
  });

  it("does not judge a project with no slots, or one that reported no counts", () => {
    expect(validateReplaceableFootage(structure([], 35))).toBeNull();
    expect(validateReplaceableFootage(structure(media(3)))).toBeNull();
  });
});

describe("validateMeasuredDuration — the real 8-60s gate", () => {
  it("accepts an in-band measured length", () => {
    expect(validateMeasuredDuration(8)).toBeNull();
    expect(validateMeasuredDuration(21)).toBeNull();
    expect(validateMeasuredDuration(60)).toBeNull();
  });

  it("rejects outside the band, quoting what it RENDERS", () => {
    expect(validateMeasuredDuration(7.9)).toMatch(/renders 7.9s.*at least 8s/i);
    expect(validateMeasuredDuration(60.1)).toMatch(/renders 60.1s.*at most 60s/i);
  });
});

describe("withMeasuredDuration — a re-introspection must not revert a measurement", () => {
  const measured = (sec: number): TemplateMetadata =>
    ({
      durationSec: sec,
      measuredDurationSec: sec,
      durationSource: "measured",
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      slotCounts: { video: 1, image: 0, text: 0, audio: 0 },
    }) as TemplateMetadata;

  const fresh = (sec: number): TemplateMetadata =>
    ({
      durationSec: sec,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      slotCounts: { video: 1, image: 0, text: 0, audio: 0 },
    }) as TemplateMetadata;

  it("keeps the measured length when the comp is re-read", () => {
    // `buildMetadata` re-derives durationSec from the composition, so without this
    // one click of /reintrospect silently reverts a measured 21.0 to the comp's
    // 30.97 and the next run quietly over-generates again. Nothing about the
    // project file changed, so the measurement is still true.
    const out = withMeasuredDuration(fresh(30.97), measured(21));
    expect(out.durationSec).toBe(21);
    expect(out.durationSource).toBe("measured");
  });

  it("is a no-op when there is no prior measurement", () => {
    expect(withMeasuredDuration(fresh(30.97), null).durationSec).toBe(30.97);
    expect(withMeasuredDuration(fresh(30.97), fresh(12)).durationSec).toBe(30.97);
  });
});

describe("parseStructure / parseMetadata — jsonb columns are untyped", () => {
  it("returns null rather than throwing on garbage", () => {
    expect(parseStructure(null)).toBeNull();
    expect(parseStructure({ nonsense: true })).toBeNull();
    expect(parseMetadata(undefined)).toBeNull();
    expect(parseMetadata("a string")).toBeNull();
  });

  it("round-trips a valid metadata object", () => {
    const meta = {
      durationSec: 12,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9" as const,
      slotCounts: { video: 1, image: 2, text: 3, audio: 0 },
    };
    expect(parseMetadata(meta)).toEqual(meta);
  });

  it("keeps a composition longer than the 15s master", () => {
    // Nothing is capped. The composition renders in full; the master is sliced
    // across its video slots.
    const m = parseMetadata({
      durationSec: 40,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9" as const,
      slotCounts: { video: 3, image: 0, text: 0, audio: 1 },
    });
    expect(m?.durationSec).toBe(40);
  });

  it("ignores the retired clipSeconds/trimComp keys on an old row", () => {
    // Templates introspected before the slicing change still carry them.
    const m = parseMetadata({
      durationSec: 12,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9" as const,
      clipSeconds: 12,
      trimComp: false,
      slotCounts: { video: 1, image: 0, text: 0, audio: 0 },
    });
    expect(m).not.toBeNull();
    expect(m).not.toHaveProperty("clipSeconds");
  });
});
