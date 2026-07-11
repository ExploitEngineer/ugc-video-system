import { describe, it, expect } from "vitest";
import type { Step } from "@ugc/shared";

import {
  type AssetCtx,
  firstStep,
  gateForNext,
  genStepForRevise,
  hasAnyReference,
  nextStep,
  resumeStepForVideoRegen,
  rewindStepForTemplateRegen,
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

// The v2 chain, end to end:
//   template_plan → [product_sheet ∥ person_sheet] → storyboard
//     → template_fill → template_images → video → template_render
describe("nextStep — template pipeline chain", () => {
  it("template_plan hands off to the parallel reference phase", () => {
    // `driveRun` treats a forward `person_sheet` as the product ∥ person phase.
    expect(nextStep("template_plan", false, false, "15s", "template")).toBe(
      "person_sheet",
    );
  });

  it("storyboard → template_fill, so the copy sees the product brief + script", () => {
    expect(nextStep("storyboard", false, false, "15s", "template")).toBe(
      "template_fill",
    );
    // ...and still → video on the normal pipeline.
    expect(nextStep("storyboard", false, false, "15s", "video")).toBe("video");
  });

  it("storyboard_inspection also routes to template_fill on a template run", () => {
    // Template runs force criticEnabled:false so this never fires in practice,
    // but the two flags must stay independent.
    expect(
      nextStep("storyboard_inspection", false, true, "15s", "template"),
    ).toBe("template_fill");
    expect(nextStep("storyboard_inspection", false, true, "15s", "video")).toBe(
      "video",
    );
  });

  it("template_fill → template_images → video (Seedance last, it costs most)", () => {
    expect(nextStep("template_fill", false, false, "15s", "template")).toBe(
      "template_images",
    );
    expect(nextStep("template_images", false, false, "15s", "template")).toBe(
      "video",
    );
  });

  it("video → template_render on a template run, terminal on a normal one", () => {
    expect(nextStep("video", false, false, "15s", "template")).toBe(
      "template_render",
    );
    expect(nextStep("video", false, false, "15s")).toBeNull();
    expect(nextStep("video", false, false, "15s", "video")).toBeNull();
  });

  it("template_render is always terminal", () => {
    expect(
      nextStep("template_render", false, false, "15s", "template"),
    ).toBeNull();
  });
});

// The user swapped the template on a FINISHED ad. The reference sheets, the
// storyboard and the 15s Seedance master are all template-independent and must
// be reused; only the four template-keyed artifacts are re-derived.
//
//   template_plan → template_fill → template_images → template_render
//
describe("nextStep — re-templating a finished ad", () => {
  const retemplate = (step: Parameters<typeof nextStep>[0]) =>
    nextStep(step, false, false, "15s", "template", true);

  it("template_plan goes straight to the copywriter, NOT the reference phase", () => {
    // Re-running the reference phase would re-pay for both 4K sheets, and the
    // storyboard behind it would write a NEW transcript — so the copy would be
    // written against a script the kept master clip never spoke.
    expect(retemplate("template_plan")).toBe("template_fill");
  });

  it("template_images goes straight to the render, skipping `video` outright", () => {
    // The master clip already exists and is template-independent. Skipping the
    // step (rather than relying on its `persistedFinalVideo` guard) keeps a
    // phantom `video` event off the run's timeline.
    expect(retemplate("template_images")).toBe("template_render");
  });

  it("the whole re-template chain is exactly four steps", () => {
    const chain: string[] = [];
    let step: ReturnType<typeof nextStep> = "template_plan";
    while (step) {
      chain.push(step);
      step = retemplate(step);
    }
    expect(chain).toEqual([
      "template_plan",
      "template_fill",
      "template_images",
      "template_render",
    ]);
  });

  it("changes NOTHING when the flag is off", () => {
    expect(nextStep("template_plan", false, false, "15s", "template")).toBe(
      "person_sheet",
    );
    expect(nextStep("template_images", false, false, "15s", "template")).toBe(
      "video",
    );
  });

  it("leaves every non-template pipeline alone", () => {
    // The flag can only be set on a template run, but the graph must not depend
    // on that being true.
    expect(nextStep("template_images", false, false, "15s", "video", true)).toBe(
      "video",
    );
    expect(nextStep("storyboard", false, false, "15s", "video", true)).toBe(
      "video",
    );
  });

  it("still resolves each regenerate-template rewind checkpoint", () => {
    // `rewindStepForTemplateRegen` returns null | "storyboard" | "video". A
    // re-template that FAILS mid-chain has to be recoverable by that route.
    expect(nextStep("storyboard", false, false, "15s", "template", true)).toBe(
      "template_fill",
    );
    expect(nextStep("video", false, false, "15s", "template", true)).toBe(
      "template_render",
    );
  });

  it("multi merge: always complete — the template pipeline is single-clip", () => {
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

  it("the full template chain has no cycles and ends at template_render", () => {
    const seen: Step[] = [];
    let step: Step | null = firstStep(undefined, "template");
    while (step && seen.length < 20) {
      expect(seen).not.toContain(step); // no cycles
      seen.push(step);
      step = nextStep(step, false, false, "15s", "template");
    }
    expect(seen).toEqual([
      "template_plan",
      "person_sheet",
      "storyboard",
      "template_fill",
      "template_images",
      "video",
      "template_render",
    ]);
  });
});

describe("resumeStepForVideoRegen — a template regen must not re-pay for images", () => {
  it("rewinds a template run to template_images, whose next step is video", () => {
    const step = resumeStepForVideoRegen("15s", "template");
    expect(step).toBe("template_images");
    // The whole point: the clip is regenerated, the stills and copy are not.
    expect(nextStep(step, false, false, "15s", "template")).toBe("video");
  });

  it("leaves the normal pipeline untouched", () => {
    expect(resumeStepForVideoRegen("15s")).toBe("storyboard_inspection");
    expect(resumeStepForVideoRegen("15s", "video")).toBe("storyboard_inspection");
    expect(resumeStepForVideoRegen("60s", "video")).toBe("segment_storyboard");
  });
});

describe("rewindStepForTemplateRegen — the checkpoint depends on what failed", () => {
  // A single fixed checkpoint is wrong in BOTH directions: too far back and the
  // run re-pays gpt-image-2 for stills it already has; not far enough and the
  // composite renders with no copy and no images in it.
  it("restarts a failed plan from scratch — nothing downstream ran", () => {
    expect(rewindStepForTemplateRegen("TEMPLATE_PLAN_FAILED")).toBeNull();
  });

  it("re-runs fill → images → video → render after a failed fill", () => {
    const step = rewindStepForTemplateRegen("TEMPLATE_FILL_FAILED");
    expect(step).toBe("storyboard");
    expect(nextStep(step as Step, false, false, "15s", "template")).toBe("template_fill");
  });

  it("re-runs ONLY the render after a failed render — the clip is not re-paid", () => {
    const step = rewindStepForTemplateRegen("TEMPLATE_RENDER_FAILED");
    expect(step).toBe("video");
    expect(nextStep(step as Step, false, false, "15s", "template")).toBe("template_render");
  });

  it("distinguishes 'start over' from 'not a template failure'", () => {
    // `null` means rewind to the beginning; `undefined` means reject the request.
    expect(rewindStepForTemplateRegen("TEMPLATE_PLAN_FAILED")).toBeNull();
    expect(rewindStepForTemplateRegen("VIDEO_GENERATION_FAILED")).toBeUndefined();
    expect(rewindStepForTemplateRegen(null)).toBeUndefined();
    expect(rewindStepForTemplateRegen("INTERNAL")).toBeUndefined();
  });
});

describe("firstStep — pipeline aware", () => {
  it("a template run always opens with template_plan, before any AI spend", () => {
    expect(firstStep(undefined, "template")).toBe("template_plan");
    // ...regardless of what assets were uploaded.
    expect(firstStep(personUploaded, "template")).toBe("template_plan");
    expect(firstStep(neither, "template")).toBe("template_plan");
  });
  it("a normal run is unaffected by the new parameter", () => {
    expect(firstStep(undefined, "video")).toBe("product_sheet");
    expect(firstStep(neither, "video")).toBe("storyboard");
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
