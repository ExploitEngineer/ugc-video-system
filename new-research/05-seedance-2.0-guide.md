# 05 — Seedance 2.0 Prompting Guide (Video)

Everything for the video stage: what the model is, the official 6-step formula, camera/lighting/motion rules, negatives, and image-to-video specifics (your main path).

---

## What Seedance 2.0 is (capabilities)
- ByteDance video model (served via BytePlus **ModelArk**). The standout: it's the **first quad-modal** video model — accepts **text + image + video + audio** input simultaneously.
- **Native audio**, up to **~15 second** clips, output up to **2K**, generation in under a minute.
- In a strong prompt: **text defines the world, images lock identity, video guides movement, audio shapes rhythm/sound.**
- **Input limits (ModelArk):** images JPEG/PNG/WebP (max 9, <30MB each), video MP4/MOV (max 3 clips, 2–15s, for motion reference), audio MP3/WAV (max 3, <15s), total ≤12 files.
- ⚠️ **Real-face policy:** BytePlus blocks uploads of identifiable **real** face photos. Your person reference sheets are AI-generated (not real people), so you're fine — but keep this in mind if you ever ingest real customer footage for testimonials. Flag for Step 2.

### Practical implications for Revonix
1. Your pipeline animates a **storyboard image → 15s clip**, so **image-to-video is your primary mode.** Optimize prompts for that (below).
2. You can feed a short **audio** clip or describe audio in text to shape dialogue/SFX rhythm — useful for UGC/testimonial lip-feel and pacing.
3. Because clips are short and you merge with ffmpeg, keep each segment's motion simple; drift compounds over length.

---

## The official 6-step formula
```
[Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid [Constraints]
```
Target **60–100 words**. The **first 20–30 words carry the most weight** — lead with who + what they're doing before anything else.

| Step | Rule | Example |
|---|---|---|
| 1. Subject | concrete visual features | "A young woman in a white dress" |
| 2. Action | specific verb, quantified intensity | "slowly turns, breeze lifting the skirt" |
| 3. Environment | include lighting + atmosphere | "seaside at dusk, golden glow" |
| 4. Camera | **one** primary instruction | "camera slow push-in" |
| 5. Style | specific reference | "cinematic film tone, 35mm" |
| 6. Constraints | exclude common issues | "avoid jitter and bent limbs" |

**Good vs bad:**
- ✅ `A skateboarder lands a clean trick in an empty dawn parking lot, camera low tracking shot then subtle rise, modern cinematic contrast, 6 seconds, 16:9, avoid jitter and bent limbs.`
- ❌ `cool skateboard video, cinematic, fast, amazing tricks, lots of movement, epic style.`

---

## Camera language (highest-leverage after lighting)
The 8 supported camera types:

| Type | Term | Best for |
|---|---|---|
| Push-in | push-in / dolly in | emotional focus, close-up emphasis |
| Pull-out | pull-out / dolly out | reveal, spatial context |
| Pan | pan / lateral motion | tracking, scanning a scene |
| Tracking | tracking / follow | walking characters, action |
| Orbit | orbit / arc | product showcase, portraits |
| Aerial | aerial / drone | scale, landscapes |
| Handheld | handheld | documentary, UGC realism |
| Fixed | fixed / locked-off | focus on subject action |

**Three camera rules:**
1. **One primary instruction.** `camera slow push-in` ✅ — not `push-in, then pan, zoom out, orbit` ❌. For compound moves, primary then subtle secondary: `low tracking shot then subtle rise`.
2. **Rhythmic words, not tech specs.** `slow, smooth, stable, gradual, gentle` ✅ — not `24fps, f/2.8, ISO 800` ❌. Talk to it like an editor.
3. **Separate camera motion from subject motion.** Two sentences: *"The dancer spins slowly. Camera holds a fixed frame."* Mixing them in one clause is the #1 cause of shaky/warping video.

**Speed keywords:** extremely slow (`imperceptible, barely`) · slow (`slow, gentle, gradual`) · medium (`smooth, controlled`) · fast (`dynamic, swift` — use with caution). ⚠️ **`fast` is the single most quality-degrading word.** Only ever let *one* element be fast.

---

## Lighting (the #1 leverage element)
Adding one lighting line beats ten adjectives. Menu:

| Keyword | Use |
|---|---|
| golden hour | warm, aspirational |
| rim light | edge separation against dark bg |
| natural / window light | soft, documentary |
| neon | night, urban |
| backlit | silhouette, mood |
| overcast | even, soft, realistic |

---

## Style keywords
`cinematic film tone, 35mm` · `4K, high detail, sharp` · `film grain, analog, vintage` · `warm tone / cool palette / desaturated` · `moody / dreamy / ethereal` · `realistic / natural / documentary`. Never use `cinematic` **alone** (too vague) — always qualify it.

---

## Negative prompts (trim to the failure)
| Negative | Excludes | When |
|---|---|---|
| avoid jitter | shaking | all videos |
| avoid bent limbs | distorted limbs | people |
| avoid temporal flicker | frame-to-frame flicker | longer clips |
| avoid identity drift | face/feature drift | character consistency |
| avoid morphing | warping features | people/products |
| avoid chaotic composition | messy frame | complex scenes |

**Words that quietly lower quality:** `fast` (→ make one element fast), `cinematic` alone (→ qualify it), `epic` (→ describe the effect), `amazing/beautiful` (→ concrete lighting/composition), `lots of movement` (→ one specific motion).

---

## Image-to-video (your primary mode) — do this
With a storyboard frame as input, **don't re-describe appearance** — describe **motion + camera + preservation**:
```
Animate the provided image. Preserve composition, colors, identity, and product shape.
Add [one subtle subject action]. Camera: [one slow move]. Keep consistent lighting.
[duration] seconds. Avoid identity drift, avoid morphing, avoid temporal flicker.
```
- Emphasize `preserve composition and colors` — this is what keeps the clip faithful to your storyboard.
- Camera move must **align with the image composition** (don't orbit a flat straight-on product shot into geometry it can't infer).
- One subtle motion is enough (a smile, a head turn, steam rising, a hand raising the product).

---

## Text-to-video (fallback) — full 6-step
```
A lone astronaut walks across an amber desert under twin moons, camera slow lateral
tracking, cinematic sci-fi tone, 8 seconds, 16:9, avoid temporal flicker.
```

---

## Iteration + template management (bake into QA)
**One variable at a time:** baseline → change one element → score (continuity, adherence, usability) → pick best.

**Three-tier templates** to store per ad type:
- **Starter** — short, validate direction fast.
- **Production** — strict camera + consistency constraints, for final delivery.
- **Fallback** — highly simplified, "back to basics" when output is unstable.

**Pre-render checklist:** read it as an outsider · cut redundant adjectives · confirm ONE primary camera move · constraints achievable · no style-vs-motion conflict.

---

## Fix recipes (fast triage)
| Symptom | First change |
|---|---|
| Jitter/shaky | one camera move only; add pacing words; `avoid jitter` |
| Morphing / face warp | reference image; `avoid morphing/identity drift`; slow the motion |
| Doubled/melting features | remove `fast`; one subject action; shorten clip |
| Looks fake/flat | add a lighting line; match handheld-vs-gimbal to ad type |
| Product distorts | `preserve product shape`; orbit only if geometry supports it |
| Generic AI vibe | replace adjectives with concrete direction; specific environment |

---

## Sources
- BytePlus ModelArk — [Seedance 2.0 prompt guide (official)](https://docs.byteplus.com/en/docs/ModelArk/2222480) · [tutorial](https://docs.byteplus.com/en/docs/ModelArk/2291680)
- Apiyi — [Seedance 2.0 Official Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- Seedance — [Product Demo Video Generator workflow](https://www.seedance.tv/blog/seedance-product-demo-video-generator-2026)
- Kling — [Fix AI Video Drift & Consistency](https://kling.ai/blog/fix-ai-video-drift-consistency-guide)
