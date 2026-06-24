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
  it("has exactly 9 kebab-case hook ids", () => {
    const ids = allHookIds();
    expect(ids.length).toBe(9);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("classifies the visual-lead hooks; curiosity-gap is the overlay", () => {
    const leads = allHookIds().filter(
      (id) => hookDefaultRole(id) === "visual_lead",
    );
    expect(leads.sort()).toEqual(
      [
        "before-after",
        "confession",
        "pattern-interrupt",
        "problem-solution",
        "question",
        "relatable-scenario",
        "stat",
        "striking-visual",
      ].sort(),
    );
    expect(hookDefaultRole("curiosity-gap")).toBe("overlay");
  });
});

describe("canonicalizeHookId — placeholder → canonical", () => {
  it("maps the snake_case placeholders", () => {
    expect(canonicalizeHookId("pain_point")).toEqual(["problem-solution"]);
    expect(canonicalizeHookId("transformation")).toEqual(["before-after"]);
    expect(canonicalizeHookId("shock")).toEqual(["striking-visual"]);
  });

  it("folds unboxing_reveal into curiosity-gap", () => {
    expect(canonicalizeHookId("unboxing_reveal")).toEqual(["curiosity-gap"]);
  });

  it("passes a canonical id through unchanged", () => {
    expect(canonicalizeHookId("curiosity-gap")).toEqual(["curiosity-gap"]);
  });

  it("every mapped id is a real catalog hook", () => {
    for (const raw of ["pain_point", "transformation", "unboxing_reveal", "shock"]) {
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
    // confession needs a person; with none it is stripped, leaving problem-solution.
    const sel = resolveHooks(testimonial, ["confession", "problem-solution"], {
      hasProduct: true,
      hasPerson: false,
    });
    expect(sel.visualLead.id).toBe("problem-solution");
  });

  it("cold-open hooks all survive a no-product run (none are product-gated)", () => {
    const def = mkDef(
      ["striking-visual", "curiosity-gap"],
      ["striking-visual", "curiosity-gap"],
    );
    const sel = resolveHooks(def, ["striking-visual", "curiosity-gap"], {
      hasProduct: false,
      hasPerson: true,
    });
    expect(sel.visualLead.id).toBe("striking-visual");
    expect(sel.overlay?.id).toBe("curiosity-gap");
  });

  it("takes the top 2 and assigns exactly one visual-lead + one overlay", () => {
    // before-after is detected but NOT allowed → dropped; the allowed pair resolves.
    const def = mkDef(
      ["problem-solution", "curiosity-gap"],
      ["problem-solution", "curiosity-gap"],
    );
    const sel = resolveHooks(
      def,
      ["problem-solution", "curiosity-gap", "before-after"],
      { hasProduct: true, hasPerson: true },
    );
    expect(sel.visualLead.id).toBe("problem-solution");
    expect(sel.visualLead.role).toBe("visual_lead");
    expect(sel.overlay?.id).toBe("curiosity-gap");
    expect(sel.overlay?.role).toBe("overlay");
  });

  it("never pairs two visual-leads (drops the weaker)", () => {
    const def = mkDef(
      ["striking-visual", "problem-solution"],
      ["striking-visual", "problem-solution"],
    );
    const sel = resolveHooks(def, ["striking-visual", "problem-solution"], {
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
