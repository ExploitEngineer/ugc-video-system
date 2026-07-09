# 01 — Issues Diagnosis (Root Cause + Fix Direction)

This file diagnoses each problem you reported. For every issue: **what you're seeing → why it happens → the fix direction**. Concrete prompt fixes live in the model guides ([[04-gpt-image-2-guide]], [[05-seedance-2.0-guide]]); this file is the "why".

---

## Issue 1 — Faces are too detailed: visible pores + redness

### What you're seeing
gpt-image-2 renders faces with heavy micro-texture — visible pores, blotchy redness, sometimes an over-sharp "clinical" look. You want smooth-but-real skin, not fake-plastic and not dermatology-close-up.

### Why it happens — this is the important part
Almost every online guide tells you to **add** texture ("visible pores, subtle imperfections, no smoothing") because the *common* failure is the opposite: models over-smooth into a wax/plastic look. **You have the inverse problem.** So most advice you'll find is backwards for your case.

gpt-image-2 over-textures for four stacking reasons:

1. **It's a high-detail, high-resolution model.** gpt-image-2 supports up to 2K–4K output and renders skin at "full resolution — every pore" when nothing tells it not to. At 4K a close-up face *will* show pore-level detail by default.
2. **Texture/detail words in the prompt.** Anything like `hyper-detailed`, `8k`, `ultra-realistic`, `macro`, `every pore`, `skin texture`, `sharp`, `extreme detail` actively pushes it toward dermatological texture.
3. **Hard / directional lighting.** Harsh side light and strong specular highlights *sculpt* every bump and pore and exaggerate texture. This is the second-biggest cause after prompt words.
4. **Warm white balance + high saturation → redness.** A warm colour cast, strong contrast, and high saturation read as blotchy red/ruddy skin, especially on lighter complexions.

### Fix direction
Invert the usual advice. **Remove** texture cues, **soften** the light, **neutralise** the colour.

- Strip detail words: no `hyper-detailed`, `8k`, `macro`, `every pore`, `ultra sharp`, `textured skin`.
- Ask for the look you actually want: `smooth even skin, healthy natural complexion, soft editorial retouching (not heavy), clean clear skin, balanced skin tone`.
- Soften the light: `soft diffused lighting, softbox, north-facing window light, gentle fill, low contrast` instead of hard/harsh/dramatic side light.
- Kill redness at the colour level: `neutral white balance, balanced skin tones, no redness, no blotchiness, calm even complexion`, avoid `warm golden` + high saturation on close-ups.
- Lens/distance: shoot `85mm portrait, medium shot, moderate aperture (f/4)` — a portrait lens at a normal distance renders skin more flatteringly than a tight macro crop.
- **Key distinction to bake into your enhancer:** `editorial retouching` (keeps character, softer) vs `beauty retouching` (removes everything, risks plastic). For your goal, aim for "soft, natural, healthy skin" — between the two, leaning smooth.

> Nuance: don't over-correct into plastic. The target phrase is roughly *"natural, healthy, even skin with soft realistic shading"* — not "flawless airbrushed skin", which swings you back to the wax look.

---

## Issue 2 — Weird angles / distorted perspective

### What you're seeing
Faces and bodies at odd angles, strange proportions, warped features, unnatural framing.

### Why it happens
1. **No lens/focal length specified.** This is the #1 cause. With no focal length, the model defaults to an *ambiguous* perspective that rarely matches real photography — often something wide and distorting.
2. **Extreme/implied wide angles** stretch faces and exaggerate whatever's closest to camera.
3. **Stacking conflicting aesthetics** (e.g. "cinematic + editorial + dramatic + surreal") makes the model average into distortion.
4. **Vague subject** ("a person") with no age/build lets proportions drift.

### Fix direction
- Always inject a lens + perspective anchor: `85mm portrait lens, natural perspective` (tight/flattering) or `35mm, natural perspective` (environmental) or `50mm` (neutral).
- Add `no extreme wide-angle distortion, realistic proportions, natural perspective`.
- One subject, described concretely: age range + general build + one mood word.
- Don't stack style universes — pick one (`photorealistic` OR `cinematic` OR `editorial`, not all three).
- For the storyboard frames specifically, specify framing explicitly: `chest-up`, `medium shot`, `head-and-shoulders` — ambiguous framing invites weird crops.

---

## Issue 3 — Seedance video doesn't look like a real ad

### What you're seeing
Videos that feel obviously AI, not like a real ad someone shot. Off vibe, uncanny motion, "too much happening".

### Why it happens
1. **Prompt written as vague adjectives** ("cool ad, cinematic, amazing, lots of movement") gives the model no concrete direction, so it produces generic AI-looking motion.
2. **No lighting description.** Lighting is the single highest-leverage element in a Seedance prompt; without it, footage looks flat and synthetic.
3. **Over-polished framing.** Real ads (especially UGC) look handheld, imperfect, natural-light. Over-clean framing reads as CGI.
4. **Too many instructions / conflicting style + motion cues** → the model compromises and lands in the uncanny middle.

### Fix direction
- Write like a director, not an engineer: concrete subject + one specific action + real environment.
- Always add a lighting line (`soft golden-hour`, `soft natural window light`, `even overcast`). If you add one thing to any prompt, add lighting.
- Match realism to the ad type: UGC/testimonial → `handheld, natural light, everyday setting, slight camera shake`; brand/cinematic → `stabilised, gimbal, filmic contrast`.
- Keep it inside 60–100 words, every word earning its place. Cut `beautiful/amazing/epic/cinematic (alone)`.
- Use a reference image (image-to-video) whenever possible — the storyboard frame gives the model a stable identity + composition to animate, which is far more realistic than pure text-to-video.

---

## Issue 4 — Weird moments / morphing / bad things happening mid-video

### What you're seeing
Faces morph, limbs bend/warp, objects distort, identity drifts across the clip, doubled features, "cursed" moments.

### Why it happens
1. **Too much motion.** Fast movement forces the model to interpolate between frames; that's exactly where it loses facial landmarks and morphs.
2. **Multiple / conflicting camera moves** ("push in, then pan, then orbit, zoom out") → jitter and incoherence.
3. **Camera movement mixed with subject movement** in one phrase ("spinning camera around a dancing person") — the single most common mistake; it produces uncontrollable, shaky, warping video.
4. **`fast` keyword** — the single most quality-degrading word. Fast camera + fast cuts + busy scene ≈ guaranteed artifacts.
5. **Temporal drift on longer clips** — identity and features slowly change frame to frame, worse without a reference image.

### Fix direction
- **One camera move + one subject action. That's the rule.** (Straight from Sora 2 / Seedance best practice.)
- Pace everything slow/smooth: `slow, gentle, gradual, smooth, stable, steady`. Never leave `fast` unqualified.
- Separate the two motions into different sentences: *"The dancer spins slowly. The camera holds a fixed frame."*
- Add identity/anatomy negatives every time a person is on screen: `avoid identity drift, avoid morphing, avoid bent limbs, avoid deformed face, avoid extra fingers, avoid temporal flicker, anatomically correct`.
- Use a reference image to lock identity; it dramatically reduces drift.
- If only one region morphs, fix it with post/inpaint on that region rather than regenerating the whole clip.
- Keep clips short and merge (which your pipeline already does via ffmpeg) — shorter segments drift less than one long generation.

---

## Cross-cutting root causes (the pattern behind all four)

| Root cause | Shows up as | Universal fix |
|---|---|---|
| Missing lighting description | flat/fake images & video | Add one concrete lighting line — highest leverage word in any prompt |
| Missing lens / camera language | weird angles, distortion | Inject focal length + `natural perspective, no extreme wide-angle` |
| Detail/quality words misused | over-textured skin, pores, redness | Remove `8k/macro/hyper-detailed/every pore`; add soft-skin + neutral-WB terms |
| Too much motion at once | morphing, jitter, weird moments | One camera move + one subject action; pace slow; identity negatives |
| Vague adjectives instead of direction | generic AI look | Replace `beautiful/epic/cinematic` with concrete, specific description |
| No negatives / constraints | recurring artifacts | Keep a tight, issue-focused negative list per model |

**Meta-lesson:** realism is *specific and softer*, not *louder*. Adding `ultra realistic, 8k, masterpiece` makes things worse; describing what a real camera, real light, and real skin do makes things better.

---

## Sources
- QuestStudio — [Make AI Images Look Real](https://queststudio.io/blog/make-it-look-real-prompt-rules)
- AI Art Revolution — [ChatGPT Image Prompts for Realistic Portraits (GPT Image 2)](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- Apiyi — [Seedance 2.0 Official Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- Kling — [Fix AI Video Drift & Consistency](https://kling.ai/blog/fix-ai-video-drift-consistency-guide)
- QuestStudio — [Prevent Face Warping in Image-to-Video](https://queststudio.io/blog/prevent-face-warping-image-to-video)
