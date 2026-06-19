// Runtime ad-type skill loader (the ai-ad-gen `skills.ts` pattern, per-seam).
//
// Each ad type's prompt-fragment prose is the SINGLE SOURCE OF TRUTH in its
// `.claude/skills/ad-type-<id>/SKILL.md`, under a `## Runtime fragments` section
// whose `### <seamName>` fenced blocks hold the exact directive lines (one array
// element per line, verbatim). This is loaded + parsed at RUNTIME (readFileSync
// + cache + frontmatter-strip, mirroring ai-ad-gen) and the def's FragmentSet is
// built from it — TYPE seams from the .md, LOOK seams delegating to the shared
// look base unless the .md overrides them.
//
// Why fenced blocks: markdown does NOT process fence contents, so leading
// indentation and exact whitespace survive the round-trip — required for the
// byte-identical legacy guarantee (fragment-regression.test.ts).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { lookBase } from "./fragments/looks.js";
import type { FragmentCtx, FragmentSet, LookFamily } from "./types.js";

// apps/api/src/agents/ad-types → repo root (5 levels up). The api runs via tsx
// on src (no bundle), so reading from the repo's .claude/skills at runtime works.
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");

type SeamMap = Partial<Record<keyof FragmentSet, string[]>>;
const cache = new Map<string, SeamMap>();

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*[\r\n]/);
  return m ? raw.slice(m[0].length) : raw;
}

/** Parse the `## Runtime fragments` section → one string[] per `### <seam>` fence. */
function parseRuntimeFragments(body: string): SeamMap {
  // Isolate everything under `## Runtime fragments` up to the next `#`/`##` heading.
  const sec = body.match(
    /(?:^|\n)##\s+Runtime fragments\s*\r?\n([\s\S]*?)(?:\r?\n#{1,2}\s|\s*$)/,
  );
  if (!sec) return {};
  const section = sec[1];
  const out: SeamMap = {};
  // Each `### <seamName>` heading, then the first fenced block beneath it.
  const headingRe = /(?:^|\n)###\s+([A-Za-z0-9_]+)\s*\r?\n/g;
  const heads = [...section.matchAll(headingRe)];
  for (let i = 0; i < heads.length; i++) {
    const seam = heads[i][1] as keyof FragmentSet;
    const start = (heads[i].index ?? 0) + heads[i][0].length;
    const end = i + 1 < heads.length ? (heads[i + 1].index ?? section.length) : section.length;
    const chunk = section.slice(start, end);
    const fence = chunk.match(/```[^\n]*\n([\s\S]*?)\r?\n?```/);
    if (!fence) {
      out[seam] = [];
      continue;
    }
    const inner = fence[1].replace(/\r\n/g, "\n");
    out[seam] = inner.length === 0 ? [] : inner.split("\n");
  }
  return out;
}

/** Load + cache the runtime fragment seams for an ad type id. */
export function loadAdTypeFragments(id: string): SeamMap {
  const cached = cache.get(id);
  if (cached) return cached;
  const path = join(SKILLS_DIR, `ad-type-${id}`, "SKILL.md");
  if (!existsSync(path)) {
    const empty: SeamMap = {};
    cache.set(id, empty);
    return empty;
  }
  const parsed = parseRuntimeFragments(stripFrontmatter(readFileSync(path, "utf8")));
  cache.set(id, parsed);
  return parsed;
}

/**
 * Build a def's FragmentSet: TYPE seams from the SKILL.md (`?? []`), LOOK seams
 * delegating to the look base unless the .md provides an override. The two LEGACY
 * looks keep their byte-identical keyframe/closing prose in the look base (the
 * legacy .md must NOT define those seams).
 */
export function buildFragments(id: string, lookFamily: LookFamily): FragmentSet {
  const f = loadAdTypeFragments(id);
  const look = lookBase(lookFamily);
  const md =
    (seam: keyof FragmentSet) =>
    (_ctx: FragmentCtx): string[] =>
      f[seam] ?? [];
  const fromMdOr =
    (seam: keyof FragmentSet, fallback: (ctx: FragmentCtx) => string[]) =>
    (ctx: FragmentCtx): string[] =>
      f[seam] ?? fallback(ctx);
  return {
    // TYPE-driven seams → authored in the .md.
    storyboardTypeBlock: md("storyboardTypeBlock"),
    storyboardSpeakerLabel: md("storyboardSpeakerLabel"),
    storyboardTranscriptStyle: md("storyboardTranscriptStyle"),
    videoVoice: md("videoVoice"),
    videoAudioLine: md("videoAudioLine"),
    narrativeTreatment: md("narrativeTreatment"),
    // LOOK-driven seams → look base unless the .md overrides them.
    storyboardKeyframeLook: fromMdOr("storyboardKeyframeLook", (c) => look.keyframeLook(c)),
    storyboardCaptionStyle: fromMdOr("storyboardCaptionStyle", (c) => look.captionStyle(c)),
    storyboardShotDirection: fromMdOr("storyboardShotDirection", (c) => look.shotDirection(c)),
    videoPacing: fromMdOr("videoPacing", (c) => look.pacing(c)),
  };
}
