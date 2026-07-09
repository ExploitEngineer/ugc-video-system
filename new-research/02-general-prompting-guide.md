# 02 — General Prompting Guide (Both Models)

Universal rules that apply to **both** gpt-image-2 and Seedance 2.0, plus the logic your prompt-enhancement layer should follow (take the user's raw prompt, upgrade only what's missing, leave good prompts alone).

---

## The 10 universal rules

1. **Realism is specific, not louder.** `ultra realistic, 8k, masterpiece` makes output *more* synthetic. Describe what a real camera captures, how real light behaves, what real skin/materials look like. This is the single most important mindset.
2. **Lighting is the highest-leverage element.** If you can only add one thing to any prompt, add a concrete lighting line. "A person walking" vs "A person walking in soft golden-hour light" is a night-and-day difference.
3. **Specify the lens / camera.** A focal length (`35mm`, `50mm`, `85mm`) carries huge implied information and stops the model inventing weird perspective. Missing lens = weird angles.
4. **Front-load what matters.** Both models weight the *opening* of the prompt most. Lead with subject + core action; put grade/mood/quality at the back.
5. **Length has a sweet spot.** Images: ~50–70 words (gpt-image-2 gets "prompt bleeding" past ~70). Video: 60–100 words. Too short = generic; too long = averaged/conflicting.
6. **One visual universe.** Don't stack `photorealistic + cinematic + editorial + surreal`. Pick one. Conflicting styles → the model compromises and satisfies none.
7. **Replace adjectives with direction.** `beautiful/amazing/epic/stunning/cool` give zero visual info. Swap for one emotional word (`contemplative`, `warm`, `confident`) + concrete description.
8. **Constraints/negatives are part of the prompt, not an afterthought.** Keep them *tight and issue-focused* — a 20-item negative list confuses the model. Fix the problem you actually have.
9. **Change one variable at a time when iterating.** Generate 2–3, change a single element, compare, keep the best. If you change three things you'll never know what worked.
10. **Reference images beat text.** A storyboard frame (image-to-video) locks identity + composition far better than describing it in words — this is central to your pipeline and should be the default path.

---

## The universal skeleton

Both models share the same backbone. Read it as: **who → doing what → where (with light) → shot how → in what style → what to avoid.**

```
[Subject, concrete] , [one specific action] , in [environment + lighting] ,
[one camera instruction] , [one style/grade] , [tight constraints/negatives]
```

For **images** drop the motion/audio parts; for **video** keep them and add pacing words.

---

## Word lists to hard-code into the enhancer

### Green-light words (push toward realism)
- **Lighting:** soft natural light, north-facing window light, softbox, golden hour, overcast diffused, rim light, gentle fill, catchlights.
- **Camera:** 35mm / 50mm / 85mm lens, natural perspective, shallow/moderate depth of field, sharp focus on eyes, medium shot, chest-up.
- **Skin (your case):** smooth even skin, healthy natural complexion, soft editorial retouching, balanced skin tone, neutral white balance, clear calm complexion.
- **Motion (video):** slow, gentle, gradual, smooth, stable, steady, subtle, handheld drift.
- **Realism anchors:** photorealistic, documentary, natural color grade, realistic proportions, candid, "found not made".

### Red-flag words (strip or down-weight)
- **Quality-killers (video):** `fast` (unqualified), `epic`, `amazing/beautiful`, `cinematic` used *alone*, `lots of movement`.
- **Over-texture triggers (your skin issue):** `8k`, `hyper-detailed`, `macro`, `every pore`, `ultra sharp`, `extreme detail`, `textured skin`.
- **Distortion triggers:** extreme wide-angle, fisheye, stacked style words, `surreal` (unless intended).
- **Plastic triggers (opposite failure — avoid over-correcting):** `flawless`, `airbrushed`, `perfect skin`, `beauty filter`.

---

## Negative-prompt starter sets

**Images (gpt-image-2):**
```
no plastic skin, no over-smoothing, no heavy retouching, no redness, no blotchy skin,
no warped hands, no extra fingers, no deformed face, no extreme wide-angle distortion,
no text, no watermark, no logo
```

**Video (Seedance 2.0):**
```
avoid jitter, avoid bent limbs, avoid deformed face, avoid extra fingers,
avoid identity drift, avoid morphing, avoid temporal flicker, avoid chaotic composition
```
Trim to the 3–4 that match the actual failure — don't ship all of them every time.

---

## The prompt-enhancement logic (your pipeline's core job)

Your system takes a **user-typed prompt** and should upgrade it only when needed. Here's a decision procedure the enhancer can follow.

### Step 1 — Parse the user prompt for the required layers
Check whether each layer is present:

| Layer | Present? | If missing, inject… |
|---|---|---|
| Subject (concrete) | ? | age range + build + one detail |
| Action (single, specific) | ? | one clear verb; split if multiple |
| Environment | ? | a real setting that also implies light |
| **Lighting** | ? | **always inject if missing — highest leverage** |
| Camera / lens | ? | `85mm`/`50mm`/`35mm` + `natural perspective` |
| Style / grade | ? | one universe matching the ad type |
| Audio (video only) | ? | dialogue for people, SFX for objects |
| Constraints / negatives | ? | the issue-matched negative set |

### Step 2 — Detect and remove quality-killers
Scan for red-flag words. Strip or rewrite: `fast → slow/smooth`, `8k/hyper-detailed → (remove)`, `cinematic (alone) → cinematic film tone, 35mm, warm`, `epic/amazing → concrete description`.

### Step 3 — Enforce the motion rule (video)
If the prompt mixes camera + subject motion in one clause, split into two sentences. If more than one camera move, keep the primary, demote the rest.

### Step 4 — Decide: rewrite or leave alone
> **Leave the prompt alone if** it already contains: concrete subject + single action + environment + lighting + one camera instruction + at least a minimal constraint, and it contains **no** red-flag words. Otherwise, enhance.

This matches your intent exactly: if the user's prompt is already good, don't touch it; if it's missing layers or contains killers, upgrade it to the model-optimal version.

### Step 5 — Respect the length sweet spot
After injection, trim filler so images stay ~50–70 words and video ~60–100. If injection pushed it over, cut adjectives first, then least-important layer.

---

## Iteration loop (bake into QA)
1. Generate 2–3 candidates from the enhanced prompt.
2. Change exactly one element (lighting OR camera OR motion intensity).
3. Score on continuity, instruction-adherence, and how "real" it reads.
4. Keep the winner; store it as a reusable template (see the three-tier template idea in [[05-seedance-2.0-guide]]).

---

## Sources
- QuestStudio — [Make AI Images Look Real](https://queststudio.io/blog/make-it-look-real-prompt-rules)
- Apiyi — [Seedance 2.0 Official Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- AI Art Revolution — [ChatGPT Image Prompts for Realistic Portraits](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- Medium — [How to Write Better Prompts for AI-Generated Video Clips](https://medium.com/ai-music/how-to-write-better-prompts-for-ai-generated-video-clips-813aea1ac041)
