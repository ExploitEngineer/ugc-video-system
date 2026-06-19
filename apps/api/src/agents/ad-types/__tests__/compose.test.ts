import { describe, it, expect } from "vitest";

import type { AdTypeDef } from "../types.js";
import { getAdType } from "../registry.js";
import { allHookIds, hasHook, hookDefaultRole } from "../hooks/registry.js";
import {
  canonicalizeHookId,
  hookOpening,
  resolveHooks,
} from "../hooks/compose.js";

// Minimal def carrying only the fields resolveHooks reads (id/defaultHooks/
// allowedHooks). Casts past the full FragmentSet, which isn't exercised here.
const mkDef = (allowedHooks: string[], defaultHooks: string[]): AdTypeDef =>
  ({ id: "test-type", defaultHooks, allowedHooks }) as unknown as AdTypeDef;

const testimonial = getAdType("testimonial");

describe("hook registry", () => {
  it("has exactly 16 kebab-case hook ids", () => {
    const ids = allHookIds();
    expect(ids.length).toBe(16);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("classifies the 6 visual-lead hooks, the rest overlay", () => {
    const leads = allHookIds().filter(
      (id) => hookDefaultRole(id) === "visual_lead",
    );
    expect(leads.sort()).toEqual(
      [
        "before-after",
        "confession",
        "demonstration",
        "problem-solution",
        "relatable-scenario",
        "testimonial",
      ].sort(),
    );
  });
});

describe("canonicalizeHookId — placeholder → canonical", () => {
  it("maps the snake_case placeholders", () => {
    expect(canonicalizeHookId("pain_point")).toEqual(["problem-solution"]);
    expect(canonicalizeHookId("transformation")).toEqual(["before-after"]);
    expect(canonicalizeHookId("warning")).toEqual(["negativity-bias"]);
    expect(canonicalizeHookId("stat_shock")).toEqual(["stat-shock"]);
  });

  it("folds unboxing_reveal into curiosity-gap + demonstration", () => {
    expect(canonicalizeHookId("unboxing_reveal")).toEqual([
      "curiosity-gap",
      "demonstration",
    ]);
  });

  it("passes a canonical id through unchanged", () => {
    expect(canonicalizeHookId("curiosity-gap")).toEqual(["curiosity-gap"]);
  });

  it("every mapped id is a real catalog hook", () => {
    for (const raw of ["pain_point", "transformation", "warning", "unboxing_reveal"]) {
      for (const id of canonicalizeHookId(raw)) expect(hasHook(id)).toBe(true);
    }
  });
});

describe("resolveHooks", () => {
  it("drops unknown ids and ids outside allowedHooks, dedups", () => {
    const sel = resolveHooks(
      testimonial,
      ["totally-unknown", "problem-solution", "problem-solution"],
      { hasProduct: true, hasPerson: true },
    );
    expect(sel.visualLead.id).toBe("problem-solution");
  });

  it("asset guardrail: strips person-only hooks when no person", () => {
    const sel = resolveHooks(testimonial, ["testimonial", "problem-solution"], {
      hasProduct: true,
      hasPerson: false,
    });
    expect(sel.visualLead.id).toBe("problem-solution"); // testimonial stripped
  });

  it("asset guardrail: strips demonstration when no product", () => {
    const def = mkDef(
      ["demonstration", "curiosity-gap"],
      ["curiosity-gap", "demonstration"],
    );
    const sel = resolveHooks(def, ["demonstration", "curiosity-gap"], {
      hasProduct: false,
      hasPerson: true,
    });
    expect(sel.visualLead.id).toBe("curiosity-gap");
    expect(sel.overlay).toBeNull();
  });

  it("collapses a mutually-exclusive set to the higher scorer", () => {
    const def = mkDef(["problem-solution", "demonstration"], ["demonstration"]);
    const sel = resolveHooks(def, ["problem-solution", "demonstration"], {
      hasProduct: true,
      hasPerson: true,
    });
    // demonstration is the type default → wins the {problem-solution,demonstration} set
    expect(sel.visualLead.id).toBe("demonstration");
  });

  it("takes the top 2 and assigns exactly one visual-lead + one overlay", () => {
    const def = mkDef(
      ["problem-solution", "curiosity-gap", "stat-shock"],
      ["problem-solution", "curiosity-gap"],
    );
    const sel = resolveHooks(
      def,
      ["problem-solution", "curiosity-gap", "stat-shock"],
      { hasProduct: true, hasPerson: true },
    );
    expect(sel.visualLead.id).toBe("problem-solution");
    expect(sel.visualLead.role).toBe("visual_lead");
    expect(sel.overlay?.id).toBe("curiosity-gap");
    expect(sel.overlay?.role).toBe("overlay");
  });

  it("never pairs two visual-leads (drops the weaker)", () => {
    // testimonial + problem-solution are both visual_lead defaults of the type
    const sel = resolveHooks(testimonial, ["testimonial", "problem-solution"], {
      hasProduct: true,
      hasPerson: true,
    });
    expect(sel.visualLead.role).toBe("visual_lead");
    expect(sel.overlay).toBeNull();
  });

  it("falls back to the first asset-compatible default when nothing survives", () => {
    const sel = resolveHooks(testimonial, [], {
      hasProduct: true,
      hasPerson: true,
    });
    expect(testimonial.defaultHooks).toContain(sel.visualLead.id);
    expect(sel.visualLead.role).toBe("visual_lead");
  });
});

describe("hookOpening", () => {
  it("returns RAW string[] splice points (visual-lead line, + overlay line)", () => {
    const sel = resolveHooks(
      mkDef(
        ["problem-solution", "curiosity-gap"],
        ["problem-solution", "curiosity-gap"],
      ),
      ["problem-solution", "curiosity-gap"],
      { hasProduct: true, hasPerson: true },
    );
    const out = hookOpening(sel);
    expect(Array.isArray(out.storyboardScene1)).toBe(true);
    expect(Array.isArray(out.videoFirstSlice)).toBe(true);
    expect(out.storyboardScene1.length).toBe(2); // visual-lead + overlay
    expect(out.storyboardScene1[0]).toContain("visual-lead");
    expect(out.storyboardScene1[1]).toContain("overlay");
  });

  it("emits only the visual-lead line when there is no overlay", () => {
    const sel = resolveHooks(testimonial, ["problem-solution"], {
      hasProduct: true,
      hasPerson: true,
    });
    const out = hookOpening(sel);
    expect(out.videoFirstSlice.length).toBe(1);
  });
});
