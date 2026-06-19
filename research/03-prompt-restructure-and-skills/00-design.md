# Ad-type prompt-system restructure — design doc

Replace the scattered `if (adType === "ugc") … else …` branches across the 13
`prompt.ts` files with a **registry / strategy**: each ad type contributes its
own prompt fragments, adding a type is purely additive, and each type has a
paired authoring **skill doc**. The two existing types move in **verbatim**, so
day-one behaviour is byte-identical.

**Three constraints, encoded throughout:**

1. **`const VOICE: Record<AdType, string>` is deleted.** Its two values move onto
   the per-def `videoVoice(ctx)` fragment. No `Record<AdType, …>` survives
   anywhere (see Part 4 for why this matters).
2. **Fragments return raw `string[]`.** They never join. Every builder keeps its
   own joiner — the video builder's two call sites keep their existing `" "` and
   `"\n"` joins (Part 2).
3. **`FragmentCtx` carries `hasProduct` / `hasPerson` as explicit params** the
   pipeline computes from `assetPolicy` + the actual upload; fragments don't
   re-derive them.

What is **not** touched: grid geometry, panel-label/badge rules, the `@Image`
legend, the scene-JSON shape, the product-presentation and use-sequence blocks.
Those stay in the builders. We externalise **only** the type/hook-varying
fragments.

---

## Part 1 — Registry data model

Full source: `apps/api/src/agents/ad-types/types.ts`.

Three nested pieces: `AdTypeDef` (the row) → `FragmentSet` (one method per seam) →
`FragmentCtx` (the data each method gets). Plus a coarse `LookStrategy` base that
types sharing a look reuse.

```ts
export interface AdTypeDef {
  id: string; // OPEN kebab-case id (no union)
  displayName: string;
  description: string; // discriminative; feeds interpretAdStyle's classifier
  whenToUse: string;
  assetPolicy: AssetPolicy; // product/person = required | optional | forbidden
  lookFamily: LookFamily; // one of the CLOSED 4 — selects the shared base
  defaultHooks: string[]; // HookDef ids
  allowedHooks: string[];
  legacyMapping?: "ugc" | "inspirational"; // only on the two seed types
  fragments: FragmentSet;
}

export interface FragmentCtx {
  adStyle: string;
  productBrief: string | null;
  personBrief: string | null;
  hasProduct: boolean; // EXPLICIT (constraint 3)
  hasPerson: boolean; // EXPLICIT
  hooks: HookSelection; // resolved hook(s) for the run
  duration: 15 | 30 | 45 | 60;
  segmentIndex: number | null;
  segmentCount: number;
}

export interface FragmentSet {
  storyboardTypeBlock(ctx: FragmentCtx): string[];
  storyboardKeyframeLook(ctx: FragmentCtx): string[];
  storyboardSpeakerLabel(ctx: FragmentCtx): string[];
  storyboardCaptionStyle(ctx: FragmentCtx): string[];
  storyboardTranscriptStyle(ctx: FragmentCtx): string[];
  storyboardShotDirection(ctx: FragmentCtx): string[];
  videoVoice(ctx: FragmentCtx): string[];
  videoAudioLine(ctx: FragmentCtx): string[];
  videoPacing(ctx: FragmentCtx): string[];
  narrativeTreatment(ctx: FragmentCtx): string[];
}
```

### Seam → method map (the ~10 seams)

`SPEC` = explicitly named in the brief; move verbatim. `INFER` = a likely
additional inline ternary the briefing references but doesn't name ("several
inline `adType === "ugc"` ternaries"); each is marked `SEAM-VERIFY` in the defs —
wire it to the real ternary during the move, or delete the method if no such
ternary exists. `LOOK` = delegates to the shared look base; `TYPE` = authored per
def.

| method                      | source seam                               | kind  | driver |
| --------------------------- | ----------------------------------------- | ----- | ------ |
| `storyboardTypeBlock`       | storyboard `typeBlock`                    | SPEC  | TYPE   |
| `storyboardKeyframeLook`    | storyboard `keyframeLook`                 | SPEC  | LOOK   |
| `storyboardSpeakerLabel`    | "the on-screen person" vs "the voiceover" | SPEC  | TYPE   |
| `storyboardCaptionStyle`    | panel-caption ternary                     | INFER | LOOK   |
| `storyboardTranscriptStyle` | transcript-line ternary                   | INFER | TYPE   |
| `storyboardShotDirection`   | per-panel camera ternary                  | INFER | LOOK   |
| `videoVoice`                | `VOICE[adType]` (Record **deleted**)      | SPEC  | TYPE   |
| `videoAudioLine`            | the audio line                            | SPEC  | TYPE   |
| `videoPacing`               | shot-rhythm ternary                       | INFER | LOOK   |
| `narrativeTreatment`        | `isUgc` script branch                     | SPEC  | TYPE   |

Six SPEC + four INFER. The four INFER methods are honest placeholders for the
unnamed ternaries: keeping them in the interface makes the verbatim-move pass a
checklist (each `SEAM-VERIFY` marker is either satisfied or the method is
deleted), and a method that turns out to have no source simply returns `[]` — a
no-op in the array spread.

### `lookFamily` + the shared `LookStrategy` base

Looks are a **closed set of 4** (`ugc_authentic`, `cinematic_polished`,
`graphic_text`, `demo_clean`). The LOOK-driven seams live once per family in
`fragments/looks.ts` so all `ugc_authentic` types share one phone-captured block,
etc. A def reuses its base by delegating:

```ts
const look = lookBase("ugc_authentic");
// …
storyboardKeyframeLook: (ctx) => look.keyframeLook(ctx),   // reuse, don't re-author
storyboardTypeBlock:    (ctx) => [ /* per-type prose */ ], // authored
```

`ugc_authentic.keyframeLook` and `cinematic_polished.keyframeLook` receive the
**verbatim** legacy strings; `graphic_text` and `demo_clean` are **net-new**
(no legacy source) and are authored fresh — flagged `// NEW LOOK — author` in the
file.

---

## Part 2 — File / module layout

```
apps/api/src/agents/ad-types/
├── types.ts                     # AdTypeDef, FragmentSet, FragmentCtx, LookStrategy, HookSelection
├── registry.ts                  # REGISTRY map + getAdType() fallback + aliases + Zod schema
├── defs/
│   ├── testimonial.ts           # legacy `ugc`            (SKELETON + VERBATIM-MOVE markers)
│   ├── brand-story.ts           # legacy `inspirational`  (SKELETON + VERBATIM-MOVE markers)
│   └── <id>.ts                  # one per ad type, added in phase 4
├── fragments/
│   ├── looks.ts                 # the 4 LookStrategy bases (2 verbatim, 2 net-new)
│   └── shared.ts                # cross-type fragment helpers (e.g. asset-aware boilerplate)
├── hooks/
│   ├── registry.ts             # HookDef catalog + getHook()
│   ├── compose.ts              # resolveHooks() + hookOpening()
│   └── hook-defs.json          # the 16 HookDef entries (paste-ready research JSON)
└── __tests__/
    └── defs-skills-sync.test.ts # 1:1 defs ⇄ skills + seam-completeness guard

.claude/skills/
├── ad-type-testimonial/SKILL.md
├── ad-type-brand-story/SKILL.md
└── ad-type-<id>/SKILL.md        # one per def, kept 1:1 by the sync test
```

### Call-site change — storyboard `typeBlock`

```ts
// BEFORE — image/storyboard/prompt.ts
const typeBlock =
  adType === "ugc"
    ? [
        /* …UGC presentation instructions… */
      ]
    : [
        /* …inspirational cinematic instructions… */
      ];

const prompt = [...header, ...typeBlock, ...gridGeometry /* invariant */].join(
  "\n",
);
```

```ts
// AFTER
import { getAdType } from "../../ad-types/registry";

const def = getAdType(run.adType);
const typeBlock = def.fragments.storyboardTypeBlock(ctx); // string[]

const prompt = [
  ...header,
  ...typeBlock,
  ...gridGeometry /* invariant, untouched */,
].join("\n");
```

The builder's own `.join("\n")` is unchanged — `typeBlock` is still a `string[]`
spread into the same array. Every other `adType === "ugc"` ternary in this file
becomes `def.fragments.<seam>(ctx)` the same way.

### Call-site change — video `VOICE` (Record deleted), two joiners preserved

```ts
// BEFORE — video/prompt.ts
const VOICE: Record<AdType, string> = {
  ugc: "…ugc voice…",
  inspirational: "…inspirational voice…",
};
// call site A (joined with a space):
const promptLine = [intro, VOICE[adType], outro].join(" ");
// call site B (joined with a newline, elsewhere in the same builder):
const audioBlock = [VOICE[adType], audioLineFor(adType)].join("\n");
```

```ts
// AFTER — the Record is gone; values live on the def
const def = getAdType(run.adType);
const voice = def.fragments.videoVoice(ctx); // string[]
const audio = def.fragments.videoAudioLine(ctx); // string[]

// call site A keeps its space join:
const promptLine = [intro, ...voice, outro].join(" ");
// call site B keeps its newline join:
const audioBlock = [...voice, ...audio].join("\n");
```

Because the fragments return `string[]`, each call site keeps exactly the joiner
it already had — no joiner is baked into the fragment (constraint 2).

---

## Part 3 — Hook composition

A hook is an **ad-type-agnostic opening fragment**. It is layered onto the
opening, not multiplied against the type — there is **no type×hook matrix**. The
type contributes its base treatment; the hook contributes one `openingDirective`.

Two steps, both in `hooks/compose.ts`:

1. **`resolveHooks(def, detectedIds, { hasProduct, hasPerson, confidence })`** →
   a `HookSelection` of at most two hooks (exactly one `visual_lead` that owns
   frame 1, an optional `overlay` that layers a line/text on it). It drops
   unknown ids and ids outside `def.allowedHooks`, applies the **asset guardrail**
   (strip `testimonial`/`confession` with no person; `demonstration` with no
   product), **collapses the mutually-exclusive sets** to one each, ranks by
   precedence (in `defaultHooks` > higher confidence > visual-lead), and never
   pairs two visual-leads.

2. **`hookOpening(selection)`** → `{ storyboardScene1: string[], videoFirstSlice:
string[] }`. The same opening directives feed both surfaces; the builders
   differ only in where they splice them.

Injection points, layered **on top of** the ad-type fragments:

```ts
// storyboard builder — scene 1 only
const def = getAdType(run.adType);
const { storyboardScene1 } = hookOpening(ctx.hooks);
const scene1 = [
  ...storyboardScene1, // hook opening (visual-lead [+ overlay])
  ...def.fragments.storyboardTypeBlock(ctx), // ad-type base treatment
  ...def.fragments.storyboardSpeakerLabel(ctx),
];
// scenes 2..4 (or 2..N) get NO hook lines — opening only.
```

```ts
// video builder — first time-slice only
const { videoFirstSlice } = hookOpening(ctx.hooks);
const firstSlice = [
  ...videoFirstSlice, // hook opening
  ...def.fragments.videoVoice(ctx), // type voice
].join(" "); // call site A's existing joiner
```

Adding a hook is adding one `HookDef` row + listing its id in the relevant types'
`allowedHooks`. No builder edit, no per-type code.

---

## Part 4 — Handling the open type set safely

`adType` was a TS union **and** a Postgres enum, so adding a value meant a DB
migration and risked non-exhaustive `Record<AdType, …>` compile errors. We follow
the `runErrorCode` precedent: **store it as plain text, validate it as an open
string** (`registry.ts`).

```ts
// wire boundary — open string, NOT z.enum (no migration to add a type)
export const adTypeIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9-]*$/);
```

We validate **shape, not membership**: an unrecognised id is accepted at the
boundary and resolved by the fallback, not rejected.

```ts
export function getAdType(id: string): AdTypeDef {
  const canonical = LEGACY_ALIASES[id] ?? id; // "ugc"→"testimonial", "inspirational"→"brand-story"
  const def = REGISTRY[canonical];
  if (def) return def;
  console.warn(
    `[ad-types] unknown adType "${id}" — falling back to "${FALLBACK_AD_TYPE_ID}"`,
  );
  return REGISTRY[FALLBACK_AD_TYPE_ID]; // widen-safe; never throws
}
```

**Why no exhaustiveness problem any more.** The only exhaustive `Record` in the
system is `Record<LookFamily, LookStrategy>` — and `LookFamily` is a **closed**
set of 4 we control. All _open_-set variation (the 16+ types) flows through the
`REGISTRY` map (keyed by `string`) and per-def `fragments`. So widening the type
set touches data (a new `defs/<id>.ts` + a registry entry), never a switch that
must list every id. The doc comment in `registry.ts` bans reintroducing
`Record<AdType, …>` downstream.

**Legacy rows keep working.** `LEGACY_ALIASES` maps persisted `"ugc"` /
`"inspirational"` to the new ids before lookup, so existing `runs.ad_type` values
resolve to `testimonial` / `brand-story` and stay byte-identical.

---

## Part 5 — Per-ad-type skill doc + sync strategy

Each type gets `.claude/skills/ad-type-<id>/SKILL.md` (YAML frontmatter `name`,
`description`; body). Example shipped: `ad-type-testimonial/SKILL.md`. Sections:

- **Intent** — what the ad is for, one paragraph.
- **Detection cues** — how `interpretAdStyle` should route to it, with the
  neighbour disambiguations (e.g. testimonial vs spokesperson vs founder-pov).
- **Asset policy** — product/person required|optional|forbidden + rationale.
- **Favored hooks** — `defaultHooks` / `allowedHooks` and the asset guardrail.
- **Look & treatment** — `lookFamily`; notes which seams defer to the look base.
- **Script / voice tone** — voice character.
- **Canonical fragment prose** — one subsection per **TYPE-driven** `FragmentSet`
  method, carrying the prose (verbatim for the two legacy types).

### Skill ↔ def relationship

The **SKILL.md is the human/Claude authoring doc**; `defs/<id>.ts` is the
**executable**. The skill holds the canonical prose and the reasoning; the def
holds the same prose wired into typed `string[]` methods the pipeline calls. They
are deliberately redundant — the skill is where a person edits, the def is what
runs — so they must be kept in lockstep.

### Sync strategy (so they never drift)

1. **Identical naming.** `defs/<id>.ts` ⇄ `ad-type-<id>/`; the SKILL.md
   frontmatter `name` is exactly `ad-type-<id>`; the "Canonical fragment prose"
   subsection headings match `FragmentSet` method names.
2. **Cross-link header.** Each def names its skill path in a header comment; each
   skill names its def. (The legacy defs carry `// VERBATIM-MOVE` markers so the
   move target is unambiguous.)
3. **Structural test** — `__tests__/defs-skills-sync.test.ts` asserts: a 1:1 id
   set on both sides (no orphans either way); every frontmatter `name` ===
   `ad-type-<id>`; every def cross-links its skill; every registered def
   implements all 10 seams and each returns an array (never a joined string);
   every registry id has a def file. CI fails if a type is added on one side
   only.

---

## Part 6 — Migration phasing

Safe incremental order; each phase ships behind the previous and has one
smallest-testable slice.

0. **Open the type + add hooks storage.** Convert `runs.ad_type` from a Postgres
   enum to `text`; add a `hooks text[]` (or `jsonb`) column. Add
   `adTypeIdSchema`. No behaviour change.
   _Test:_ a run created with `ad_type = "ugc"` still reads back and runs exactly
   as before.

1. **Introduce the registry; move the two types verbatim.** Add the `ad-types/`
   module, `defs/testimonial.ts` + `defs/brand-story.ts`, the `looks.ts` bases
   (verbatim for the two existing looks), and the `LEGACY_ALIASES`. Replace each
   `adType === "ugc"` ternary with `getAdType(...).fragments.<seam>(ctx)`. Delete
   `VOICE`. Behaviour byte-identical.
   _Test:_ golden-snapshot the full storyboard + video + narrative prompt strings
   for `ugc` and `inspirational` before vs after — assert byte-equal.

2. **Add detection + hooks.** Extend `interpretAdStyle` to emit an open `adType`
   id (using the `description` fields as the rubric) and detected hook ids;
   resolve them with `resolveHooks`; splice `hookOpening` into scene 1 / the
   first video slice.
   _Test:_ a labelled prompt set classifies to the expected `{ adType, hooks }`
   above a confusion-rate threshold; the visual-lead/overlay invariant holds
   (never two visual-leads).

3. **Make product/person optional via the existing step-collapse.** At pipeline
   entry read `def.assetPolicy`; if an asset isn't `required` and none was
   uploaded, skip its reference step (reuse the Critic-off collapse mechanism)
   and pass `hasProduct`/`hasPerson` into `FragmentCtx`.
   _Test:_ a `brand-awareness` run with no product and no person skips both
   reference steps and still reaches `completed`.

4. **Add new ad types one at a time.** Each is a new `defs/<id>.ts` + matching
   `ad-type-<id>/SKILL.md` + a registry entry — purely additive.
   _Test:_ the sync test stays green and a smoke run of the new type produces a
   non-empty prompt for all 10 seams.

```

```
