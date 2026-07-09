# Revonix — Prompting & Model Realism Research (Index)

> Research pass for the Revonix ad-video generation system.
> Scope: diagnose the image/video realism problems (over-textured skin, redness, weird angles, unrealistic video, weird moments/morphing), build prompting guides per model + per ad type, and validate the proposed prompting formula.
> Models in scope: **gpt-image-2** (image/storyboard frames) and **Seedance 2.0** (video). Claude Sonnet reasoning layer intentionally deferred to Step 2.
> Date: 2026-07-06

---

## How to read this folder

The research is split into granular files so each topic is self-contained. Start with the diagnosis, then the general guide + formula verdict, then dive into the model-specific and ad-type files.

| # | File | What it covers |
|---|------|----------------|
| 01 | [[01-issues-diagnosis]] | Root-cause analysis of every problem you reported: pores/redness, weird angles, unrealistic video, weird moments/morphing. WHY each happens + the fix direction. |
| 02 | [[02-general-prompting-guide]] | Universal rules that apply to both models: structure, length, lighting-first, negatives, iteration, the "enhance the user's prompt" logic. |
| 03 | [[03-prompting-formula-review]] | Verdict on your `subject → action → scene → camera → lighting → style → audio → QS → constraints` formula. Is it recommended? (Short answer: yes, with tweaks.) |
| 04 | [[04-gpt-image-2-guide]] | Full gpt-image-2 guide: capabilities, parameters, the Five-Layer portrait framework, skin/angle fixes, templates, negatives. |
| 05 | [[05-seedance-2.0-guide]] | Full Seedance 2.0 guide: quad-modal input, 6-step formula, camera language, lighting, motion, negatives, image-to-video specifics. |
| 06 | [[06-adtype-service-ad]] | Service ad: theory + recommended image & video prompt templates. |
| 07 | [[07-adtype-ugc-testimonial]] | UGC / testimonial: authenticity engineering, dialogue realism, templates. |
| 08 | [[08-adtype-brand-story]] | Brand story: narrative arc, cinematic look, templates. |
| 09 | [[09-adtype-inspirational]] | Inspirational: emotional beats, montage pacing, templates. |
| 10 | [[10-adtype-product-demo]] | Product demo: product fidelity, feature focus, templates. |
| 11 | [[11-adtype-lifestyle]] | Lifestyle: candid realism, environment, templates. |
| 12 | [[12-adtype-founder-story]] | Founder story: talking-head authenticity, trust, templates. |

---

## The 60-second version (executive summary)

1. **Your skin problem is the opposite of the normal AI problem.** Most people fight *plastic/over-smoothed* skin. You're fighting *over-detailed* skin (visible pores, redness). That means most online advice ("add pores, add texture") is exactly wrong for you — you need to **reduce** texture cues, soften lighting, and neutralise the warm/red cast. See [[01-issues-diagnosis]].

2. **Weird angles = missing lens + camera language.** When you don't specify a focal length and perspective, the model invents an ambiguous one. Specifying `85mm portrait lens, natural perspective, no extreme wide-angle` removes most weirdness. See [[01-issues-diagnosis]] and [[04-gpt-image-2-guide]].

3. **Weird video moments = too much motion at once.** Seedance drifts/morphs when you combine fast motion + multiple camera moves + busy scenes, or mix camera movement with subject movement in the same phrase. The rule is **one camera move + one subject action**, slow/smooth pacing, and identity-lock negatives. See [[05-seedance-2.0-guide]].

4. **Lighting is the single highest-leverage word in any prompt** — for both models. One good lighting line beats ten adjectives.

5. **Your formula is basically correct.** It's the industry-standard Seedance structure with audio added. Keep it; just make `audio` and `QS` conditional and let `lighting` float forward. See [[03-prompting-formula-review]].

6. **Prompt-enhancement logic (your pipeline's job):** take the user's raw prompt, detect what's missing (lens? lighting? single action? negatives?), inject the missing layers, strip quality-killing words (`fast`, `epic`, `8k`, `hyper-detailed`), and only rewrite when something is missing or conflicting. If the user's prompt already has subject + action + lighting + one camera move + constraints, leave it alone. Full rules in [[02-general-prompting-guide]].

---

## Sources
- OpenAI — [Introducing ChatGPT Images 2.0](https://openai.com/index/introducing-chatgpt-images-2-0/) and [GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)
- BytePlus ModelArk — [Seedance 2.0 prompt guide (official)](https://docs.byteplus.com/en/docs/ModelArk/2222480)
- Apiyi — [Seedance 2.0 Official Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- QuestStudio — [Make AI Images Look Real](https://queststudio.io/blog/make-it-look-real-prompt-rules) and [Prevent Face Warping in Image-to-Video](https://queststudio.io/blog/prevent-face-warping-image-to-video)
- AI Art Revolution — [ChatGPT Image Prompts for Realistic Portraits (GPT Image 2)](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- ugcmaker.org — [UGC AI Video Prompts: 12 Templates](https://ugcmaker.org/blog/detail/UGC-AI-Video-Prompts-12-Copy-and-Paste-Templates-for-Better-Ads-a45dfaf0ecf3/)
- Kling — [Drift in AI-generated Video](https://kling.ai/blog/fix-ai-video-drift-consistency-guide)


---

## Step 2 — System audit & refactor (added after reviewing the real pipeline)

These files compare the actual Revonix codebase (prompts, pipeline, hooks) against the research above and give an actionable, phased refactor to hand to Claude Code.

| # | File | What it covers |
|---|------|----------------|
| 13 | [[13-refactor-master-plan]] | The spine: every confirmed root cause → concrete file changes, phased; model-return contracts; prompt-size budgets; regenerate-on-failure design; edge-case matrix. |
| 14 | [[14-hooks-redesign]] | Why hooks repeat (dead ids, ignored `fitsAdTypes`, default-dominance); the fix + corrected per-type hook mapping. |
| 15 | [[15-how-to-drive-claude-code]] | How to run the refactor with Claude Code: phasing, what context to give it, guardrails (CLAUDE.md HARD RULES), the golden-test gotcha, copy-paste kickoff prompts per phase. |

**Top confirmed root causes (from the code):**
1. Over-textured/red skin is **self-inflicted** — "VISIBLE PORES / no skin smoothing / film grain" hard-coded in the person sheet, the storyboard, AND the UGC video prompt; white balance controlled only on products, never on faces.
2. `service` sends Seedance a **contradictory** payload — "clean CUT between each" vs an appended "ONE continuous take, no cuts."
3. Each 15s clip renders **4 panels + 4 lip-synced lines** — too much for one generation (morph/weird-moment risk).
4. Seedance is fed an **annotated 2×2 contact sheet** (badges + caption bars) that the prompt then fights to suppress.
5. Prompts are **bloated** (~200-line storyboard system prompt, 150-200w imagePrompt) past the models' attention budgets.
6. Hooks **collapse to the same default** — the curated `fitsAdTypes` fit data is never read, and several types point at dead hook ids.
