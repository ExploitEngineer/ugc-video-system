import { describe, it, expect } from "vitest";

import type { TemplateMetadata, TemplateStructure } from "@ugc/shared";

import {
  parseMetadata,
  parseStructure,
  templateTypeFromName,
  validateForLibrary,
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
  const structure = (mainComposition: string | null): TemplateStructure =>
    ({
      status: "ready",
      mainComposition,
      renderCompositions: [],
      slots: [],
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
    expect(validateForLibrary(structure("main"), meta(0))).toMatch(/no spot for a video/i);
  });

  it("rejects an absurd number of video slots", () => {
    // Not a cost limit — the slices would simply be too short to read.
    expect(validateForLibrary(structure("main"), meta(MAX_VIDEO_SLOTS + 1))).toMatch(
      new RegExp(`at most ${MAX_VIDEO_SLOTS}`),
    );
  });

  it("rejects a template with no renderable composition", () => {
    expect(validateForLibrary(structure(null), meta(1))).toMatch(/which composition/i);
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
