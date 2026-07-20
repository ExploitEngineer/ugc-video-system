# 09 - Who says what: speaker identity, voice assignment and lip-sync

Status: root-caused + fixed 2026-07-16 on `feat/template-library-pipeline`.
Scope: the template pipeline's script + video prompt (`keyframe/**`, `video/**`, `beats.ts`).
Extends `04-seedance-2.0-prompting-research.md` (the Seedance facts below are its, re-applied).
Related: `[[seedance-audio-limits]]`, `[[seedance-prompt-principles]]`.

## TL;DR

- **The bug was structural, not prompt tuning.** Speaker identity had *no representation anywhere in the data model* — not in the LLM contract, not in `StoryboardScene`, not in the DB.
- So a two-character ad reached Seedance as: *here are two people, here are four lines, all of them `voiceover`, use ONE voice.* It guessed. That is the female-voice-on-a-male-character report.
- `research/04` already prescribed the answer — **describe each voice explicitly by gender/age; Seedance cannot clone, it SYNTHESIZES from the on-screen character plus your text** — and the code did the opposite.
- Fix: a `cast` authored once per run, a per-line `speaker`, and a **frozen voice block** that never passes through the LLM.
- Per-line attribution costs **≈0 tokens**: `(voiceover: "…")` → `(the woman: "…")`.
- **Honest limit:** Seedance may still mis-assign. `research/04` promises drift is *"minimized (not eliminated)"*, and per-line speaker keys are past what it documents. If it fails, post-dub is the only guarantee — and it needs exactly this schema.

## What the code actually said

Three lines, each independently fatal to a two-character ad:

```ts
// video/prompt.ts:97  — EVERY line, hardcoded, regardless of who is on screen
const said = s.transcript?.trim() ? ` (voiceover: "${s.transcript.trim()}")` : "";

// video/prompt.ts:146 — actively fights a two-character ad
"…ONE single voice for the whole clip, mouth visible while speaking, never overlapping voices."

// video/prompt.ts:134 — pins ONE person for the whole clip
`Keep ONE consistent on-screen person (${anchor}) — same face, hair and wardrobe — throughout`
```

And the root: the keyframe reply schema never asked.

```ts
// keyframe/index.ts:46-54 — BEFORE
interface KeyframeReply {
  sheetImagePrompt: string;
  scenes: { sceneDescription: string; spokenLine?: string;
            cameraAction?: string; panelCaption?: string }[];
}
```

`spokenLine` with no owner. `StoryboardScene.transcript` inherits the same hole, so the line travels the whole pipeline — keyframe → `storyboard_sheet` jsonb → `beatsToScenes` → the Seedance prompt — as an **ownerless string**. There was nowhere for a speaker to live from the moment the script was authored.

`runs.supporting_cast` existed (`{role, appearance}[]`, authored by `person-brief`) but **never reached the template pipeline** — zero references under `agents/template/**`. It *was* already on `ctx` (`orchestrator.ts` sets it in `buildCtx`, and template runs do pass `person_sheet`), sitting unread. The fix needed no new plumbing.

## What Seedance actually needs (from `research/04`)

- **Voice cannot be cloned** through the ModelArk text+image pipeline; the photo→voice feature was suspended 2026-02-10. Seedance *synthesizes* a voice from the on-screen character + your description.
- **So describe it**: age, gender, energy, accent, language. Write dialogue as quoted speech.
- **Cross-clip drift is real** and is minimized — not eliminated — by repeating an **identical verbatim** voice descriptor in every segment. This matters here specifically because the template pipeline generates N segments and merges them; a character must not change voice at a segment boundary.
- Prompts stay short (~60-100 words); the model reads "left-to-right with diminishing attention".

## The design

**Normalized LLM contract → denormalized storage → deduped render.** Each layer gets the shape it wants.

```ts
export interface SceneSpeaker {
  id: string;    // "A"/"B"/"C" — the per-scene reference
  role: string;  // "the woman" — SHORT noun phrase; doubles as the per-line key
  voice: string; // ONE frozen string: "warm, upbeat woman in her late 20s, light American accent"
}
```

**Why `voice` is one string, not `{gender, age, accent}`.** Recomposing a sentence from parts at two call sites *is* the drift vector. One string makes verbatim identity guaranteed by `===` rather than by convention. Seedance consumes prose anyway — the grammar belongs in the prompt spec, not the type.

**Why the cast is authored once.** Per scene the LLM emits `speaker: "A"` (~1 token). A model that states each voice once cannot contradict itself.

**Why it is denormalized onto every scene.** `scenes` jsonb is the *only* payload reaching `template_video` (via `latestStoryboardSheet`), and both `beatsToScenes` and `beatsForSegment` **re-slice that array**. A speaker travelling inside its scene survives both; a side-car cast would need re-plumbing through each. jsonb bytes are free — prompt tokens are not, so the video step dedupes back to one legend.

### The load-bearing decision: the voice block bypasses the LLM

`composeVideoBody` sends the shot list to GPT and takes back a rewritten `videoPrompt`. **GPT paraphrases.** A descriptor routed through it becomes *"a warm woman in her late 20s"* in segment 1 and *"a friendly young female voice"* in segment 2 — reintroducing precisely the drift `research/04` warns about.

The codebase already solved this. `rolesText` (the `@Image` legend) is built **once, deterministically, outside the segment loop**, and prepended to every segment. It is byte-identical *by construction*. The voice block joins it:

```ts
const cast = castOf(all.scenes);          // once per run, from the FULL beat list
const voiceText = buildVoiceBlock(cast);  // frozen; the LLM never sees it
…
return { prompt: `${rolesText}${voiceText}${body}\n\n${TEMPLATE_VIDEO_NEGATIVES}`, body };
```

The prompt also tells GPT *"Do NOT describe what any voice sounds like"* — otherwise it invents a competing descriptor that contradicts the block.

### Emitted prompt

One speaker (unchanged intent, now explicit):
```
Voice — the woman: warm, upbeat woman in her late 20s, light American accent. ONE single
voice for the whole clip, mouth visible while speaking, never overlapping voices.
```

Two speakers:
```
Voices — the woman: warm, upbeat woman in her late 20s, light American accent; the man:
calm man in his 30s, neutral accent. Each quoted line is spoken ONLY by the person named
before it, in exactly that voice — never swap these voices between them; one voice at a
time, never overlapping, mouth visible while that person speaks.

[0:04-0:08] She lifts the mug. Slow push-in. (the woman: "It just works.")
[0:08-0:12] He laughs. Gentle hold. (the man: "Told you.")
```

The key is `the woman`, a **self-describing noun phrase** — not an opaque symbol needing a legend lookup. Voices are declared before any quoted line, which is the order `research/04` documents.

## Token cost

| | now | 1 speaker | 2 speakers |
|---|---|---|---|
| per line | `(voiceover: "…")` ≈2 tok | `(the woman: "…")` ≈2 tok | ≈2 tok |
| **per-line delta** | — | **≈0** | **≈0** |
| frozen block | — | ~27 w | ~48 w |
| body budget | 60-100 w | 60-100 w | 60-90 w (tightened) |
| **submitted delta** | — | **+13 w** | **+30 w** |

Per-line attribution is free. The cost is the block, and it is irreducible: you cannot direct two voices without spending words describing two voices. Bounded hard at `MAX_CAST=3` × `MAX_VOICE_CHARS=90`.

*Caveat on the 60-100 rule:* the **submitted** prompt already exceeds it (~135-175 w) because `rolesText` + negatives are appended outside the budget by design. The rule governs the descriptive body. This change follows the existing architecture rather than tightening it.

## Failure behaviour

Every degradation path lands on **today's exact output**, never on a confident wrong answer:

- LLM authors no cast → `toCast([]) === []` → no speaker on any scene → `buildVoiceBlock([]) === ""` → the prompt is byte-identical to before this existed.
- A line with no speaker → renders the legacy `(voiceover: "…")`.
- Legacy `storyboard_sheet` rows have no speaker → same path. `sceneSchema` uses `speaker: speakerSchema.optional().catch(undefined)` — **both modifiers load-bearing**: `parseScenes` returns `null` for the *whole array* on any failure, so requiring it would blank the script panel of every past run, and one malformed speaker must degrade its own field rather than null the array.

**Deliberately NOT done:** deriving a fallback cast by regex-parsing gender out of `personBrief`. A misparse applies the *wrong* voice confidently — strictly worse than letting Seedance infer. Degrade to today, never to wrong.

## Risks

**R1 — single-speaker ads may flip from voiceover to lip-sync.** A one-person ad whose cast picks `role: "the woman"` becomes a talking head rather than VO over b-roll. That is arguably more correct (the sheet draws a person; the board literally says "WOMAN SPEAKS EXCITEDLY") and is what was asked for — but it changes existing output, and lip-sync failures are more visible than a VO mismatch. Escape hatch: `role: "voiceover"`, with the prompt rule *"choose that only when the line is narration over the action and nobody is shown speaking"*. Watch the first real run; bias the rule toward `voiceover` if it over-picks on-screen roles.

**R2 — Seedance may ignore per-line attribution.** No source proves it honours a *per-line* speaker key; the documented pattern is a descriptor before a single quote. Two-speaker direction is at the edge of documented behaviour. This gives it the best available shot. If QA shows it failing, `research/04`'s recommended escape is post-dub — generate for lip-sync timing, overdub one consistent voice per character. **That is the only guaranteed fix, and it needs exactly this schema** (who says what, in which voice), so this work is its prerequisite, not a detour.

**R3 — the `beats.ts` one-liner.** `beatsToScenes` borrows a transcript by beat midpoint; if the speaker does not travel with it, the line is re-orphaned and the fix silently no-ops for every ≥2-video-slot template — the common case, with no error. Pinned by a dedicated test.

**R4 — cast/board contradiction.** If `supportingCast` reached the cast but not the sheet, the board would draw one person while two voices are directed. Both flow from the same block in the keyframe system prompt, so they cannot diverge.

**R5 — deliberate divergence from the normal pipeline.** `agents/video/prompt.ts` forces `supportingCast` **SILENT** (*"stay present and consistent but SILENT — no dialogue"*) and picks one voice verb per run. The template pipeline now lets a second character speak, because that character's voice *is* the bug. The pipelines are separate by design (the skill's golden rule); `agents/video/**` is untouched. Do not "unify" them without re-reading this.

## Open

- The normal pipeline has the same hole. `video/prompt.ts:437` (service ads) asks Seedance to *infer* each character's gender and self-consistently voice them — the same guess that failed here. `StoryboardScene.speaker` is shared and optional, so the fix is available to it; wiring is not done.
- No measurement yet of whether Seedance honours per-line keys. The first real two-character run is the experiment; `videos.provider_meta.videoPrompt` holds the submitted prompt for post-mortem.

## Update 2026-07-18: the normal pipeline's "character not talking" bug, and its fix

The normal pipeline shipped a live version of this bug, but the failure was different from the template pipeline's mis-voicing.
A UGC/testimonial run (with a product and a person) rendered a character whose mouth never moved - the spoken transcript played as a detached voiceover (run `aa5e7431`).

Two compounding causes, both fixed.

1. Silent downgrade to a voiceover ad type.
   On-camera lip-sync is bound to `lookFamily === "ugc_authentic"`, which only `testimonial` has; every other person-type narrates by design.
   But `reconcile.ts` `DOWNGRADE_CHAIN` routed `testimonial -> founder-pov / brand-story` (both `cinematic_polished`, i.e. voiceover) whenever no product was uploaded, because the `testimonial` def wrongly required a product.
   The def now matches its own skill doc and `research/00`: `testimonial` product is OPTIONAL, so a no-product "create a UGC ad" stays a talking testimonial (a pure talking-head endorsement) instead of being downgraded to a silent-presenter voiceover type.

2. The lip-sync directive was compressed away by the prompt-writer LLM.
   Even a correctly-classified testimonial only carried the "SPEAKS lip-synced, mouth visible" instruction inside the discretionary <=80-word LLM rewrite (`video/prompt.ts`), under a "be terse, front-load, never re-describe" budget.
   The LLM routinely dropped it, and the composed wrapper (`video/index.ts` `composePrompt`) added no talking backstop - so Seedance saw floating quotes with no lip-sync cue and treated them as ambient audio.
   The fix mirrors THIS file's template solution: a DETERMINISTIC, LLM-immune speech directive is now prepended in `composePrompt` for the talking looks (`ugc_authentic` + `service`) when a presenter has spoken lines - "the on-screen person SPEAKS every line themselves on camera, lip-synced with the mouth clearly visible and moving ... never a detached or off-screen voiceover".
   It is added only for the LLM tier (the deterministic prompt already bakes it in) and survives regardless of how the LLM compresses the body.

Deliberate scope.
Per the product decision, only the UGC/testimonial and service looks are forced to lip-sync; the cinematic looks (brand-story, founder-pov, lifestyle) stay voiceover-by-design and are untouched.
The normal pipeline still does NOT use per-line `speaker` keys (that stays a template-pipeline mechanism); it drives a single presenter's voice off the type + the person brief.
`founder-pov`'s dual speak/VO fragment wording is a known soft ambiguity, deferred to the per-ad-type prompt rebuild (its golden fixtures would otherwise churn).
