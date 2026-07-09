import { describe, it, expect } from "vitest";

import type { TemplateMetadata, TemplateStructure } from "@ugc/shared";

import {
  parseMetadata,
  parseStructure,
  sha256,
  templateTypeFromName,
  validateForLibrary,
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

describe("sha256 — the dedupe key", () => {
  it("is stable for identical bytes and differs for a one-byte change", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    const c = new Uint8Array([1, 2, 3, 5]);
    expect(sha256(a)).toBe(sha256(b));
    expect(sha256(a)).not.toBe(sha256(c));
    expect(sha256(a)).toHaveLength(64);
  });
});

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
      clipSeconds: 12,
      trimComp: false,
      slotCounts: { video, image: 2, text: 1, audio: 0 },
    }) as TemplateMetadata;

  it("accepts exactly one video slot", () => {
    expect(validateForLibrary(structure("main"), meta(1))).toBeNull();
  });

  it("rejects a template with nowhere to put the clip", () => {
    expect(validateForLibrary(structure("main"), meta(0))).toMatch(/no spot for a video/i);
  });

  it("rejects multiple video slots — each would need its own paid clip", () => {
    expect(validateForLibrary(structure("main"), meta(3))).toMatch(/3 video slots/);
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
      clipSeconds: 12,
      trimComp: false,
      slotCounts: { video: 1, image: 2, text: 3, audio: 0 },
    };
    expect(parseMetadata(meta)).toEqual(meta);
  });

  it("rejects metadata whose clipSeconds is outside Seedance's bounds", () => {
    const base = {
      durationSec: 20,
      frameRate: 30,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9" as const,
      trimComp: true,
      slotCounts: { video: 1, image: 0, text: 0, audio: 0 },
    };
    expect(parseMetadata({ ...base, clipSeconds: 20 })).toBeNull();
    expect(parseMetadata({ ...base, clipSeconds: 2 })).toBeNull();
    expect(parseMetadata({ ...base, clipSeconds: 15 })).not.toBeNull();
  });
});
