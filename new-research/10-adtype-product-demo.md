# 10 — Ad Type: Product Demo

> Goal: show the product clearly, how it works, and its key benefit. Fidelity of the product is paramount — shape, colour, logo, and UI text must stay accurate. This is where morphing/distortion does the most damage.

---

## Theory — clarity + fidelity
- **The product is the hero.** Frame it clearly, light it cleanly, keep it accurate. Any warping of shape/logo/text destroys credibility.
- **Show the mechanism.** Unlike a service ad, here you *do* show how it works — a feature in action, a hand interacting, an app screen updating.
- **One feature per beat.** Don't cram; each storyboard demos one thing.
- **Clean, controlled look.** Studio or clean-context lighting; stable camera; product-forward composition.

## Arc (60s → 4×15s)
1. Product reveal (clean hero shot).
2. Feature 1 in action (hand/interaction).
3. Feature 2 / benefit moment (result).
4. Product + benefit resolution (hero + implied CTA).

---

## Image (gpt-image-2) guidance
- Style anchor: `photorealistic product photography` (hero) or `photorealistic lifestyle` (in-use).
- Lighting: `large softbox key, controlled reflections, clean highlights, neutral white balance`.
- Lens: `50mm, f/8` for crisp product; `35mm` for in-hand context.
- **Fidelity line is mandatory:** true colours, accurate proportions, correct logo/shape. Pass the **product reference sheet**.
- If a hand is present, apply the soft-skin line to the hand too (hands red/over-textured is a common tell).

**Template — hero product frame:**
```
Photorealistic product photo of [product] on [clean/context surface], accurate shape and
true colors, logo correct and legible. Large softbox key light, controlled reflections,
clean highlights, neutral white balance. 50mm lens, f/8, crisp edges, accurate material
texture. Keep product exactly as in the reference image. No warped shape, no altered logo,
no text errors, no watermark.
```

**Template — in-use frame:**
```
Photorealistic lifestyle photo of a hand using [product] to [do feature], product in
sharp focus. Soft natural daylight, neutral white balance. 35mm lens, natural perspective,
moderate depth of field. Accurate product shape and colors, natural realistic hand,
smooth skin. No warped product, no altered logo, no extra fingers, no text, no watermark.
```

## Video (Seedance 2.0) guidance
- Camera: `slow orbit` (showcases 3D product — orbit is explicitly recommended for product showcases) or `slow push-in` (feature focus). One move.
- Motion: one interaction (finger taps, lid opens, screen updates). Keep the product rigid/accurate.
- **Preservation constraints are critical:** protect logo, product shape, and any UI text.
- Audio: clean SFX of the interaction; optional crisp VO naming the benefit.

**Template — image-to-video (from hero frame):**
```
Animate the provided image. Preserve product shape, colors, logo, and any on-screen text
exactly. [One interaction: a hand taps / lid opens / screen updates]. Camera: slow orbit,
stabilised, aligned to the product's geometry. Keep clean studio lighting. 15 seconds.
Avoid morphing, avoid warping the product, avoid altering the logo, avoid text drift.
```

---

## Prompt-enhancement rules (product-demo-specific)
- Always inject **product-fidelity constraints** (shape/color/logo/UI text) and require the **product reference sheet**.
- Restrict camera to **orbit or push-in only**, and only orbit if the source frame has enough geometry (a flat straight-on shot shouldn't be orbited far).
- Enforce **one feature per storyboard** — split multi-feature prompts.
- Clean neutral lighting; block moody/coloured light that distorts product colour.

## Pitfalls / negatives
- **Product morphing / logo warping / UI-text drift** — the signature failure. Use preservation constraints + reference image + slow single motion.
- Orbiting a flat product frame into invented (wrong) geometry.
- Cramming multiple features → confusion + drift.
- Colour cast changing the product's true colour → neutral white balance.

---

## Sources
- Seedance — [Product Demo Video Generator workflow (2026)](https://www.seedance.tv/blog/seedance-product-demo-video-generator-2026)
- Apiyi — [Seedance 2.0 Prompt Guide breakdown (orbit for product showcase)](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- QuestStudio — [Product photo realism](https://queststudio.io/blog/make-it-look-real-prompt-rules)
