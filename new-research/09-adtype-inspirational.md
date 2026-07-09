# 09 — Ad Type: Inspirational

> Goal: move the viewer emotionally and leave them uplifted/motivated. Often a montage of aspirational moments tied to a message. Closely related to brand story, but higher on *emotion + energy* and lower on plot.

---

## Theory — feeling first
- **Montage logic.** Inspirational ads often chain short emotive beats (effort, struggle, breakthrough, triumph) rather than a single scene. Each of your 4 storyboards can be one beat.
- **Rising energy.** Build from quiet/struggle to bright/triumph. Lighting and camera should escalate with the emotion.
- **Universally readable imagery.** Faces mid-emotion, hands, movement, light breaking through — instantly legible symbols of hope/effort.
- **Music-driven pacing.** The audio bed is the spine; visuals hit with it.

## Arc (60s → 4×15s, escalating)
1. Quiet struggle / the "before" low point (cooler, softer light).
2. Effort / persistence (movement, determination).
3. Breakthrough (light shifts warmer/brighter).
4. Triumph / uplift (golden, open, resolved).

---

## Image (gpt-image-2) guidance
- Style anchor: `cinematic film still, emotive`.
- Lighting arc: cool/soft early → warm/backlit/golden by the payoff. Use light to tell the emotional story.
- Lens: `85mm` for emotional close-ups; `35mm` for triumphant wide moments.
- Emotional direction beats physical description: `determined`, `hopeful`, `overcome with joy`.
- Skin: soft-real line; emotion close-ups are where over-texture/redness hurts most.

**Template — emotive beat frame:**
```
Cinematic emotive film still of a [character] [emotional action, e.g. rising, reaching,
breathing hard then smiling], [emotion word] expression. [Beat-appropriate light: soft
cool early / warm backlit golden for payoff], gentle rim light. 85mm lens, shallow depth
of field, natural perspective. Smooth healthy skin, balanced tone, soft retouching.
No redness, no plastic skin, no extreme wide-angle, no text, no watermark.
```

## Video (Seedance 2.0) guidance
- Camera: `slow push-in` (intimacy), `subtle rise` (uplift), `slow tracking` (momentum). One move per clip, escalating slightly across the four.
- Motion: one strong emotive action per clip. Keep it slow-smooth even when the *feeling* is big — big feeling, controlled motion (avoid `fast` = jitter).
- Audio: driving/uplifting music bed; minimal or no dialogue; natural SFX (breath, footsteps).
- Style: `cinematic, warm grade, film grain`.

**Template — image-to-video:**
```
Animate the provided image. Preserve identity and palette. [Character] performs
[one emotive movement] as light warms slightly. Camera: slow rise, stabilised.
Keep the [beat] lighting. 15 seconds. Avoid jitter, avoid identity drift, avoid morphing.
```

---

## Prompt-enhancement rules (inspirational-specific)
- Map the 4 storyboards to an **escalating light + energy arc** (cool→warm, low→uplift).
- Convert physical adjectives in the user prompt into **emotional direction** words.
- Keep motion **slow/smooth despite high emotion** — the most common failure is requesting "fast/energetic" and getting jitter. Escalate via *light and framing*, not speed.
- Ensure a clear **payoff/triumph** beat exists.

## Pitfalls / negatives
- Requesting speed/energy → jitter/morph. Escalate with light, not motion speed.
- Cheesy/generic if adjectives replace real imagery — give concrete emotive actions.
- Face over-texture in emotional close-ups. → soft-skin line.
- Flat lighting kills the emotional arc. → deliberate light escalation.

---

## Sources
- Apiyi — [Seedance 2.0 Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- CyberLink — [Best AI Video Prompts](https://www.cyberlink.com/blog/ai-prompts/5062/best-ai-video-prompts)
- AI Art Revolution — [Realistic Portraits / lighting-first framework](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
