# Research prompt — GPT-Image-2 image prompting guide

> Attach `00-system-briefing.md` first, then paste this. If available, paste the outputs
> of `02` (taxonomy) and `03` (hooks) so the look patterns key to real ids.

You are an image-generation prompt engineer specializing in **GPT-Image-2** (OpenAI). You've
read the system briefing. In our pipeline GPT-Image-2 produces every composite grid sheet:
the 4-view **product reference sheet**, the 8-panel **person reference sheet**, and the
labelled **storyboard keyframe sheets** (a 2×2 four-panel grid for 15s; a single N×4 master
grid for 30/45/60s). A `gpt-4.1` call authors the text-to-image prompt, then we make one
`gpt-image-2` call (via `images.generate` or `images.edit` when we pass reference images,
inlined as base64). We are expanding from 2 ad types to many, each with a visual look, and
need GPT-Image-2 prompt **patterns per ad type / look family**.

## What we already believe (validate or correct this)

- **Realism is won in the still.** We push photoreal quality into the storyboard image so
  the video inherits it. Anti-"AI look" matters: real skin texture (visible pores, fine
  lines, flyaways), natural/available light, candid framing for UGC; polished intentional
  lighting for cinematic.
- **Product fidelity is critical**: marks, text, logos, colors on the product must
  reproduce exactly from the uploaded reference; the model must not invent or relabel.
- We generate at 2K (2048×1152 / 1152×2048), divisible-by-16, not 4K (4K base64 bodies get
  truncated). Sheets *guide* the video, not ship as final frames.
- GPT-Image-2 **rejects an `input_fidelity` parameter** in our setup (don't suggest it).

## What I need

1. **Validated best-practice guide.** Current best practices for GPT-Image-2 prompting,
   especially: multi-panel grid layouts (getting N distinct, correctly-numbered panels in
   one image), reference-image / image-to-image editing (`images.edit`) to preserve a
   product's or person's identity, text/label fidelity, photoreal-skin and anti-AI-look
   phrasing, lighting control, and aspect-ratio/size behavior. Separate "documented" from
   "empirical". Cite OpenAI docs where possible.

2. **Per-look-family style fragments.** For each `look` family from prompt `02`
   (`ugc_authentic`, `cinematic`, `graphic_text`, plus any others), a reusable prompt
   **fragment** describing the rendering treatment (lighting, texture, framing, grade) we
   can inject into the storyboard prompt per ad type. ≤80 words each, droppable verbatim.

3. **Per-ad-type keyframe guidance.** For each ad type, how its keyframe panels should be
   composed (what's in frame, product prominence, person presence, camera angle variety
   across panels), including the types with **no product and/or no person** — what does a
   graphic/text-led or no-actor keyframe sheet look like, and how do we prompt GPT-Image-2
   for it.

4. **Fidelity playbook.** The strongest phrasing/technique to force exact reproduction of
   product markings, logos, and colors from the uploaded reference via `images.edit`, and
   to lock a person's identity across the 8-panel sheet. Concrete instruction snippets.

5. **Failure-mode fixes.** Common GPT-Image-2 failure modes for our use (panels merging,
   wrong panel count, invented text on the product, plastic/over-smoothed skin, identity
   drift) and the prompt-level fix for each.

## Output format

The best-practice guide as tight bullets (documented vs empirical separated). The look
fragments and per-ad-type guidance as templates in a table or JSON keyed by id/look, so we
can store them as prompt fragments. Cite sources inline.

## Constraints

- Patterns must be concrete prompt text we can inject, not general advice.
- Do NOT recommend `input_fidelity` (rejected in our setup) or 4K base sizes.
- Respect that the still carries realism for the downstream video — optimize for that.
