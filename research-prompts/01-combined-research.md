# Research prompt — Combined (all topics in one thread)

> Attach `00-system-briefing.md` first, then paste this. Use this ONE prompt if you want
> everything in a single thread instead of running `02`–`05` separately. Trade-off: depth
> per topic is lower than the dedicated prompts. The provider guides (`06` Seedance, `07`
> GPT-Image-2) are deep and noisy enough that they're still best run as their own threads,
> but a condensed version of each is included at the end here.

You are a panel of experts working together: a performance-creative strategist, a
direct-response copywriter, an applied-LLM/prompt engineer, and a TypeScript systems
architect. You've read the system briefing for our AI ad-video generator. Today it
produces only `ugc` / `inspirational` ads and always requires a product image. We are
expanding it to generate **any type of ad**, with per-type asset requirements, a hook
layer, automatic detection, a prompt-system restructure, and per-type skill docs.

Produce ONE structured design document with the six parts below. Make every part
**registry-mappable data** (tables / JSON / fragment lists), not essays — we drop the
output straight into code (`apps/api/src/agents/ad-types/`) and skill docs
(`.claude/skills/ad-type-*/`).

---

## Part 1 — Ad-type taxonomy + asset policy

Define ~12–20 practical ad types. Map our existing `ugc`/`inspirational` into them. For
each: `id`, `displayName`, discriminative `description`, `whenToUse` (funnel stage),
**`assetPolicy`** (`product` & `person` each `required|optional|forbidden` + rationale),
`look` family (small fixed set, e.g. `ugc_authentic` / `cinematic` / `graphic_text`), and
how it differs from our current two. Add an **asset-policy matrix** and explicitly call out
types needing **neither product nor person**. Output a table + a JSON array.

## Part 2 — Hook library

Define ~10–18 hooks. Hooks must be **orthogonal** to ad types (an additive opening
fragment, NOT a type×hook matrix). For each: `id`, `displayName`, `description` (+ the
psychological lever), **`openingDirective`** (1–3 imperative sentences droppable into the
first scene/shot verbatim), `scriptToneNote`, `fitsAdTypes`, `worksWithoutProduct`,
`worksWithoutPerson`. Add a hook×ad-type fit table (each type's default + allowed hooks)
and composition rules (max hooks per ad, mutual exclusions). Output tables + JSON.

## Part 3 — Detection

Design the single `gpt-4.1` JSON call that extends our `interpretAdStyle` to classify
ad type + 1–2 hooks + style from the raw prompt (user never states them). Give: the
extended output schema (`{ adStyle, adType, hooks[], confidence?, assetIntent? }` as TS +
Zod); per-type and per-hook **classification cues**; the detector prompt template (with
the ad-type/hook menu injected from the registry at runtime via a placeholder);
disambiguation + **registry-clamp fallback** rules (unknown id → default); asset
reconciliation (detected type needs a product but none uploaded → fail / downgrade /
prompt — recommend a default); and 6–10 worked example prompts → expected output as test
fixtures.

## Part 4 — Prompt-system restructure

We apply ad type via hard-coded `if (adType === "ugc") … else …` branches across 13
`prompt.ts` files (biggest: `storyboard/prompt.ts`, with a `typeBlock`, a `keyframeLook`,
and ternaries; `video/prompt.ts` with `VOICE: Record<AdType,…>` + an audio line;
`narrative-outline/prompt.ts` with an `isUgc` branch). Design a **registry/strategy**: an
`AdTypeDef` + `FragmentSet` (one method per varying seam, each returning `string[]`,
receiving a `FragmentCtx`), a directory layout (`ad-types/registry.ts`, `types.ts`,
`defs/<id>.ts`, `hooks/`, `fragments/shared.ts`), a before/after call-site snippet, and
where a hook's `openingDirective` is injected (scene 1 / first time-slice) without a
type×hook matrix. Keep the invariant machinery (grid geometry, `@Image` legend, JSON
shape) in the builders; externalize ONLY the varying fragments; move the existing UGC +
inspirational strings in **verbatim** so the refactor is behavior-preserving.

Also recommend converting `adType` from a TS-union + Postgres enum to an **open string id
validated by Zod at the wire boundary** (our `runErrorCode` field already does this to
avoid enum migrations), with `getAdType(id)` falling back to a default for unknown ids.

## Part 5 — Per-ad-type skills + sync

Specify the `.claude/skills/ad-type-<id>/SKILL.md` format (YAML frontmatter + sections:
intent, detection cues, asset policy, favored hooks, look & treatment, script/voice tone,
canonical fragment prose). Explain the relationship between the **skill (authoring doc)**
and the **runtime `defs/<id>.ts` (executable)**, and a concrete **sync strategy** (identical
naming, header cross-link comment, a structural test asserting 1:1 correspondence).

## Part 6 — Migration phasing

Recommend the safe incremental order, each a small testable slice: (0) open the type id +
add a hooks column; (1) introduce the registry, move the two existing types verbatim
(behavior identical); (2) add detection + hooks; (3) make product/person optional via the
existing step-collapse pattern; (4) add new ad types one at a time. One-line test per phase.

---

## Appendix A — Seedance 2.0 prompting (condensed; full version = prompt `06`)

Briefly: validate our principles (short ~60–100 word prompts beat long; explicit motion in
causal order; short negatives; Seedance synthesizes its own voice, can't clone). Give a
≤100-word Seedance prompt template per look family and a one-line opening-motion per hook.

## Appendix B — GPT-Image-2 prompting (condensed; full version = prompt `07`)

Briefly: validate our principles (realism won in the still; exact product-marking/logo
fidelity via `images.edit`; photoreal anti-AI-look skin; 2K not 4K; no `input_fidelity`).
Give a ≤80-word look fragment per look family and per-ad-type keyframe-composition notes,
including the no-product / no-person cases.

---

## Output format

One document, six parts + two appendices, each part as tables/JSON/fragment lists we can
paste into code. Minimal prose. Cite sources for the provider appendices.
