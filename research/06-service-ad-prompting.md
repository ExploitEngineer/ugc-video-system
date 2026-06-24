# Service-ad prompting spec (build-ready)

Source: deep-research run 2026-06-24 (`wf_9b38a991-b95`) — 5 angles, 21 sources fetched, 95 claims extracted, 25 adversarially verified (3-vote): **18 confirmed, 7 killed**. The synthesis agent returned a stub, so this spec is hand-authored from the verified claim set + the kills (what NOT to do). Sources at the bottom.

**Goal:** generate a SERVICE-based ad (SaaS, agency, local service, coaching) from a short text prompt + optional brand guidelines, **no uploads**, synthesized cast, fully prompt-driven (no hardcoded beat template). Stack: gpt-image-2 (one labelled multi-panel storyboard sheet) → Seedance 2.0 (live-action clip(s) + native audio).

---

## 1. Prompt-improvement / creative-director step (short prompt → rich brief)

**Verified:** A winning short-ad = **Hook → Body → CTA** (confirmed 3-0). **PAS** (Problem→Agitate→Solution) is an explicit conflict→resolution arc (confirmed 2-1). There are several named frameworks — **PAS, AIDA, BAB (Before-After-Bridge), UGC testimonial, product-demo** — each with its own beats; pick ONE dynamically, don't force a single template (confirmed 3-0). Map the user's prompt onto **Schwartz's 5 awareness stages** (Unaware → Problem-Aware → Solution-Aware → Product-Aware → Most-Aware) to choose framework + hook (confirmed).

**Build:** an LLM "creative director" step takes the short service description and emits a STRUCTURED brief:

```
{
  service: "<one-line what it does>",
  audience: "<who>", awarenessStage: "problem-aware" | ...,
  framework: "PAS" | "AIDA" | "BAB" | "testimonial" | "demo",
  hook: { type: "stat" | "question" | "pain" | "pattern-interrupt" | ..., line: "<the spoken/on-screen hook>" },
  cast: [ { role: "stressed marketer", identity: "<detailed identity block: age, build, hair, skin, wardrobe>" }, ... ],
  scenes: [ { setting, lighting/grade, who, action, dialogue?, onScreenText? }, ... ],  // 3-4, beats of the chosen framework
  cta: { line, endCard: { headline, tagline, url } }
}
```

The scene list IS the arc — derived from `framework`, not a fixed timeline. **Killed (don't do):** a rigid second-by-second template (Hook 0-3s / Context 3-5s / Promise 5-10s …) — refuted 0-3; timing must stay flexible.

## 2. gpt-image-2 storyboard (multi-scene, synthesized cast, on-screen text)

- **Storyboard-FIRST is load-bearing** (confirmed 3-0): define characters + style + shot sequence in the labelled sheet BEFORE video; direct-to-video without it gives "face deformation" / "unstable visuals." (We already do storyboard→video.)
- **Synthesized-character identity:** write a detailed **identity block per character** (face, age, build, hair, skin, wardrobe, palette) and let the **sheet be the anchor** for cross-scene consistency. **Killed:** relying on *verbatim restatement of descriptors in every prompt* as the primary mechanism (refuted 1-2) — anchor in the sheet instead.
- **On-screen text:** put the **literal copy in quotes** in the prompt (the stat hook, a price, the end-card headline/tagline/URL) — confirmed for legibility. One text element per frame; keep it short.
- **Multi-scene:** distinct setting + lighting per panel is fine; a deliberate **color-grade shift between scenes** (e.g. tense → resolved) goes in the panel descriptions.
- **`input_fidelity`:** unsupported on gpt-image-2 (already high-fidelity) — do NOT pass it (confirmed; we already don't).

## 3. Seedance 2.0 (multi-scene live-action skit + audio)

- **Don't restate** what the storyboard already carries (identity/wardrobe/look) — the Seedance prompt rides the sheet (confirmed 3-0; matches our existing tuning).
- **Dialogue:** `Character speaks in English: "<line>"` — speech **in quotes with a language tag**; keep lines **5-10 words**; avoid tongue-twisters. **Killed:** the `{braces}` dialogue syntax (refuted 0-3) — use quotes+tag, not braces.
- **Multi-person lip-sync matching is UNSOLVED** (confirmed 3-0). So for a 2-3 actor skit: **one speaker per shot**, cut to each speaker in sequence, OR use off-screen voiceover — never two mouths talking at once. Seedance handles up to ~3 simultaneous audio tracks (confirmed 2-1), but reserve overlap for ambience/score, not dialogue.
- **No strict per-shot durations** (the timeline-with-fixed-seconds claim was partly refuted 1-2) — describe beats in event order, let the model time them.

## 4. Hooks — dynamic, service/B2B-oriented

**Verified taxonomy (7 formulas, confirmed 3-0):** Question, **Stat**, Pain Point, Transformation, Testimonial, **Pattern Interrupt**, Curiosity Gap. (Corroborated by VidTao's empirical set: pattern-interrupt, stat-shock, bold reframe/curiosity, etc., and Komet's 10 B2B categories.)

**Selection (don't hardcode one):** map prompt → awareness stage → hook type. Decompose each hook into an **audio line + a visual frame** (confirmed) rather than a monolith — fits our existing visual-lead + opening-directive model.

**Killed:** "stat hooks resonate BEST for B2B" (refuted 1-2) — stat is ONE strong option, not universally best; pick by the prompt.

**Build impact:** service ads need a **stat hook** and a **bold-question hook** that we DROPPED in Chunk 2 (cold-open visual-only set). Re-add a small service-hook set (stat, question, pain, pattern-interrupt) usable by the `service` type, selected dynamically by the creative-director step.

## 5. Category-agnostic + brand guidelines

- Keep it **general**: the creative-director step infers cast/setting/arc from the service text — no per-category template.
- **Brand:** front-load a reusable **"brand prefix block"** (palette, tone, logo usage, do/don'ts) injected into BOTH the image and the video prompts (confirmed approach). End-card uses the brand logo + colors + tagline/URL (literal text in quotes).

---

## Refuted — do NOT do (the 7 kills)

1. Seedance `{braces}` dialogue syntax → use `speaks in English: "..."`.
2. Rigid second-by-second ad template (Hook 0-3s, …) → flexible framework beats.
3. "Stat hooks are best for B2B" universal → pick the hook from the prompt.
4. Verbatim character-descriptor restatement as the PRIMARY consistency lever → storyboard sheet is the anchor.
5. LTX-style "hold scene+subject constant, vary only camera+duration" JSON rule (tool-specific) → not for our stack.
6. Identity via a "top reference strip matched verbatim in Seedance" → sheet anchor + don't restate in Seedance.
7. Strict per-shot durations forced on Seedance → event-order beats.

## Failure modes → mitigations

| Failure | Mitigation |
|---|---|
| Two actors lip-sync at once → garbled | one speaker per shot / sequential cuts / VO |
| Synthesized character drifts across scenes | identity block + storyboard-sheet anchor; same wardrobe |
| Garbled on-screen stat/end-card text | literal copy in quotes, short, ONE text element/frame |
| Over-stuffed Seedance prompt | terse; don't restate the sheet's identity/look |
| Generic/templated ad | creative-director infers framework+hook from the prompt + awareness stage |

## Maps to Chunk S (build)

- Register `service` ad-type (default; no required uploads; synthesized cast; optional brand).
- **Creative-director step** = the prompt-improvement: short prompt → the structured brief above (framework + hook + cast + scenes + CTA), awareness-stage-driven.
- **Re-add service hooks** (stat, question, pain, pattern-interrupt) for dynamic selection.
- **Storyboard prompt:** multi-scene, per-character identity blocks, on-screen text in quotes, an end-card panel.
- **Video prompt:** per-scene beats, dialogue `speaks in English: "..."` (one speaker/shot), brand prefix block, no restated identity.

## Sources

- OpenAI Cookbook — image-gen prompting guide (primary): https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- BytePlus ModelArk Seedance docs (primary): https://docs.byteplus.com/en/docs/ModelArk/2222480
- Seedance 2.0 audio/dialogue/lip-sync guide: https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/
- Seedance 2.0 limitations: https://videoai.me/blog/seedance-2-0-limitations
- gpt-image-2 → Seedance 2.0 workflow: https://oimi.ai/en/blog/gpt-image-2-seedance-2-workflow
- Prompting gpt-image-2 (fal.ai): https://fal.ai/learn/tools/prompting-gpt-image-2
- Hook taxonomy (VidTao): https://blog.vidtao.com/top-9-hook-tactics-we-extracted-from-todays-top-direct-response-youtube-ads/
- B2B sales-video hooks (Komet): https://www.kometmedia.com/blogs/100-hook-examples-for-b2b-sales-videos
- Hook frameworks: https://predictive-marketing.com/2025/11/17/video-ad-hook-frameworks-3-seconds-that-decide-your-roi/
- Awareness stages (Schwartz): https://www.mxmoritz.com/article/stages-of-awareness
- Video-ad structure frameworks: https://benly.ai/learn/ad-creative/video-ad-structure-frameworks
- AIDA/PAS copywriting models: https://leadenforce.com/blog/aida-pas-and-beyond-classic-copywriting-models-in-the-age-of-digital-ads
- Hook-Body-CTA: https://sovran.ai/blog/hook-body-cta-video-ad-structure
- Brand consistency in AI images/video (Leonardo): https://leonardo.ai/news/maintaining-brand-consistency-in-ai-images-and-videos
- AI brand guidelines (WordStream): https://www.wordstream.com/blog/ai-brand-guidelines
