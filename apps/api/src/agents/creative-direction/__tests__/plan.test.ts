import { describe, it, expect } from "vitest";

import {
  type AssetCtx,
  firstStep,
  gateForNext,
  genStepForRevise,
  hasAnyReference,
  nextStep,
  resumeStepForVideoRegen,
  willGeneratePerson,
  willGenerateProduct,
} from "../plan.js";

// Representative asset contexts.
const testimonial: AssetCtx = { productRequired: false, personRequired: true, hasProductUpload: true, hasPersonUpload: false, characterEnabled: true }; // product uploaded, character on → person synthesized
const brandStoryNoPerson: AssetCtx = { productRequired: false, personRequired: false, hasProductUpload: true, hasPersonUpload: false, characterEnabled: false }; // character off + none → person SKIPPED
const personUploaded: AssetCtx = { productRequired: false, personRequired: false, hasProductUpload: false, hasPersonUpload: true, characterEnabled: false }; // upload alone generates the person
const neither: AssetCtx = { productRequired: false, personRequired: false, hasProductUpload: false, hasPersonUpload: false, characterEnabled: false }; // both skipped

describe("asset-step predicates", () => {
  it("product generates only from an upload", () => {
    expect(willGenerateProduct(testimonial)).toBe(true);
    expect(willGenerateProduct(neither)).toBe(false);
  });

  it("person generates when uploaded OR character toggle on", () => {
    expect(willGeneratePerson(testimonial)).toBe(true); // character on → synthesize
    expect(willGeneratePerson(personUploaded)).toBe(true); // uploaded
    expect(willGeneratePerson(brandStoryNoPerson)).toBe(false); // character off + none → skip
    expect(willGeneratePerson(neither)).toBe(false);
  });

  it("hasAnyReference false only when both skip", () => {
    expect(hasAnyReference(brandStoryNoPerson)).toBe(true); // product exists
    expect(hasAnyReference(neither)).toBe(false);
  });
});

describe("firstStep", () => {
  it("legacy (no asset ctx) → product_sheet", () => {
    expect(firstStep()).toBe("product_sheet");
  });
  it("product present → product_sheet", () => {
    expect(firstStep(testimonial)).toBe("product_sheet");
  });
  it("no product, person present → person_sheet", () => {
    expect(firstStep(personUploaded)).toBe("person_sheet");
  });
  it("neither → storyboard", () => {
    expect(firstStep(neither)).toBe("storyboard");
  });
});

describe("gateForNext collapse", () => {
  it("reference gate fires when a reference exists", () => {
    expect(gateForNext("storyboard")).toBe("reference");
    expect(gateForNext("storyboard", true)).toBe("reference");
  });
  it("reference gate collapses when no reference exists", () => {
    expect(gateForNext("storyboard", false)).toBeNull();
    expect(gateForNext("segment_storyboard", false)).toBeNull();
  });
  it("storyboard gate is unaffected by hasReference", () => {
    expect(gateForNext("video", false)).toBe("storyboard");
    expect(gateForNext("segment_video", false)).toBe("storyboard");
  });
});

describe("genStepForRevise targeting", () => {
  it("storyboard gate → storyboard / segment_storyboard", () => {
    expect(genStepForRevise("storyboard", "person", "15s")).toBe("storyboard");
    expect(genStepForRevise("storyboard", "person", "60s")).toBe("segment_storyboard");
  });
  it("reference gate → person_sheet by default", () => {
    expect(genStepForRevise("reference", "person", "15s")).toBe("person_sheet");
    expect(genStepForRevise("reference", "person", "15s", testimonial)).toBe("person_sheet");
  });
  it("reference gate on a person-skipped run → product_sheet", () => {
    expect(genStepForRevise("reference", "person", "15s", brandStoryNoPerson)).toBe("product_sheet");
  });
});

describe("nextStep unchanged for the post-reference sequence", () => {
  it("person_sheet → storyboard (critic off, 15s)", () => {
    expect(nextStep("person_sheet", false, false, "15s")).toBe("storyboard");
  });
  it("storyboard → video (critic off)", () => {
    expect(nextStep("storyboard", false, false, "15s")).toBe("video");
  });
});

describe("nextStep — template pipeline branching (video → template_fill → template_render)", () => {
  it("15s video: complete for the normal video pipeline (default / explicit)", () => {
    expect(nextStep("video", false, false, "15s")).toBeNull();
    expect(nextStep("video", false, false, "15s", "video")).toBeNull();
  });
  it("15s video: a template-pipeline run continues into template_fill", () => {
    expect(nextStep("video", false, false, "15s", "template")).toBe(
      "template_fill",
    );
  });
  it("template_fill always continues into template_render", () => {
    expect(nextStep("template_fill", false, false, "15s", "template")).toBe(
      "template_render",
    );
  });
  it("template_render is always terminal", () => {
    expect(nextStep("template_render", false, false, "15s", "template")).toBeNull();
  });
  it("multi merge: always complete — the template pipeline is 15s-only in v1", () => {
    expect(nextStep("merge", false, false, "60s")).toBeNull();
    expect(nextStep("merge", false, false, "60s", "video")).toBeNull();
    expect(nextStep("merge", false, false, "60s", "template")).toBeNull();
  });
  it("segment_video still → merge regardless of pipeline", () => {
    expect(nextStep("segment_video", false, false, "60s", "template")).toBe(
      "merge",
    );
    expect(nextStep("segment_video", false, false, "60s", "video")).toBe(
      "merge",
    );
  });
});

describe("resumeStepForVideoRegen — lands directly on the video step", () => {
  it("15s → storyboard_inspection, whose nextStep is video (critic on OR off)", () => {
    expect(resumeStepForVideoRegen("15s")).toBe("storyboard_inspection");
    // storyboard_inspection → video regardless of criticEnabled, so a video
    // regen never re-runs the storyboard/critic or re-pauses at a gate.
    expect(nextStep("storyboard_inspection", false, false, "15s")).toBe("video");
    expect(nextStep("storyboard_inspection", false, true, "15s")).toBe("video");
  });
  it("multi → segment_storyboard, whose nextStep is segment_video → merge", () => {
    expect(resumeStepForVideoRegen("60s")).toBe("segment_storyboard");
    expect(nextStep("segment_storyboard", false, false, "60s")).toBe(
      "segment_video",
    );
    expect(nextStep("segment_video", false, false, "60s")).toBe("merge");
  });
});
