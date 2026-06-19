# Research prompt — Seedance 2.0 video prompting guide

> Attach `00-system-briefing.md` first, then paste this. If available, paste the outputs
> of `02` (taxonomy) and `03` (hooks) so the patterns key to real ids.

You are a video-generation prompt engineer specializing in **Seedance 2.0** (BytePlus /
ByteDance ModelArk). You've read the system briefing. In our pipeline, a `gpt-4.1` call
composes a short Seedance prompt from the storyboard scenes, then we submit it with a
labelled storyboard sheet (+ optional face reference) as image guidance, `generate_audio:
true`, and a `duration` (15s segments). We are expanding from 2 ad types to many, each
with hooks, and we need Seedance prompt **patterns per ad type + hook**.

## What we already believe (validate or correct this)

From our own testing we hold these principles — confirm, refine, or refute each with
reasoning:

- Seedance prompts should be **short (~60–100 words)**, not long. **More context tends to
  produce WORSE video.** We push realism into the still/storyboard image and keep the
  video prompt + scene description short.
- Prompt should use **explicit motion** described in **causal order** (what happens, then
  what happens next), with **short negatives** (don't over-list failure modes; naming
  failures can make them appear).
- Seedance **cannot clone a specific voice** — it synthesizes its own voice; we direct
  voice by description (age/gender/energy), not by reference audio.
- The labelled storyboard sheet is the only shot guide; reference sheets are not sent.

## What I need

1. **Validated best-practice guide.** A concise, current best-practice guide for Seedance
   2.0 prompting: the prompt structure it responds best to (global settings → time-slice
   storyboard → editing/quality directives, the `@Image N` reference convention), how it
   handles multi-image references, first/last-frame control, audio/voice direction,
   camera motion, and duration. Cite official BytePlus/Seedance docs or guidance where you
   can, and clearly separate "documented" from "community/empirical".

2. **Per-ad-type motion patterns.** For each ad type from prompt `02` (or by look-family
   if you don't have the list), a short reusable Seedance prompt **pattern/template** —
   the motion, pacing, camera, and audio style that suits it (e.g. a `testimonial` is a
   mostly-static talking-head with natural handheld micro-motion + lip-synced speech; a
   `product-showcase` is rotating/orbiting hero motion + voiceover; a `graphic_text` brand
   ad is kinetic-typography motion + music/voiceover). Keep each ≤100 words, as a fill-in
   template.

3. **Per-hook opening motion.** For each hook from prompt `03`, the **opening 2–4 second**
   motion/shot that sells that hook in video (e.g. `pattern-interrupt` = an abrupt,
   unexpected first frame + hard cut; `before-after` = a clean transition wipe/cut between
   two states). Short, droppable into the first time-slice.

4. **Audio / voice direction matrix.** How to direct the synthesized voice per ad type +
   hook (tone, pace, lip-synced on-camera vs. voiceover, music bed yes/no). Account for
   ad types with **no on-screen person** (voiceover/music only).

5. **Negatives policy.** A short, principled stance on negative prompts for Seedance
   (what to include, what to avoid naming), with examples per look family.

6. **Multi-segment continuity.** For our 30/45/60s merged ads, how to phrase prompts so 4
   independently-generated 15s clips feel like one ad (consistent voice, pacing, look)
   without frame-chaining.

## Output format

The best-practice guide as tight bullets (documented vs empirical separated). The
per-ad-type and per-hook patterns as fill-in templates in a table or JSON keyed by id, so
we can store them as prompt fragments. Cite sources inline.

## Constraints

- Bias toward SHORT prompts; if you disagree with our "short beats long" principle, prove
  it with reasoning/examples.
- Every pattern must be a concrete template a builder can fill and send, not advice.
- Distinguish official Seedance 2.0 documentation from empirical/community knowledge.
