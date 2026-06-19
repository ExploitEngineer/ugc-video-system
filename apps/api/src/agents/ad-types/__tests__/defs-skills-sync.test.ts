// Structural guard so the executable defs and the authoring skill docs never
// drift. Asserts:
//   1. exact 1:1 set correspondence between defs/<id>.ts and
//      .claude/skills/ad-type-<id>/  (no orphan on either side)
//   2. each SKILL.md frontmatter `name` equals `ad-type-<id>`
//   3. each def file references its skill in a header comment (cross-link)
//   4. each registered def implements every FragmentSet seam (returns string[])
//   5. each registry id has a def file (registry ⇄ filesystem)

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { REGISTRY } from "../registry.js";
import { type AdTypeDef, type FragmentCtx, FRAGMENT_SEAMS } from "../types.js";

const HERE = import.meta.dirname;
const DEFS_DIR = path.resolve(HERE, "../defs");
// __tests__ → ad-types → agents → src → api → apps → repo root.
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const SKILLS_DIR = path.resolve(REPO_ROOT, ".claude/skills");

const NON_DEF_FILES = new Set(["index.ts"]); // defs/ holds only <id>.ts files

function defIds(): string[] {
  return fs
    .readdirSync(DEFS_DIR)
    .filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !NON_DEF_FILES.has(f),
    )
    .map((f) => f.replace(/\.ts$/, ""));
}

function skillIds(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("ad-type-"))
    .map((d) => d.name.replace(/^ad-type-/, ""));
}

function frontmatterName(skillId: string): string | null {
  const p = path.join(SKILLS_DIR, `ad-type-${skillId}`, "SKILL.md");
  if (!fs.existsSync(p)) return null;
  const src = fs.readFileSync(p, "utf8");
  const m = src.match(/^---\s*[\r\n]([\s\S]*?)[\r\n]---/);
  if (!m) return null;
  const nameLine = m[1].split(/\r?\n/).find((l) => /^\s*name\s*:/.test(l));
  return nameLine
    ? nameLine
        .split(":")[1]
        .trim()
        .replace(/^["']|["']$/g, "")
    : null;
}

describe("ad-types defs ⇄ skills are in sync", () => {
  it("has matching id sets on both sides (1:1, no orphans)", () => {
    const defs = new Set(defIds());
    const skills = new Set(skillIds());
    const defsOnly = [...defs].filter((id) => !skills.has(id));
    const skillsOnly = [...skills].filter((id) => !defs.has(id));
    expect({ defsOnly, skillsOnly }).toEqual({ defsOnly: [], skillsOnly: [] });
  });

  it("every SKILL.md frontmatter name === ad-type-<id>", () => {
    for (const id of skillIds()) {
      expect(frontmatterName(id)).toBe(`ad-type-${id}`);
    }
  });

  it("every def file cross-links its skill in a header comment", () => {
    for (const id of defIds()) {
      const src = fs.readFileSync(path.join(DEFS_DIR, `${id}.ts`), "utf8");
      expect(src).toContain(`.claude/skills/ad-type-${id}/SKILL.md`);
    }
  });

  it("every registered def implements all fragment seams (returns string[])", () => {
    const ctx = stubCtx();
    for (const def of Object.values(REGISTRY) as AdTypeDef[]) {
      for (const seam of FRAGMENT_SEAMS) {
        const fn = def.fragments[seam];
        expect(typeof fn, `${def.id}.fragments.${seam}`).toBe("function");
        const out = (fn as (c: FragmentCtx) => unknown)(ctx);
        expect(
          Array.isArray(out),
          `${def.id}.fragments.${seam} must return string[]`,
        ).toBe(true);
      }
    }
  });

  it("every def id present in REGISTRY has a def file (registry ⇄ filesystem)", () => {
    const files = new Set(defIds());
    for (const id of Object.keys(REGISTRY)) {
      expect(files.has(id), `missing defs/${id}.ts for registered type`).toBe(
        true,
      );
    }
  });
});

function stubCtx(): FragmentCtx {
  return {
    adStyle: "test",
    productBrief: null,
    personBrief: null,
    hasProduct: true,
    hasPerson: true,
    hooks: {
      visualLead: {
        id: "problem-solution",
        role: "visual_lead",
        openingDirective: "x",
      },
      overlay: null,
    },
    duration: 15,
    segmentIndex: null,
    segmentCount: 1,
  };
}
