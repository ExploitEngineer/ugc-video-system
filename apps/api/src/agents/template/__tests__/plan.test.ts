import { describe, it, expect } from "vitest";

import type { TemplatePlan, TemplateSlot } from "@ugc/shared";

import { fitToBudget } from "../fill-text/index.js";
import { planningSlots, reconcilePlan } from "../plan/index.js";
import { buildTemplateBlueprintPrompt } from "../plan/prompt.js";

const slot = (o: Partial<TemplateSlot> & Pick<TemplateSlot, "asset" | "jobLayerName">): TemplateSlot =>
  ({
    composition: "main",
    layerName: o.jobLayerName,
    injectVia: "asset",
    width: null,
    height: null,
    ...o,
  }) as TemplateSlot;

// ── planningSlots ────────────────────────────────────────────────────────────

describe("planningSlots — what the model is even allowed to see", () => {
  const slots = [
    slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
    slot({ asset: "TEXT", jobLayerName: "Headline", currentText: "Your Headline" }),
    slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" }),
    slot({ asset: "IMAGE", jobLayerName: "logo.png", imageClass: "brand" }),
    slot({ asset: "IMAGE", jobLayerName: "bg.jpg", imageClass: "decorative" }),
    slot({ asset: "AUDIO", jobLayerName: "music.mp3" }),
  ];

  it("withholds brand and decorative image slots entirely", () => {
    // A generated photo in a logo layer is wrong every time, so the model never
    // gets the chance to argue for it.
    const names = planningSlots(slots).map((s) => s.jobLayerName);
    expect(names).not.toContain("logo.png");
    expect(names).not.toContain("bg.jpg");
  });

  it("withholds audio — the template keeps its own track in v1", () => {
    expect(planningSlots(slots).map((s) => s.jobLayerName)).not.toContain("music.mp3");
  });

  it("keeps the video, the text and the content image", () => {
    expect(planningSlots(slots).map((s) => s.jobLayerName)).toEqual([
      "clip.mp4",
      "Headline",
      "hero.jpg",
    ]);
  });

  it("keeps EVERY video slot, so the plan can beat them out", () => {
    // The old behavior showed only the first video slot; steering the master
    // needs a scene per slot.
    const multi = [
      slot({ asset: "VIDEO", jobLayerName: "PH_1" }),
      slot({ asset: "VIDEO", jobLayerName: "PH_2" }),
      slot({ asset: "VIDEO", jobLayerName: "PH_3" }),
    ];
    expect(planningSlots(multi).map((s) => s.jobLayerName)).toEqual([
      "PH_1",
      "PH_2",
      "PH_3",
    ]);
  });
});

// ── reconcilePlan ────────────────────────────────────────────────────────────

describe("reconcilePlan — our slots are the truth, the model is a suggestion", () => {
  const slots = [
    slot({ asset: "VIDEO", jobLayerName: "clip.mp4" }),
    slot({ asset: "TEXT", jobLayerName: "Headline" }),
    slot({ asset: "IMAGE", jobLayerName: "hero.jpg", imageClass: "content" }),
  ];

  const reply = (slotsOut: TemplatePlan["slots"]): TemplatePlan => ({
    conceptSummary: "A calm ceramic mug on a morning counter.",
    slots: slotsOut,
  });

  it("ignores the model's order and matches by jobLayerName", () => {
    const out = reconcilePlan(
      slots,
      reply([
        { jobLayerName: "hero.jpg", asset: "IMAGE", role: "the hero still", fill: true, imageSubject: "the mug, steaming" },
        { jobLayerName: "clip.mp4", asset: "VIDEO", role: "the ad clip", videoScene: "hands lift the mug" },
        { jobLayerName: "Headline", asset: "TEXT", role: "the headline", copyIntent: "name the calm" },
      ]),
    );
    expect(out.map((s) => s.jobLayerName)).toEqual(["clip.mp4", "Headline", "hero.jpg"]);
    expect(out[0]?.videoScene).toBe("hands lift the mug");
    expect(out[2]?.imageSubject).toBe("the mug, steaming");
  });

  it("drops slots the model invented", () => {
    const out = reconcilePlan(
      slots,
      reply([
        { jobLayerName: "clip.mp4", asset: "VIDEO", role: "clip" },
        { jobLayerName: "NOT_A_REAL_SLOT", asset: "TEXT", role: "???", copyIntent: "x" },
      ]),
    );
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.jobLayerName)).not.toContain("NOT_A_REAL_SLOT");
  });

  it("still emits a row for a slot the model skipped", () => {
    const out = reconcilePlan(slots, reply([]));
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ jobLayerName: "Headline", asset: "TEXT", role: "" });
  });

  it("refuses to fill an image the model would not describe", () => {
    // "Fill this, but I won't say with what" is not a plan. The template's own
    // artwork is the safer fallback.
    const out = reconcilePlan(
      slots,
      reply([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", fill: true }]),
    );
    expect(out[2]?.fill).toBe(false);
    expect(out[2]?.imageSubject).toBeUndefined();
  });

  it("treats a described image with no explicit `fill` as a yes", () => {
    const out = reconcilePlan(
      slots,
      reply([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", imageSubject: "the mug" }]),
    );
    expect(out[2]?.fill).toBe(true);
  });

  it("lets an explicit `fill: false` veto a described image", () => {
    const out = reconcilePlan(
      slots,
      reply([{ jobLayerName: "hero.jpg", asset: "IMAGE", role: "hero", fill: false, imageSubject: "the mug" }]),
    );
    expect(out[2]?.fill).toBe(false);
    expect(out[2]?.imageSubject).toBeUndefined();
  });

  it("keeps a videoScene for EVERY video slot", () => {
    // Steering the master needs one beat per slot; reconcile must not collapse
    // them to the first.
    const videoSlots = [
      slot({ asset: "VIDEO", jobLayerName: "PH_1" }),
      slot({ asset: "VIDEO", jobLayerName: "PH_2" }),
    ];
    const out = reconcilePlan(
      videoSlots,
      reply([
        { jobLayerName: "PH_1", asset: "VIDEO", role: "opener", videoScene: "the mug fills with coffee" },
        { jobLayerName: "PH_2", asset: "VIDEO", role: "payoff", videoScene: "hands raise the mug to a smile" },
      ]),
    );
    expect(out.map((s) => s.videoScene)).toEqual([
      "the mug fills with coffee",
      "hands raise the mug to a smile",
    ]);
  });
});

// ── the prompt ───────────────────────────────────────────────────────────────

describe("buildTemplateBlueprintPrompt", () => {
  const base = {
    userPrompt: "A calm promo for a ceramic mug",
    clipSeconds: 12,
    aspectRatio: "16:9",
    hasPoster: false,
    frameTimestampsSec: [] as number[],
  };

  it("states the character ceiling for every text slot", () => {
    const { user } = buildTemplateBlueprintPrompt({
      ...base,
      slots: [{ jobLayerName: "Headline", asset: "TEXT", currentText: "Your Headline", charBudget: 18 }],
    });
    expect(user).toContain("MAX 18 characters");
    expect(user).toContain('placeholder: "Your Headline"');
  });

  it("passes the template's real clip length, not a hardcoded 15s", () => {
    const { system, user } = buildTemplateBlueprintPrompt({ ...base, slots: [{ jobLayerName: "clip", asset: "VIDEO" }] });
    expect(system).toContain("~12s take");
    expect(system).not.toContain("~15s");
    expect(user).toContain("clip length 12s");
  });

  it("never mentions an ad type — the template dictates the look", () => {
    const { system, user } = buildTemplateBlueprintPrompt({ ...base, slots: [{ jobLayerName: "clip", asset: "VIDEO" }] });
    expect(`${system}\n${user}`.toLowerCase()).not.toContain("ad type");
  });

  it("asks for a visualStyle look bible and an on-screen-text decision", () => {
    const { system } = buildTemplateBlueprintPrompt({
      ...base,
      slots: [{ jobLayerName: "Headline", asset: "TEXT", currentText: "Hi", charBudget: 10 }],
    });
    expect(system).toContain('"visualStyle"');
    expect(system).toContain('"onScreenText"');
    // A template WITH text slots defaults to the template owning on-screen text.
    expect(system).toContain('"owner": "template"');
  });

  it("numbers a frame legend for the poster + sampled frames", () => {
    const { user } = buildTemplateBlueprintPrompt({
      ...base,
      hasPoster: true,
      frameTimestampsSec: [0, 4],
      slots: [{ jobLayerName: "clip", asset: "VIDEO" }],
    });
    expect(user).toContain("FRAME LEGEND");
    expect(user).toContain("Frame 1 = the preview POSTER");
    expect(user).toContain("Frame 2 = the template at 0:00");
    expect(user).toContain("Frame 3 = the template at 0:04");
  });

  it("shows each video slot's window and asks for one continuous take", () => {
    const { system, user } = buildTemplateBlueprintPrompt({
      ...base,
      slots: [
        { jobLayerName: "PH_1", asset: "VIDEO", startSec: 0, durationSec: 2 },
        { jobLayerName: "PH_2", asset: "VIDEO", startSec: 2, durationSec: 3.3 },
      ],
    });
    expect(user).toContain("plays 0:00–0:02");
    expect(user).toContain("plays 0:02–0:05 (3.3s)");
    expect(system).toMatch(/ONE continuous/i);
    expect(system).toMatch(/EACH video slot/i);
  });

  it("omits the image rules entirely when there are no image slots", () => {
    const { system } = buildTemplateBlueprintPrompt({ ...base, slots: [{ jobLayerName: "clip", asset: "VIDEO" }] });
    expect(system).not.toContain("imageSubject");
  });

  it("tells the model to prefer NOT filling an image when unsure", () => {
    const { system } = buildTemplateBlueprintPrompt({
      ...base,
      slots: [{ jobLayerName: "hero", asset: "IMAGE", width: 800, height: 800 }],
    });
    expect(system).toMatch(/prefer false/i);
  });

  it("gives the model each media slot's pixel box", () => {
    const { user } = buildTemplateBlueprintPrompt({
      ...base,
      slots: [{ jobLayerName: "hero", asset: "IMAGE", width: 800, height: 600 }],
    });
    expect(user).toContain("800x600px");
  });
});

// ── fitToBudget ──────────────────────────────────────────────────────────────

describe("fitToBudget — the ceiling is enforced, not requested", () => {
  it("passes a line that fits", () => {
    expect(fitToBudget("Brew calm", 18, "Your Headline")).toBe("Brew calm");
  });

  it("falls back to the placeholder rather than leaving a slot blank", () => {
    expect(fitToBudget("", 18, "Your Headline")).toBe("Your Headline");
    expect(fitToBudget("   ", 18, "Your Headline")).toBe("Your Headline");
  });

  it("trims an overlong line at a word boundary", () => {
    // A model that ignores the ceiling must not be able to break the layout.
    expect(fitToBudget("Brew calm every single morning", 18, "x")).toBe("Brew calm every");
  });

  it("hard-cuts when the first word alone overruns the box", () => {
    // A clipped word still beats a clipped layout.
    expect(fitToBudget("Supercalifragilistic", 10, "x")).toBe("Supercalif");
  });

  it("never returns more characters than the budget", () => {
    const lines = ["Brew calm every single morning", "Supercalifragilistic", "a b c d e f g h i j k"];
    for (const budget of [4, 8, 10, 18, 30]) {
      for (const line of lines) {
        expect(fitToBudget(line, budget, "x").length, `${line} @ ${budget}`).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("leaves the line alone when there is no budget", () => {
    const long = "a".repeat(500);
    expect(fitToBudget(long, undefined, "x")).toBe(long);
  });
});
