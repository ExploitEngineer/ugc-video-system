# 04 — gpt-image-2 Prompting Guide (Storyboard Frames)

Everything for the image stage of the pipeline: what the model is, how it behaves, the framework, and the exact templates/negatives — tuned for your smooth-real-skin goal.

---

## What gpt-image-2 is (capabilities)
- OpenAI's image model, **released April 2026**, built on the GPT-5.4 backbone; replaced DALL·E 3 and the interim GPT Image 1.5. Now the default image model in ChatGPT.
- **High resolution:** up to 2K (2560×1440) per the developer/portrait guidance; OpenAI's launch materials also cite 4K. *Confirm the exact ceiling against your API tier* — this matters because higher res = more default skin texture (see below).
- **Reasoning-based:** it plans/reasons about structure before generating (O-series reasoning), so it follows structured instructions well.
- **Strong identity lock:** notably improved face/identity preservation on reference-image edits — very relevant to your person-reference-sheet → storyboard flow.
- **Instruction-following** is strong but suffers "**prompt bleeding**" past ~70 words (instructions start averaging together).

### Practical implications for Revonix
1. Because it's high-detail + high-res, **it over-textures skin by default** at close range. Your job is to *dial texture down*, not up.
2. Because identity lock is strong, **feed the person reference sheet** and use the identity-lock phrase for every storyboard frame to keep the same face across all 4 storyboards.
3. Keep each storyboard prompt **50–70 words** to avoid prompt bleeding.

---

## The Five-Layer Framework (use this as the frame builder)
Every strong portrait/character frame has five layers. Your enhancer can build frames layer by layer.

1. **Style anchor** (first thing the model reads, sets the universe): `photorealistic editorial portrait`, `cinematic portrait photography`, `documentary photo`. Avoid weak anchors: `realistic`, `professional`, `high quality`, `beautiful`.
2. **Technical specs** (lens/aperture/light): `85mm, f/4` (portrait), `50mm` (natural), `35mm` (environmental). Named film stocks (`Portra 400`) trigger tonal associations efficiently.
3. **Subject + mood** (one sentence): emotional words beat superlatives — `quietly confident` > `beautiful`.
4. **Environment + context** (one sentence): the environment also *creates the lighting* (window = soft directional; street night = ambient neon). Use that link.
5. **Quality lock + negatives** (prevents default failures): for you this is the **soft-skin** line + identity lock, not a "more texture" line.

---

## Your skin fix, in exact words
The default is too much texture + redness. Counter it at three levels:

**Prompt words to ADD:**
```
smooth even skin, healthy natural complexion, soft editorial retouching,
balanced skin tone, neutral white balance, clear calm skin, gentle soft shading
```

**Prompt words to REMOVE (these cause your problem):**
```
8k, hyper-detailed, macro, every pore, visible pores, skin texture,
ultra sharp, extreme detail, textured skin
```

**Lighting to use (soft light hides texture & redness):**
```
soft diffused light, north-facing window light, large softbox, gentle fill,
low contrast, even overcast light
```
Avoid `hard side light`, `harsh`, `dramatic contrast`, `strong specular` on close-ups — they exaggerate pores and redness.

**Redness kill switch (colour level):**
```
neutral white balance, balanced skin tones, no redness, no blotchiness, even complexion
```

> Don't over-correct into plastic. Target = *natural, healthy, even skin with soft realistic shading*. Avoid `flawless / airbrushed / perfect skin` (those swing you back to wax).

---

## Your weird-angle fix, in exact words
```
85mm portrait lens, natural perspective, no extreme wide-angle distortion,
realistic proportions, [explicit framing: chest-up / medium shot / head-and-shoulders]
```
Always give a lens and framing. Never leave perspective to chance.

---

## Parameters / knobs (set in your API calls)
- **Resolution:** don't default to the max for close-up faces. Higher res → more pore detail. A moderate resolution + soft-skin prompt gives smoother results; upscale later if needed.
- **Prompt length:** 50–70 words.
- **Reference image:** pass the person + product reference sheets; include identity lock.
- **Identity-lock phrase (for reference edits):**
  ```
  Keep the person's facial features exactly as in the reference image —
  same eyes, nose, mouth, face shape, skin tone, and expression.
  ```

---

## Copy-paste templates

### Template A — Person storyboard frame (smooth real skin, safe default)
```
Photorealistic editorial portrait of a [age] [gender] with a [one mood word] expression,
[single pose/action] in [environment]. Soft north-facing window light, gentle fill,
neutral white balance, low contrast. 85mm lens, f/4, natural perspective, medium shot,
sharp focus on the eyes. Smooth even skin, healthy natural complexion, soft editorial
retouching, balanced skin tone. No redness, no over-smoothing, no plastic skin,
no extreme wide-angle, no text, no watermark.
```

### Template B — Product frame (clean, accurate)
```
Photorealistic product photo of [product] on [clean/context surface]. 50mm lens, f/8,
crisp edges and accurate material texture. Large softbox key light, controlled reflections,
clean highlights, neutral white balance. Accurate proportions and true product colors.
No text, no logos except the product's own, no warped shapes, no watermark.
```

### Template C — Person + product together (for demo/lifestyle storyboards)
```
Photorealistic candid lifestyle photo of a [age] [gender] [using/holding product] in
[real setting]. Soft natural daylight, gentle shadows, neutral white balance. 35mm lens,
natural perspective, moderate depth of field, realistic proportions. Smooth healthy skin,
natural color grade, product shown accurately. Keep facial features exactly as in the
reference image. No plastic skin, no redness, no deformed hands, no text, no watermark.
```

---

## Negative-prompt block (trim to what's failing)
```
no plastic skin, no over-smoothing, no heavy retouching, no redness, no blotchy skin,
no visible-pore macro texture, no warped hands, no extra fingers, no deformed face,
no extreme wide-angle distortion, no text, no watermark, no logo
```

---

## Fix recipes (fast triage)
| Symptom | First change |
|---|---|
| Skin too textured / pores | Remove detail words; add soft-skin line; soften light; lower resolution |
| Red / blotchy skin | Add `neutral white balance, no redness`; drop warm+high-saturation |
| Weird angle / distortion | Add `85mm, natural perspective, no extreme wide-angle`; state framing |
| Face changed between frames | Add identity-lock phrase + pass reference sheet |
| Waxy/plastic (over-corrected) | Ease off `flawless/airbrushed`; allow `natural soft texture` |
| Warped hands | Crop tighter or move hands to camera; add hand negatives |

---

## Sources
- OpenAI — [Introducing ChatGPT Images 2.0](https://openai.com/index/introducing-chatgpt-images-2-0/) · [GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2)
- AI Art Revolution — [ChatGPT Image Prompts for Realistic Portraits — Five-Layer Framework (GPT Image 2)](https://aiartrevolution.com/chatgpt-image-prompts-for-realistic-portraits/)
- QuestStudio — [Make AI Images Look Real](https://queststudio.io/blog/make-it-look-real-prompt-rules)
