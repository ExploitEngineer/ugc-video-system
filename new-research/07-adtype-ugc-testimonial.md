# 07 — Ad Type: UGC / Testimonial

> Goal: look like a **real customer filmed it on their phone**. This is the hardest realism target because the whole value is *authenticity*. Polish is the enemy here.

---

## Theory — authenticity over polish
The winning UGC formula is **authentic delivery + clear benefit + fast pacing** — NOT perfect production. What sells:
- **Handheld framing, natural light, everyday settings** (bedroom, desk, kitchen, car).
- **Conversational, imperfect dialogue** — filler words ("um", "like", "you know"), micro-pauses, genuine emotion, hesitations. A too-smooth script instantly reads as an ad.
- **A believable, small proof point** — "I noticed my desk was easier to organize", "I like that it fits in my bag" — not grandiose claims.
- **First 2 seconds hook** — the scroll-stopper.

## Winning formats (pick one per ad)
- Problem → Solution demo (15–30s)
- 3 reasons / 3 benefits (15–25s)
- Testimonial / "I didn't expect this…" (20–35s)
- Before / After (10–20s)
- My routine / day-in-the-life with product (20–40s)

---

## Image (gpt-image-2) guidance
Deliberately **imperfect and casual**. This is the one place you slightly relax the "polished" look — but still keep skin natural (not red/over-textured).
- Style anchor: `photorealistic candid selfie photo` / `amateur phone photo look`.
- Lighting: `soft natural indoor light, slightly uneven` (realistic, not studio).
- Lens: `phone front camera look, 28mm-ish, natural perspective` — casual, close, but **not** distorting.
- Framing: chest-up, slightly off-center, held-at-arm's-length feel.

**Template — creator selfie frame:**
```
Photorealistic candid phone selfie of a [age] [gender] creator at home ([room]),
casual clothing, genuine relaxed expression, holding [product] near the frame.
Soft natural window light, slightly uneven, neutral white balance. Front-camera look,
natural perspective, chest-up, slightly off-center. Smooth healthy skin, natural
complexion, no heavy retouching. No redness, no plastic skin, no studio polish,
no text, no watermark.
```

## Video (Seedance 2.0) guidance — this is where UGC lives
- Camera: **handheld**, `subtle handheld drift`, slight natural shake. This is one of the few times handheld is correct.
- Motion: talking to camera, natural gestures, one product action (holds it up, points at it).
- **Audio is critical:** describe conversational dialogue with filler + pauses; Seedance has native audio and can shape lip/rhythm feel.
- Style: `natural phone-video look, unfiltered, everyday` — NOT cinematic.

**Template — image-to-video (talking testimonial):**
```
Animate the provided image. Preserve identity, clothing, and room. The creator talks
casually to camera, natural head movement and hand gestures, briefly lifts [product]
toward the lens. Camera: handheld with subtle natural drift. Keep the soft window light.
Audio: warm conversational delivery with natural pauses and a couple of filler words.
15 seconds. Avoid identity drift, avoid morphing, avoid over-smooth studio look.
```

**Dialogue guidance to feed the audio/script layer:**
- Short sentences, one idea each.
- 1–2 filler words + a micro-pause per clip, not more (over-doing it is as fake as none).
- End on a simple believable proof point + soft CTA.

---

## Prompt-enhancement rules (UGC-specific — partly INVERTED)
- **Do NOT add cinematic/gimbal/studio polish.** If the user prompt contains `cinematic, stabilised, gimbal, studio`, strip it for this ad type.
- **Add** `handheld, natural light, everyday setting, casual`.
- Keep skin natural but **do not fully smooth** — a tiny bit of realism is good here (just kill the redness/harsh-pore extreme).
- Enforce **one benefit/proof point** and a 2-second hook.
- Keep the phone-camera perspective natural — avoid true wide-angle face distortion.

## Pitfalls / negatives
- Too polished / cinematic (biggest failure — it stops looking like UGC).
- Over-smoothed "AI influencer" face (uncanny) — keep it human.
- Scripted, perfect dialogue with no imperfections.
- Distracting/busy background — keep it "creator-real" (bedroom/desk).

---

## Sources
- ugcmaker.org — [UGC AI Video Prompts: 12 Copy-and-Paste Templates](https://ugcmaker.org/blog/detail/UGC-AI-Video-Prompts-12-Copy-and-Paste-Templates-for-Better-Ads-a45dfaf0ecf3/)
- AdLibrary — [AI Prompting Guide for UGC Content Creators (2026)](https://adlibrary.com/guides/ai-prompting-guide-ugc-content-creators)
- Apiyi — [Seedance 2.0 Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
