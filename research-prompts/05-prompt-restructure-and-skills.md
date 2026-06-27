# Research prompt — Prompt-system restructure + per-ad-type skills

> Attach `00-system-briefing.md` first, then paste this. If available, also paste the
> outputs of `02` (taxonomy) and `03` (hooks) so the design targets real ids.

You are a TypeScript systems architect with a prompt-engineering background. You've read
the system briefing. Our problem: ad type is applied via **hard-coded binary
`if (adType === "ugc") … else …` branches** scattered across 13 large `prompt.ts`
files. Adding a new ad type today means editing every branch. We want a **registry /
strategy** design so each ad type (and hook) contributes its own prompt fragments, and
adding a type is purely additive. We also want a **per-ad-type "skill" doc** so each type
is consistently specified.

## Context on the current prompt files (the branches to replace)

- `image/storyboard/prompt.ts` (~713 lines) — the biggest. Contains a UGC-vs-inspirational
  `typeBlock` (how the product is presented: on-camera demonstration vs. cinematic scene),
  a `keyframeLook` block (authentic phone-captured vs. polished cinematic), and several
  inline `adType === "ugc"` ternaries. It also has lots of **invariant machinery** we must
  NOT disturb: grid geometry, panel-label/badge rules, the `@Image` reference legend,
  scene-JSON output shape, product-presentation and use-sequence blocks.
- `video/prompt.ts` — `const VOICE: Record<AdType, string>` and a UGC-vs-voiceover audio
  line, plus `ugc` ternaries.
- `narrative-outline/prompt.ts` — an `isUgc` branch for script treatment.

## Your task

Design the restructure. The principle: **keep the invariant machinery in the builders;
externalize only the type/hook-varying fragments into a registry.** The existing UGC and
inspirational strings should move verbatim into the registry as the first two entries, so
the refactor is behavior-preserving on day one.

## What I need

1. **Registry data model.** Propose the `AdTypeDef` and `FragmentSet` interfaces.
   `FragmentSet` should expose one method per varying seam, each returning `string[]`
   (our prompt blocks are string arrays joined with newlines), receiving a `FragmentCtx`
   (adStyle, productBrief, personBrief, hasProduct, hasPerson, hooks, duration/segment
   info). Map each method to the exact seam it replaces, e.g.:
   - `storyboardTypeBlock` ← storyboard `typeBlock`
   - `storyboardKeyframeLook` ← storyboard `keyframeLook`
   - `storyboardSpeakerLabel` ← "the on-screen person" vs "the voiceover"
   - `videoVoice` ← `VOICE[adType]`
   - `videoAudioLine` ← the audio line
   - `narrativeTreatment` ← the `isUgc` branch
     Add a coarse `lookFamily` field so types that share a look reuse a base.

2. **File/module layout.** Propose the directory structure (we're thinking
   `apps/api/src/agents/ad-types/` with `registry.ts`, `types.ts`, `defs/<type>.ts` per
   ad type, `hooks/`, and a `fragments/shared.ts` for cross-type blocks). Show how a
   builder call site changes from a binary branch to a registry lookup
   (`getAdType(adType).fragments.storyboardTypeBlock(ctx)`).

3. **Hook composition.** Show exactly where/how a selected hook's `openingDirective` gets
   injected — into scene 1 of the storyboard and the first time-slice of the video prompt
   — layered on top of the ad-type fragments, without a type×hook matrix.

4. **Handling the open type set safely.** Today `adType` is a TS union + a Postgres enum.
   Recommend converting it to an open string id validated by Zod at the wire boundary
   (our `runErrorCode` field already does exactly this to avoid enum migrations). Show how
   `getAdType(id)` should fall back to a default when the id is unknown, so widening the
   set never produces a non-exhaustive `Record<AdType, …>` compile error.

5. **Per-ad-type skill doc.** Each ad type also gets a `.claude/skills/ad-type-<id>/SKILL.md`
   (YAML frontmatter `name`, `description`, body). Specify the doc's sections (intent,
   detection cues, asset policy, favored hooks, look & treatment, script/voice tone, and
   the canonical fragment prose). Then explain the **relationship between the skill (a
   human/Claude authoring doc) and the runtime `defs/<id>.ts` (the executable)** and a
   concrete **sync strategy** so they never drift (identical naming, a header comment
   cross-link, and a structural test asserting 1:1 correspondence between `defs/*.ts` and
   `ad-type-*/` skill folders).

6. **Migration phasing.** Recommend the safe incremental order: (0) open the type +
   add a hooks column, (1) introduce the registry and move the two existing types
   verbatim — behavior identical, (2) add detection + hooks, (3) make product/person
   optional via the existing step-collapse pattern, (4) add new ad types one at a time.
   For each phase, the smallest testable slice.

## Output format

Interfaces as TypeScript, the directory layout as a tree, the call-site change as a
before/after snippet, and the phasing as a numbered list with a one-line test per phase.
Keep prose tight; this is an engineering design doc.

## Constraints

- Behavior must be byte-identical for `ugc`/`inspirational` after the pure refactor.
- Do NOT redesign the invariant machinery (grid geometry, `@Image` legend, JSON shape) —
  only externalize the varying fragments.
- Fragments return `string[]` to drop into the existing array spreads unchanged.
