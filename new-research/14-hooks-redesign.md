# 14 — Hooks Redesign

> Why hooks feel repetitive and wrong, and the exact fix. This subsystem lives in `agents/ad-types/hooks/` (`compose.ts`, `registry.ts`, `hook-defs.json`) plus each type's `defaultHooks`/`allowedHooks` in `defs/*.ts` (mirrored in the `*.skill.md`).

---

## Diagnosis — three concrete bugs (all confirmed in your code)

### Bug 1 — the curated `fitsAdTypes` data is DEAD. `compose.ts` never reads it.
`hook-defs.json` carefully records, per hook, `fitsAdTypes.good` and `clashes`. But `resolveHooks()` scores only on:
```
score = (isDefault ? 100 : 0) + (confidence × 10) + (visual_lead ? 1 : 0)
```
`fitsAdTypes` is never consulted. The single most useful signal — "does this hook actually fit this ad type?" — is thrown away.

### Bug 2 — `defaultHooks` (+100) dominates everything, so each type collapses to its default.
The +100 default bonus is so large that per-prompt confidence (max +10) can almost never overturn it. The detector is *also* told to "prefer the chosen type's defaultHooks." So the type's default wins ~every time → the same hook on every ad of that type.

### Bug 3 — many defs point at hook ids that NO LONGER EXIST in the catalog.
The catalog (`hook-defs.json`) has **9** ids: `striking-visual, pattern-interrupt, problem-solution, before-after, relatable-scenario, confession, curiosity-gap, stat, question`.
But the defs reference dead ids (dropped in the earlier 16→9 cull). `resolveHooks` filters `hasHook(id) && allowed.has(id)`, so dead ids silently vanish — and when a **default** is dead, the type falls to its *other* default:

| Ad type | `defaultHooks` as written | Dead id | Effective result |
|---|---|---|---|
| testimonial | `testimonial`, `problem-solution` | **`testimonial`** dead | → always `problem-solution` |
| product-demo | `demonstration`, `problem-solution` | **`demonstration`** dead | → always `problem-solution` |
| founder-pov | `confession`, `problem-solution` | — | confession/problem-solution |
| service | `problem-solution`, `striking-visual` | — | ok |
| lifestyle | `relatable-scenario`, `pattern-interrupt` | — | ok |
| brand-story | `curiosity-gap`, `pattern-interrupt` | — | ok |
| inspirational | `curiosity-gap`, `pattern-interrupt` | — | identical to brand-story |

Dead ids also in `allowedHooks`: `social-proof`, `direct-callout` (testimonial); `stat-shock` (product-demo — catalog id is `stat`, not `stat-shock`); `contrarian`, `direct-callout` (founder-pov); `direct-callout`, `bold-claim` (lifestyle); `bold-claim` (brand-story, inspirational).

**Net effect:** testimonial, product-demo, service, and founder-pov all frequently land on `problem-solution`; brand-story and inspirational both land on `curiosity-gap`/`pattern-interrupt` and are otherwise identical. That is your "same hook applied to multiple ads, not thinking what fits" symptom — exactly.

---

## The fix

### Fix 1 — reconcile ids (stop the silent collapse)
Make every def reference only real catalog ids. Either restore the useful dropped hooks OR remap. Recommended remap of dead → live:
- `testimonial` (hook) → `confession` (the authentic to-camera opener).
- `demonstration` → `before-after` or `problem-solution` (demonstration is really the whole demo, not a cold-open).
- `stat-shock` → `stat`.
- `contrarian`, `direct-callout`, `social-proof`, `bold-claim` → drop, or add back to the catalog if you want them (they're overlay/copy devices, not cold-opens — probably keep them out).
- Add a `defs-skills-sync`-style guard: **every id in every def's default/allowed MUST exist in the catalog** (fail the test otherwise). This prevents the silent-collapse class of bug returning.

### Fix 2 — actually USE `fitsAdTypes` in scoring
Rewrite the `score` in `compose.ts`:
```
score(id, adType) =
    fitBonus        // +40 if adType ∈ fitsAdTypes.good ; −100 if ∈ clashes
  + defaultBonus    // +20 if id ∈ defaultHooks   (was +100 — too dominant)
  + confidence×15   // per-prompt signal now MATTERS
  + visualLeadTie   // +1
```
Now a hook that genuinely fits the specific prompt (high confidence) or fits the ad type (`fitsAdTypes`) can beat a blind default. Clashes are excluded outright.

### Fix 3 — make the detector reason per-prompt, not reflexively default
In `interpret-style/prompt.ts` TASK 3, replace "Prefer the chosen type's defaultHooks" with: *"Pick the hook whose device best matches THIS prompt's specific angle and emotional entry point; use the type's defaults only as a fallback when the prompt gives no strong signal."* Keep the asset guardrail and the visual-lead/overlay role rule.

### Fix 4 — variety / anti-repetition (optional but recommended)
Track the last hook used per `adType` (or per session) and apply a small penalty to repeating it when a comparably-fitting alternative exists. Prevents 5 testimonials in a row all opening on `confession`.

---

## Recommended per-type hook mapping (grounded in the ad-type research)

Use these as the corrected `defaultHooks` (first = primary) and `allowedHooks` (all catalog-valid). See per-type reasoning in [[06-adtype-service-ad]]…[[12-adtype-founder-story]].

| Ad type | defaultHooks (primary first) | allowedHooks (catalog-valid) |
|---|---|---|
| **testimonial** | `confession`, `relatable-scenario` | confession, relatable-scenario, problem-solution, before-after, question, curiosity-gap |
| **service** | `problem-solution`, `question` | problem-solution, question, stat, striking-visual, relatable-scenario, curiosity-gap |
| **product-demo** | `before-after`, `problem-solution` | before-after, problem-solution, striking-visual, curiosity-gap, question, pattern-interrupt |
| **founder-pov** | `confession`, `problem-solution` | confession, problem-solution, relatable-scenario, question, curiosity-gap |
| **lifestyle** | `relatable-scenario`, `before-after` | relatable-scenario, before-after, pattern-interrupt, striking-visual, curiosity-gap |
| **brand-story** | `striking-visual`, `curiosity-gap` | striking-visual, curiosity-gap, pattern-interrupt, question, relatable-scenario |
| **inspirational** | `striking-visual`, `pattern-interrupt` | striking-visual, pattern-interrupt, curiosity-gap, relatable-scenario |

Note the deliberate differentiation of **brand-story vs inspirational**: brand-story leads with a curiosity-driven narrative open; inspirational leads with a striking visual + montage energy. (If you don't want to differentiate them, consider merging the two types — right now they're identical in look, voice, and hooks.)

### `fitsAdTypes` corrections to make in `hook-defs.json`
- `confession.fitsAdTypes.good` → add `lifestyle`? No — keep `testimonial, founder-pov` (confession needs a person).
- `stat` / `question` → currently `good: [service]` only; add `product-demo` for `question`.
- `before-after` → good already includes product-demo, testimonial, lifestyle — keep.
- Add `clashes` where real: `confession.clashes = [product-demo, brand-story, inspirational]` (no person / wrong register); `stat.clashes = [testimonial, lifestyle]`.

---

## Definition of done
- No def references a non-catalog hook id (guarded by a test).
- `fitsAdTypes` is read in scoring; a clashing hook can never be selected.
- Across the 7 types, the selected hooks are visibly varied and prompt-appropriate on a 14-run eyeball (2 per type), not 4 types all opening on `problem-solution`.
- brand-story and inspirational produce distinguishable openings (or are intentionally merged).
