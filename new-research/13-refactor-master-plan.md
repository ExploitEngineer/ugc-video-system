# 13 — Refactor Master Plan (for Claude Code)

> This is the spine of the refactor. It maps every confirmed problem to concrete file changes, defines what each model call should RETURN (compact, not walls of text), sets prompt-size budgets, and specifies the regenerate-on-failure design and edge cases.
> Companion files: [[14-hooks-redesign]] (the hook subsystem) and [[15-how-to-drive-claude-code]] (how to actually run this with Claude Code).
> Grounding research: [[01-issues-diagnosis]], [[04-gpt-image-2-guide]], [[05-seedance-2.0-guide]], [[03-prompting-formula-review]].

---

## 0. Guiding principles (the guardrails for the whole refactor)

1. **Realism is specific and SOFTER, not louder.** Deleting the "louder" language (VISIBLE PORES, 8k, hyper-detail) is most of the win.
2. **Lighting + white balance are the highest-leverage levers — control them, don't delegate them to the model.** (You currently delegate them; reverse that.)
3. **One Seedance clip = one camera move + one subject action per beat.** Never `fast`. Cuts are clean scene-changes, never morph transitions.
4. **Feed the video model CLEAN keyframes, not an annotated contact sheet.** Stop fighting your own reference.
5. **Compress every prompt.** gpt-image-2 prompt-bleeds past ~70 words; Seedance ignores long prompts. Fewer, better words beat more rules.
6. **Each model call returns the SMALLEST structured payload the next step needs** — not prose to be re-parsed.

---

## Phase 1 — Skin & colour realism  *(highest ROI, lowest risk — do first)*

**Root cause (confirmed in your code):** the "make it real" language over-corrected into "make it over-textured." The pore-maximising stack appears in **three compounding layers**:
- `image/person-image/prompt.ts` — "VISIBLE PORES, fine lines, faint sun freckles, faint film grain, NO beauty filters, NO skin smoothing, NOT plastic/waxy" (lines ~64-68, 89-90, 106-108, 174-186, 208-209).
- `image/storyboard/prompt.ts` (+ the shared look prose in `agents/ad-types/fragments/looks.ts` / `shared.ts`) — "natural skin texture with VISIBLE PORES, subtle digital noise, faint film grain, no skin smoothing" and QHD "render at full detail".
- `video/prompt.ts` (ugc path) — "ultra detailed real skin texture, pores visible, no filters, no skin smoothing."

And **white balance is uncontrolled on faces** — only `image/product-sheet/prompt.ts` sets "neutral white balance"; every face-bearing prompt omits it, so the warm/red cast runs free.

### Changes
1. **Delete the pore-maximising phrases** everywhere they touch a face: `visible pores`, `no skin smoothing`, `subtle digital noise`, `faint film grain` (on faces), `no beauty filters`, `unretouched`, `render at full detail`.
2. **Replace with a calibrated skin descriptor per look family** (put these in `fragments/looks.ts` so they're defined once):
   - `ugc_authentic`: *"natural, healthy skin with soft realistic texture, true-to-life colour, even complexion, gentle natural light, neutral-to-warm white balance, no heavy retouching."* (Keep a *little* realism — UGC shouldn't be glossy — but stop hunting pores.)
   - `cinematic_polished`: *"smooth, healthy, even skin, soft flattering light, soft editorial retouching, neutral white balance, natural colour."*
   - `demo_clean`: product-only; if hands appear, *"natural clean skin, neutral white balance."*
3. **Add a redness kill-switch to every face prompt:** *"balanced skin tone, even complexion, no redness, no blotchiness."*
4. **Re-introduce a controlled lighting line per look** (reverse the "the model is free to choose lighting" decision):
   - `ugc_authentic`: *"soft natural window/room light, gentle and even."*
   - `cinematic_polished`: *"soft directional key light with gentle fill, flattering, low-contrast on faces."*
   - `demo_clean`: keep the existing *"clean, even, soft studio light."*
5. **Person sheet:** generate faces at moderate detail, not maxed. Keep 2K output but strip the "full detail / hyper-real / pores" language; a portrait-flattering lens line (`85mm-equivalent, natural perspective`) helps.

**Definition of done:** a testimonial and a cinematic run both produce smooth, healthy, natural skin with no visible-pore macro texture and no ruddy cast; UGC still reads candid (not glossy).

**⚠ Test gotcha:** `agents/ad-types/__tests__/fragment-regression.test.ts` and `defs-skills-sync.test.ts` currently pin this prose *verbatim*. Changing the fragments will fail these golden tests — Claude Code must UPDATE the golden strings in the same PR (see [[15-how-to-drive-claude-code]]).

---

## Phase 2 — Fix the motion contradiction & the "one clip does too much" problem

**Root cause A (confirmed):** for `service`, the video system prompt says *"Render the FOUR scenes… clean CUT between each — DISTINCT settings,"* but the runtime tail `[renderDirective]` appended to the SAME payload says *"Render ONE continuous live-action take with no cuts."* Direct contradiction. The tail is applied globally (`video/index.ts`) regardless of type.

**Root cause B:** every 15s clip asks Seedance to render **4 distinct panels + 4 lip-synced lines**, sometimes with cuts — the exact recipe for morphing / "weird moments" (research: one clip = one camera move + one action).

### Changes
1. **Make `renderDirective` per-look, not global.** In `video/index.ts`:
   - `ugc_authentic` (testimonial, lifestyle): *ONE continuous handheld take, no cuts.* ✓ (keep)
   - `cinematic_polished` + `service`: *clean CUTS between distinct beats; each beat is one stable shot.* (Remove the "no cuts" line for these — that's the contradiction.)
   - `demo_clean` (product-demo): *clean cuts between setup → action → mechanism → result; product rigid.*
2. **Reduce load per clip.** Pick one:
   - **(Recommended, bigger change)** Drop from 4 beats to **2 beats per 15s clip** (each ~7s: one camera move + one action + one line). Fewer cuts = far less morph. Storyboard becomes 2 panels per clip.
   - **(Smaller change)** Keep 4 beats but enforce in the prompt: *one camera move OR hold per beat, one action per beat, all motion slow/smooth, cuts are hard scene-changes not morphs.* Explicitly ban `fast`.
3. **Keep `--camerafixed true` for controlled looks, off for `ugc_authentic`** — this is already correct; don't touch it.
4. **Per-beat pacing words** in the deterministic fallback too: `slow, smooth, steady, gentle`.

**Definition of done:** no clip contains contradictory cut/continuous instructions; morphing/"weird moment" rate drops on a 10-run eyeball test.

---

## Phase 3 — Feed clean keyframes, not annotated contact sheets

**Root cause (confirmed):** the storyboard image bakes in `01-04` badges + caption bars + grid borders, then the video prompt + `[renderDirective]` spend many words telling Seedance to *"never render the badges/grid/caption bars."* You're fighting your own reference; grid lines and ghost text leak into video. Higgsfield-style pipelines feed clean frames.

### Changes (pick one path)
- **Path A (recommended): split the artifact.** Keep generating the labelled 2×2 sheet **for the UI/review gate only**. For the video call, **crop the sheet into 4 clean panels** (you already have `lib/image/crop.ts`) and send those as the look/first-frame references with NO badges/bars. Then you can DELETE all the "don't render the annotations" text from the video prompt.
- **Path B: don't bake labels into the image at all.** Generate a clean sheet; render the badges + caption bars as an HTML/CSS overlay in the studio UI (`artifact-card.tsx`). The stored image stays clean; the video gets a clean reference.

Either path lets you cut a large block of defensive prose from `video/prompt.ts` (Phase 4 benefits too).

**Definition of done:** the image sent to Seedance has zero baked text/badges/grid; the video prompt no longer mentions ignoring annotations.

---

## Phase 4 — Compress prompts to fit the models' attention

**Root cause:** the storyboard system prompt is ~200 lines and asks for a **150-200 word** `imagePrompt`; the same rules are restated 3-4× (product scale, identity, pores). gpt-image-2 bleeds past ~70 words, so the levers that matter get averaged out.

### Changes
1. **Storyboard system prompt:** cut from ~200 lines to a tight, layered brief. Remove all duplicate restatements (product-scale rules appear ~4×; identity rules ~3×). Keep: identity binding (by image number), the ad-type block, the use-sequence rule (1×), the skin/light line (from Phase 1), the JSON contract.
2. **`imagePrompt` target: 60-90 words** (down from 150-200). Structure it as the canonical image formula ([[03-prompting-formula-review]]): `style anchor → subject+mood → action → setting+lighting → lens+framing → soft-skin/WB → minimal negatives`.
3. **Video single-line prompt: keep ≤ ~80 words** (you already cap ~90 — tighten to 80 and remove the annotation-ignoring text freed by Phase 3).
4. **See §"Model-return contracts" below** for exact output shapes + budgets per call.

**Definition of done:** every model call's output fits its budget; no prompt restates a rule more than once.

---

## Phase 5 — Hooks  → see [[14-hooks-redesign]]
The hook subsystem needs its own fix (dead ids, ignored `fitsAdTypes`, default-dominance collapsing every type to the same hook). Full detail and the corrected mapping are in file 14. Sequence it after Phase 1-4 or in parallel (it's isolated in `agents/ad-types/hooks/`).

---

## Model-return contracts (what each call should RETURN — compact)

Trim every call to the smallest structured payload the next step needs.

| Call | Model | Return (target size) |
|---|---|---|
| `interpretAdStyle` | reasoning | `{adStyle ≤20w, cleanedPrompt ≤40w, adType, hooks[1-2], confidence, assetIntent}` — already compact, keep. |
| `describeProduct` | vision | `{productBrief ≤35w (category/materials/colours/markings only), productUse: 3-5 verbs}` — trim any prose. |
| `planPersonBrief`/`derive` | vision | `{personBrief ≤25w (gender/age/hair/build/wardrobe)}` — one line. |
| `creativeBrief` (service) | reasoning | cast + 2-4 scene beats + hook + CTA, ≤120w total. |
| `storyboard` planner | reasoning | `{imagePrompt ≤90w, scenes[N]{cameraAngle ≤4w, action ≤10w, sceneDescription ≤14w, panelCaption, transcript ≤12w}}`. No rule restatement in imagePrompt. |
| `videoBuilder` prompt | reasoning | `{videoPrompt: one line ≤80w}`. |
| image gens | gpt-image-2 | PNG (sheet). Keep 2K; drop "full detail". |
| video | Seedance | MP4 + native audio. |

**Principle:** briefs are *anchors* (short, factual), not essays. The long creative expansion happens once, in the storyboard planner, and its output is capped.

---

## Regenerate-on-failure design (your explicit ask)

Today a video failure can fail the whole run; there's no user "regenerate this clip" button. Add a three-tier model.

### 1. Classify the failure (in `videoBuilder` / `providers/byteplus`)
- **Transient** — network / 5xx / poll timeout. You already have `fetchWithRetry` + SDK retries + poll timeout; add an explicit **attempt counter** on the `video`/`segment_video` step.
- **Content/safety** — Seedance's real-human privacy filter blocks the face. You already route the board through the face-asset `asset://` path; if it still blocks, the fallback is to regenerate the person sheet as *clearly synthetic* and retry once.
- **Quality** — task `succeeded` but the clip is bad (morph, wrong skin, off vibe). Only a human catches this.

### 2. Automatic retry ladder (transient/content)
```
attempt 1: LLM-composed prompt
attempt 2 (same inputs): retry after backoff
attempt 3: DETERMINISTIC fallback prompt (simpler, camerafixed, fewer beats)
still failing → mark the step `awaiting_regen` (NEW soft-fail state), not `failed`
```
Keep the run resumable: persist attempt count; the worker/`driveRun` reads it and either retries or parks at the soft-fail state.

### 3. User-triggered regenerate button (quality)
- Add a route `POST /runs/:id/regenerate-video` (and per-segment `?segment_index=`), allowed on `completed` or the new `awaiting_regen` state.
- It re-runs `videoBuilder` for that clip only, reusing the existing storyboard + reference sheets (no re-gen of images), optionally taking a one-line tweak ("less movement", "brighter", "slower").
- **Multi-segment already supports this structurally** — the fan-out is re-entrant (`segment_video` regenerates only missing `segment_index` rows). Extend it: a user regen deletes the target `segment_video` row(s) → the existing re-entrant fill regenerates them → re-merge.
- Surface it in the studio UI (`run-view.tsx` / `artifact-card.tsx`) as a "Regenerate clip" action with an optional note.

### 4. State-machine change
Add `awaiting_regen` (soft-fail) between `running` and `failed`. `failed` becomes reserved for truly unrecoverable errors (bad input, exhausted retries with a hard error). This turns "video failed → dead run" into "video failed → user can retry/tweak."

---

## Edge-case matrix (define expected handling)

| Case | Expected handling |
|---|---|
| No product uploaded | Allowed unless the locked type's `assetPolicy.product = required`. Product-referencing prose must degrade to "the product/service" without an image. |
| No person | `ugc_authentic`/founder/testimonial synthesize a person; asset-guardrail drops person-only hooks (confession). |
| Empty / junk prompt | `interpretAdStyle` returns empty `cleanedPrompt` → default type (product-demo if hasProduct else service); don't fabricate stats (already handled via `inventedValues`). |
| Contradictory format ("split screen, 10 cuts") | `cleanedPrompt` strips the impossible format, keeps intent (already handled — good). |
| Safety-filter block on face | Face-asset path → if still blocked, regen sheet as clearly synthetic → retry (see regen ladder). |
| Truncated image base64 (4K) | Already mitigated (2K + 5× retry). Keep; never request 4K. |
| Merge OOM | Already mitigated (3-pass, semaphore, -threads 2). Keep. |
| Unknown adType/hook id from detector | adType falls back via registry; unknown hook ids are dropped in `compose.ts`. Fix the dead-id defs (see [[14-hooks-redesign]]) so this stops happening silently. |
| Gendered product vs person | Person gender comes ONLY from the person sheet/brief (already strongly enforced — keep). |
| Very long prompt (near 2000 chars) | `cleanedPrompt ≤40w` absorbs it; ensure downstream reads cleaned, not raw. |
| Non-English prompt | Decide: translate in `interpretAdStyle` or support natively. Currently implicit English — make it explicit. |
| Product with heavy on-pack text/logo | demo_clean reproduces label verbatim; other looks keep markings intact (already enforced). |

---

## Suggested execution order (by ROI × risk)
1. **Phase 1 (skin/colour)** — biggest visible win, isolated to fragment prose. Ship first.
2. **Phase 2 (motion contradiction)** — small, high-impact bug fix.
3. **Phase 4 (compression)** — do alongside 1-2 since you're already in those prompts.
4. **Phase 3 (clean keyframes)** — structural; test carefully.
5. **Phase 5 / [[14-hooks-redesign]]** — isolated subsystem; parallelizable.
6. **Regenerate-on-failure + edge cases** — after the generation quality is fixed.
