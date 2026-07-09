# 11 — Ad Type: Lifestyle

> Goal: show the product/brand woven naturally into an aspirational-but-relatable daily life. Sits between UGC (authentic) and brand story (polished) — think "editorial candid": real feeling, nice light.

---

## Theory — aspirational realism
- **Candid, not posed.** The magic phrase is "found, not made" — the scene should feel *observed*, not staged. AI defaults to centered/posed; you must push against it.
- **Environment tells the story.** The setting does double duty: it conveys the lifestyle *and* creates the lighting. Choose settings that imply nice natural light (sunlit kitchen, café, park).
- **Product is present, not shouted.** It lives in the scene (on the counter, in hand) rather than being hero-framed.
- **Warm, natural, slightly imperfect.** A touch of motion/film grain, genuine expressions.

## Arc (60s → 4×15s)
1. Morning/setting establish (lifestyle world + light).
2. Product naturally in the routine.
3. A genuine human moment (laugh, pause, connection).
4. Content resolution (satisfied, in-the-moment).

---

## Image (gpt-image-2) guidance
- Style anchor: `photorealistic candid lifestyle photo`, `editorial documentary`.
- Lighting: `soft natural daylight`, `warm window light`, `overcast soft` — natural sources tied to the setting.
- Lens: `35mm` (natural, environmental) or `50mm, f/1.8` for a warmer candid.
- Direction cues that force candid: `not posed`, `caught mid-moment`, `genuine`, `natural motion`.
- Skin: soft-real line; lifestyle faces should look healthy and natural, never red/harsh.

**Template — candid lifestyle frame:**
```
Photorealistic candid lifestyle photo of a [age] [gender] [doing a simple daily action]
in [sunlit real setting], [product] naturally present. Soft warm natural daylight,
gentle shadows, neutral-to-warm white balance. 35mm lens, natural perspective, moderate
depth of field, caught mid-moment, not posed. Smooth healthy skin, natural complexion,
soft retouching. No redness, no plastic skin, no staged look, no text, no watermark.
```

## Video (Seedance 2.0) guidance
- Camera: `subtle handheld drift` (candid feel) or gentle `slow tracking`. Softer than brand-story polish, cleaner than UGC.
- Motion: one natural action (sipping, stretching, laughing, walking through light).
- Audio: warm ambient (kitchen sounds, café murmur, birdsong); light music; sparse dialogue.
- Style: `natural editorial, warm grade, subtle film grain`.

**Template — image-to-video:**
```
Animate the provided image. Preserve identity, palette, and setting. [Subject] performs
[one natural everyday action]; genuine relaxed expression. Camera: subtle handheld drift.
Keep the warm natural daylight. 15 seconds. Avoid jitter, avoid identity drift,
avoid morphing.
```

---

## Prompt-enhancement rules (lifestyle-specific)
- Inject a **setting that implies natural light** if the user gave none.
- Add **candid direction words** (`not posed, mid-moment, genuine`) to counter AI's posed default.
- Lighting: warm/natural, tied to environment.
- Keep product **integrated, not hero-framed** — if the user over-features it, pull it back into the scene.
- Motion: subtle handheld or gentle tracking; avoid `fast`.

## Pitfalls / negatives
- Posed/centered stiffness (kills the candid feel). → candid direction words.
- Product too hero'd → looks like a product demo, not lifestyle.
- Over-polished OR over-rough — lifestyle is the tasteful middle.
- Red/harsh skin in warm light → neutralise white balance while keeping warmth in the scene, not the face.

---

## Sources
- AI Art Revolution — [Authentic lifestyle "found not made" prompting](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- QuestStudio — [Realistic lifestyle photo pack](https://queststudio.io/blog/make-it-look-real-prompt-rules)
- Apiyi — [Seedance 2.0 Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
