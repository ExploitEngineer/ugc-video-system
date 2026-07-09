# 12 — Ad Type: Founder Story

> Goal: build trust and connection by putting the founder on camera telling why the brand exists. Mostly a talking-head + supporting b-roll. Authenticity + warmth + credibility are everything; the face is on screen a lot, so realism is critical.

---

## Theory — trust through a real human
- **The face does the work.** Long on-screen time on the founder means any skin over-texture/redness or identity drift is glaring. This ad type is the strongest argument for your soft-skin + identity-lock fixes.
- **Sincere, not slick.** Between UGC's roughness and brand-story's polish — "credible professional", like a well-shot interview.
- **Story of "why".** Origin, the problem they saw, the mission. Personal, specific, honest.
- **B-roll supports the VO.** Talking-head clips intercut with the founder working, the product, the team.

## Arc (60s → 4×15s)
1. Founder intro / hook — a personal line to camera.
2. The "why" — the problem/origin (b-roll of the journey).
3. The mission / what they built (product + team b-roll).
4. Direct, warm close to camera (trust + implied CTA).

---

## Image (gpt-image-2) guidance
- Style anchor: `photorealistic interview portrait` / `documentary editorial`.
- Lighting: `soft key light + gentle fill, catchlights in eyes, neutral white balance` — flattering, credible, not moody.
- Lens: `85mm, f/2.8` for the talking-head; `35mm` for b-roll context.
- Framing: chest-up, slightly off-center (interview framing), eyeline just off camera or to camera.
- Skin: **soft-real line is non-negotiable here** (biggest face time of any ad type). Identity lock across all frames.

**Template — founder talking-head frame:**
```
Photorealistic interview portrait of a [age] founder, warm credible expression, seated in
[their workspace, softly blurred]. Soft key light with gentle fill, clean catchlights,
neutral white balance, low contrast. 85mm lens, f/2.8, chest-up, natural perspective,
sharp focus on eyes. Smooth healthy skin, balanced skin tone, soft editorial retouching.
Keep facial features exactly as in the reference image. No redness, no over-smoothing,
no plastic skin, no text, no watermark.
```

**Template — supporting b-roll frame:**
```
Photorealistic documentary photo of the founder [working / with the team / holding the
product] in [real setting]. Soft natural light, neutral white balance. 35mm lens, natural
perspective, candid, not posed. Smooth healthy skin, natural complexion. Consistent
identity with reference. No redness, no plastic skin, no text, no watermark.
```

## Video (Seedance 2.0) guidance
- Camera: talking-head → `fixed / locked-off` or `imperceptible slow push-in` (keeps focus on the founder, minimises drift). B-roll → `slow tracking` / `slow push-in`.
- Motion: natural speaking — subtle head movement, hand gestures, blinking. One subject action; camera separate.
- **Audio is central:** warm, sincere spoken delivery; describe tone (calm, honest). Native audio helps lip feel; you can feed a VO reference.
- Style: `natural documentary, warm grade` (not heavily cinematic).

**Template — image-to-video (talking-head):**
```
Animate the provided image. Preserve identity, clothing, and workspace exactly.
The founder speaks warmly to camera with natural head movement and occasional hand gestures.
Camera: locked-off with an imperceptible slow push-in. Keep the soft key light.
Audio: calm sincere spoken delivery. 15 seconds.
Avoid identity drift, avoid morphing, avoid jitter, avoid bent limbs.
```

---

## Prompt-enhancement rules (founder-specific)
- **Force identity lock + reference sheet on every frame** — continuity of the founder's face across all 4 storyboards is the top priority.
- Apply the **soft-skin + neutral-white-balance** line to every founder frame (heaviest face time).
- Talking-head camera should be **fixed or imperceptible push-in** — never a big move on a speaking face (that's where morph happens).
- Keep lighting **flattering and credible**, not moody.
- Separate speaking (subject) motion from any camera motion.

## Pitfalls / negatives
- **Identity drift / face morph on the talking-head** (worst failure). → reference image, locked camera, slow, identity negatives.
- Red/over-textured founder face (kills trust). → soft-skin line.
- Over-cinematic look (reads staged/insincere). → documentary tone.
- Big camera moves on a speaking face → morphing. Keep it near-static.

---

## Sources
- AI Art Revolution — [Interview/portrait framework + identity lock (GPT Image 2)](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- QuestStudio — [Prevent Face Warping in Image-to-Video](https://queststudio.io/blog/prevent-face-warping-image-to-video)
- Apiyi — [Seedance 2.0 Prompt Guide breakdown](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
