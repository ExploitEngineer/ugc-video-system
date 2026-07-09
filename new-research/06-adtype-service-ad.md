# 06 — Ad Type: Service Ad

> Goal: sell an intangible service (agency, clinic, cleaning, repair, consulting, salon, etc.) by showing the *outcome*, the *people*, and the *trust*. There's often no physical product to hero, so the "product" is competence, results, and reassurance.

---

## Theory — what makes a service ad work
- **Show the transformation, not the mechanism.** Before → during → after. The viewer buys the result (clean home, healthy smile, fixed car), so the storyboard should land on the satisfying "after".
- **People carry trust.** Faces of real-looking staff and happy clients do the persuasion. This is where your smooth-real-skin fix matters most — over-textured/red faces read as "off" and kill trust.
- **Competence cues:** clean uniforms, tidy tools, professional environment, confident but warm body language.
- **Pacing:** calm, reassuring, steady camera. Service = reliability, so avoid frantic motion.

## Narrative arc (60s → 4×15s storyboards)
1. Problem / pain (customer frustrated).
2. The service in action (staff, competent, warm).
3. The result / transformation (the "after", satisfied client).
4. Trust close (team shot or client smiling + implied CTA).

---

## Image (gpt-image-2) guidance
- Style anchor: `photorealistic documentary photo` or `photorealistic commercial lifestyle`.
- Lighting: soft, bright, clean — `soft natural daylight, gentle fill, neutral white balance` (bright & trustworthy, not moody).
- Lens: `35mm` for environment/staff-in-context, `50mm` for a client portrait.
- Skin: your soft-skin line is essential on client/staff faces.

**Template — service in action:**
```
Photorealistic documentary photo of a [profession] in [uniform] performing [service task]
for a client in a [clean professional setting]. Soft natural daylight, gentle fill,
neutral white balance, low contrast. 35mm lens, natural perspective, realistic proportions.
Smooth healthy skin, balanced skin tone, warm confident expression. No redness,
no plastic skin, no extreme wide-angle, no text, no watermark.
```

**Template — result/after:**
```
Photorealistic photo of a satisfied client in [setting after the service], relaxed genuine
smile. Soft bright daylight, neutral white balance. 50mm lens, medium shot, natural
perspective. Smooth even skin, healthy complexion, soft editorial retouching.
No redness, no over-smoothing, no text, no watermark.
```

## Video (Seedance 2.0) guidance
- Camera: gentle `slow push-in` (on result) or `slow tracking` (following staff). Stabilised, not handheld — service = polished reliability.
- Motion: one calm action per clip (wiping a surface, shaking a hand, client nodding).
- Audio: light ambient + optional warm VO line; SFX of the task (soft).
- Style: `clean commercial tone, natural color grade`.

**Template — image-to-video (from a storyboard frame):**
```
Animate the provided image. Preserve composition, colors, identity, and setting.
[Staff member] completes [one calm service action]; client reacts with a warm nod.
Camera: slow push-in, stabilised. Keep consistent soft daylight. 15 seconds.
Avoid jitter, avoid identity drift, avoid morphing.
```

---

## Prompt-enhancement rules (service-specific)
- If the user prompt is missing an environment, inject a **clean professional setting** (trust cue).
- Force **bright soft lighting** + **neutral white balance** (service ads shouldn't be moody/dark).
- Keep camera **stabilised and slow** — override any `fast`/handheld unless the user explicitly wants raw.
- Ensure a visible **outcome/after** beat exists across the 4 storyboards.

## Pitfalls / negatives
- Moody or dark lighting (reads untrustworthy). Keep it bright.
- Over-textured/red staff faces (trust killer) → soft-skin line.
- Frantic motion. Keep it calm.
- Fake-looking uniforms/tools → specify clean, real, professional.

---

## Sources
- ugcmaker.org — [UGC AI Video Prompts: 12 Templates](https://ugcmaker.org/blog/detail/UGC-AI-Video-Prompts-12-Copy-and-Paste-Templates-for-Better-Ads-a45dfaf0ecf3/)
- Apiyi — [Seedance 2.0 Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
