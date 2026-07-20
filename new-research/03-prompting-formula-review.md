# 03 — Prompting Formula Review (Verdict)

You found this formula online and asked whether it actually works in our system:

```
subject → action → scene → camera → lighting → style → audio → QS → constraints
```

## Verdict: ✅ Recommended — it's essentially the industry-standard formula, with two small tweaks.

Your formula is **not wrong**. It's a near-exact match to the structure that the official Seedance 2.0 guide and the broader AI-video community converged on. You can adopt it with confidence. Below is the evidence and the two adjustments.

---

## How it maps to the established formulas

| Your formula | Seedance 2.0 official 6-step | Extended community video formula |
|---|---|---|
| subject | Subject | Subject |
| action | Action | Action |
| scene | Environment | Context / setting |
| camera | Camera | Camera |
| lighting | (folded into Environment) | Ambiance / lighting |
| style | Style | Style |
| audio | (native audio, prompt-shaped) | Audio |
| QS (quality settings) | (folded into Style/Quality) | — |
| constraints | Constraints | — |

- **Official Seedance 6-step:** `Subject → Action → Environment → Camera → Style → Constraints`.
- **Community "full" video formula:** `Subject + Action + Scene + Lighting + Camera + Style + Quality + Constraints` and variants that explicitly add **Audio** at the end.

So your formula = the official structure + explicit `lighting`, `audio`, and `QS` broken out as their own steps. Breaking them out is arguably **better** than the official version, because it forces the writer (or your enhancer) to consciously fill the highest-leverage slot (lighting) instead of burying it inside "environment".

---

## What "QS" means and whether to keep it
`QS` = **quality settings / quality specifiers** (resolution, sharpness, film grain, fps intent, aspect ratio, "high detail", "4K", etc.).

Keep it, but treat it as **conditional and cautious**, because quality words are exactly where your problems come from:
- For **video**, useful QS = `2K, 16:9, 8 seconds, film grain`. Avoid `fast`, avoid stacking.
- For **images**, QS is where over-texture sneaks in. For your skin problem, QS should *subtract* detail, not add it: prefer `soft natural detail, editorial retouching` over `8k, hyper-detailed, ultra sharp`.

---

## The two tweaks

### Tweak 1 — Let `lighting` float forward (or fuse with scene)
Lighting is the single highest-leverage element. Putting it *after* camera is fine on paper, but in practice you want it locked early. Two acceptable orders:

- **Keep your order** but make lighting non-optional and vivid.
- **Or** promote it: `subject → action → scene+lighting → camera → style → audio → QS → constraints` (fusing scene+lighting the way the official guide does, since environment implies light).

Either works. The point: never let lighting be the thing that gets dropped.

### Tweak 2 — Make `audio` and `QS` conditional by pipeline stage
Your pipeline uses the **same** conceptual formula for two different models, but:

- **gpt-image-2 (storyboard frames):** `audio` does **not** apply. Drop it. So the image formula collapses to:
  ```
  subject → action → scene+lighting → camera → style → QS(soft) → constraints
  ```
- **Seedance 2.0 (video):** keep the full formula including `audio` (dialogue for people, SFX for objects, ambient for mood — Seedance has native audio).

---

## Recommended canonical forms for Revonix

**Image (gpt-image-2):**
```
[Style anchor] [subject + 1 mood word], [single action/pose],
in [environment], [lighting: direction + softness + white balance],
[lens + perspective + framing], [soft-skin/quality line], [tight negatives]
```

**Video (Seedance 2.0):**
```
[Subject, concrete]. [One subject action, slow/smooth].
In [environment], [lighting line].
Camera: [one move, paced]. Style: [one grade]. Audio: [dialogue/SFX/ambient].
[QS: duration + ratio + grain]. Avoid: [3–4 issue-matched negatives].
```

---

## Bottom line
Adopt your formula. It's aligned with what actually works. The only real risks are (a) letting lighting get dropped and (b) letting `QS` add the very detail that causes your skin/redness problem. Handle those two and the formula is a solid backbone for the enhancer.

---

## Sources
- Apiyi — [Seedance 2.0 Official Prompt Guide breakdown (6-step formula)](https://help.apiyi.com/en/seedance-2-0-prompt-guide-video-generation-camera-style-tips-en.html)
- BytePlus ModelArk — [Seedance 2.0 prompt guide](https://docs.byteplus.com/en/docs/ModelArk/2222480)
- Medium — [How to Write Better Prompts for AI-Generated Video Clips](https://medium.com/ai-music/how-to-write-better-prompts-for-ai-generated-video-clips-813aea1ac041)
- CyberLink — [Best AI Video Prompts](https://www.cyberlink.com/blog/ai-prompts/5062/best-ai-video-prompts)
