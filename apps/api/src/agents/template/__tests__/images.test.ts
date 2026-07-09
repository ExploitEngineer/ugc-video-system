import { describe, it, expect } from "vitest";

import type { TemplatePlan, TemplateSlot } from "@ugc/shared";

import { nextImageSize } from "../../../providers/openai/constants.js";
import { plannedImages } from "../images/index.js";
import { buildTemplateImagePrompt, slotShape } from "../images/prompt.js";

const slot = (o: Partial<TemplateSlot> & Pick<TemplateSlot, "asset" | "jobLayerName">): TemplateSlot =>
  ({
    composition: "main",
    layerName: o.jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    ...o,
  }) as TemplateSlot;

const plan = (slots: TemplatePlan["slots"]): TemplatePlan => ({
  conceptSummary: "A calm morning ritual.",
  slots,
});

// ── nextImageSize ────────────────────────────────────────────────────────────

describe("nextImageSize — the fixed ladder does not cover per-slot sizes", () => {
  it("uses the curated ladder where one exists", () => {
    expect(nextImageSize("3840x2160")).toBe("2560x1440");
    expect(nextImageSize("2560x1440")).toBe("2048x1152");
  });

  it("shrinks an ARBITRARY size that has no ladder entry", () => {
    // The template pipeline sizes each still to its slot, so `1920x1088` and
    // `2000x1128` will never be in the lookup. Before this, a size-attributable
    // failure there just threw instead of stepping down.
    expect(nextImageSize("1920x1088")).toBe("1344x768");
    expect(nextImageSize("2000x1128")).toBe("1408x784");
  });

  it("always returns dimensions divisible by 16", () => {
    for (const s of ["1920x1088", "2000x1128", "3840x2160", "2048x1152"]) {
      const next = nextImageSize(s);
      if (!next) continue;
      const [w, h] = next.split("x").map(Number);
      expect((w as number) % 16, `${s} → ${next}`).toBe(0);
      expect((h as number) % 16, `${s} → ${next}`).toBe(0);
    }
  });

  it("preserves the aspect ratio, because the slot needs it", () => {
    const [w, h] = (nextImageSize("2000x1128") as string).split("x").map(Number);
    expect((w as number) / (h as number)).toBeCloseTo(2000 / 1128, 1);
  });

  it("NEVER steps below the API's minimum pixel budget", () => {
    // Probed live: a request under ~690,000px is a hard 400. Shrinking into that
    // band would burn every remaining attempt on a size the provider always
    // refuses — so the ladder ends and the caller falls back instead.
    for (const s of ["1920x1088", "2000x1128", "1280x720", "1024x1024"]) {
      const next = nextImageSize(s);
      if (!next) continue;
      const [w, h] = next.split("x").map(Number);
      expect((w as number) * (h as number), `${s} → ${next}`).toBeGreaterThanOrEqual(786_432);
    }
  });

  it("is exhausted once a step down would breach the floor", () => {
    expect(nextImageSize("1280x720")).toBeUndefined(); // 70% = 451,584px
    expect(nextImageSize("1024x1024")).toBeUndefined(); // 70% = 512,656px
  });

  it("terminates — a repeated shrink always reaches undefined", () => {
    let size: string | undefined = "3840x2160";
    let hops = 0;
    while (size && hops < 50) {
      size = nextImageSize(size);
      hops++;
    }
    expect(size).toBeUndefined();
    expect(hops).toBeLessThan(50);
  });

  it("returns undefined for a malformed size rather than looping", () => {
    expect(nextImageSize("auto")).toBeUndefined();
    expect(nextImageSize("")).toBeUndefined();
    expect(nextImageSize("1024")).toBeUndefined();
  });
});

// ── plannedImages ────────────────────────────────────────────────────────────

describe("plannedImages — three gates, all must pass", () => {
  const slots = [
    slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
    slot({ asset: "TEXT", jobLayerName: "Headline" }),
    slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" }),
    slot({ asset: "IMAGE", jobLayerName: "logo.png", imageClass: "brand" }),
    slot({ asset: "IMAGE", jobLayerName: "bg.jpg", imageClass: "decorative" }),
  ];

  it("generates a content slot the plan filled and described", () => {
    const out = plannedImages(
      slots,
      plan([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", fill: true, imageSubject: "the mug" }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.imageSubject).toBe("the mug");
    expect(out[0]?.role).toBe("hero");
  });

  it("never generates a brand or decorative slot, even if the plan says to", () => {
    // The heuristic is a hard guard: a plan that somehow named a logo cannot
    // promote it. (planningSlots withholds them, but defence in depth.)
    const out = plannedImages(
      slots,
      plan([
        { jobLayerName: "logo.png", asset: "IMAGE", role: "logo", fill: true, imageSubject: "a logo" },
        { jobLayerName: "bg.jpg", asset: "IMAGE", role: "bg", fill: true, imageSubject: "a texture" },
      ]),
    );
    expect(out).toHaveLength(0);
  });

  it("skips a slot the plan declined to fill", () => {
    const out = plannedImages(
      slots,
      plan([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", fill: false, imageSubject: "the mug" }]),
    );
    expect(out).toHaveLength(0);
  });

  it("skips a slot with no subject — there is nothing to draw", () => {
    const out = plannedImages(
      slots,
      plan([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", fill: true }]),
    );
    expect(out).toHaveLength(0);
  });

  it("generates nothing when there is no plan at all", () => {
    expect(plannedImages(slots, null)).toHaveLength(0);
  });

  it("ignores video and text slots", () => {
    const out = plannedImages(
      slots,
      plan([
        { jobLayerName: "clip.mp4", asset: "VIDEO", role: "clip", fill: true, imageSubject: "x" },
        { jobLayerName: "Headline", asset: "TEXT", role: "head", fill: true, imageSubject: "x" },
      ]),
    );
    expect(out).toHaveLength(0);
  });
});

// ── the prompt ───────────────────────────────────────────────────────────────

describe("slotShape", () => {
  it("classifies by ratio, defaulting to square when unknown", () => {
    expect(slotShape(1920, 1080)).toBe("landscape");
    expect(slotShape(1080, 1920)).toBe("portrait");
    expect(slotShape(800, 800)).toBe("square");
    expect(slotShape(null, null)).toBe("square");
  });
});

describe("buildTemplateImagePrompt", () => {
  const base = { imageSubject: "a sand-coloured ceramic mug", hasProductRef: true };

  it("leads with the planned subject, not the raw user prompt", () => {
    expect(buildTemplateImagePrompt(base)).toContain("SUBJECT: a sand-coloured ceramic mug");
  });

  it("identity-locks the product when a reference sheet is passed", () => {
    const p = buildTemplateImagePrompt(base);
    expect(p).toMatch(/EXACT product/);
    expect(p).toMatch(/do not change its silhouette/i);
  });

  it("describes the product in words ONLY when there is no reference", () => {
    const withRef = buildTemplateImagePrompt({ ...base, productBrief: "a 350ml mug" });
    expect(withRef).not.toContain("The product: a 350ml mug");
    const without = buildTemplateImagePrompt({ ...base, hasProductRef: false, productBrief: "a 350ml mug" });
    expect(without).toContain("The product: a 350ml mug");
  });

  it("frames for the slot's shape", () => {
    expect(buildTemplateImagePrompt({ ...base, width: 1920, height: 1080 })).toMatch(/WIDE frame/);
    expect(buildTemplateImagePrompt({ ...base, width: 1080, height: 1920 })).toMatch(/TALL frame/);
    expect(buildTemplateImagePrompt({ ...base, width: 800, height: 800 })).toMatch(/SQUARE frame/);
  });

  it("bans the burned-in furniture a template must never receive", () => {
    // The still is composited into a designed layout: any text, logo or border
    // the model paints in fights the designer's own.
    const p = buildTemplateImagePrompt(base);
    expect(p).toMatch(/No text, no logos, no watermarks/);
    expect(p).toMatch(/single uninterrupted photograph/);
  });

  it("does NOT summon the over-textured AI look", () => {
    // This pipeline's failure mode is over-texturing, not plastic. Naming the
    // artefact is what conjures it.
    const p = buildTemplateImagePrompt(base).toLowerCase();
    for (const banned of ["visible pores", "maximum detail", "film grain", "hyper-detailed", "8k"]) {
      expect(p, banned).not.toContain(banned);
    }
    expect(p).toContain("85mm");
    expect(p).toContain("neutral white balance");
  });
});
