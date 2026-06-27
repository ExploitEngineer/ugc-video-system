# GPT-Image-2 Prompting Guide for an AI Ad-Video Pipeline

## TL;DR

- **GPT-Image-2** (model id `gpt-image-2`, snapshot `gpt-image-2-2026-04-21`, launched April 21, 2026; runs through `v1/images/generations`, `v1/images/edits`, `v1/responses`, `v1/chat/completions`) is the right engine for every composite grid sheet: OpenAI's official cookbook lists "Complex structured visuals, including infographics, diagrams, and multi-panel compositions," "Robust facial and identity preservation," and "Reliable text rendering" — but **none of these are guaranteed**, so the patterns below win realism _in the still_ by being explicit, structured, and constraint-heavy.
- Generate at **2K, divisible-by-16** (2048×1152 landscape, 1152×2048 portrait). Do **NOT** pass `input_fidelity` (OpenAI: gpt-image-2 "always processes image inputs at high fidelity"; on some routes the parameter fails outright) and do **NOT** use 4K base sizes (OpenAI documents that outputs above 2560×1440 / 3,686,400 px "are considered experimental"; your base64 bodies truncate at 4K).
- The five deliverables below are copy-paste prompt fragments: a documented-vs-empirical best-practice guide, 4 look-family style fragments, 16 per-ad-type keyframe templates (including the no-product/no-person graphic types), a fidelity playbook for product + person identity lock, and prompt-level fixes for the five recurring failure modes.

## Key Findings

**The model is production-grade for this use case.** OpenAI's official image-generation guide states the GPT Image family is built for "production workflows, where images need to be accurate, readable, on-brand, localized, formatted for the destination surface." The official cookbook ("GPT Image Generation Models Prompting Guide," authored by OpenAI's Mandeep Singh and Emre Okcular, April 21, 2026) lists the exact capabilities your pipeline depends on: multi-panel compositions, identity preservation, and crisp in-image text. At launch OpenAI described the release as "a step change in detailed instruction following, placing and relating objects accurately, and rendering dense text," and GPT Image 2 took the #1 position on Arena.ai's leaderboard for both text-to-image generation and image editing, ahead of models like Nano Banana 2.

**But every one of those capabilities is hedged in the official docs themselves.** OpenAI's guide warns: "Text Rendering: Although significantly improved, the model can still struggle with precise text placement and clarity," and "Consistency: While capable of producing consistent imagery, the model may occasionally struggle to maintain visual consistency for recurring characters or brand elements across multiple generations." For marketing text the cookbook says plainly: "If text fidelity is imperfect, keep the prompt strict and iterate." So the patterns must be defensive.

**Critical confirmed API facts for your setup:**

- **`input_fidelity` is rejected/omitted for gpt-image-2.** OpenAI: "Because gpt-image-2 always processes image inputs at high fidelity, image input tokens can be higher for edit requests that include reference images." This is why your pipeline rejects it — and it's good news: reference images are always processed at high fidelity; you just pay more input tokens.
- **Sizes:** custom sizes must satisfy: both edges multiples of 16, longest edge ≤ 3840px, aspect ratio ≤ 3:1, total pixels 655,360–8,294,400. Outputs above 2560×1440 are "considered experimental." Standard tiers 1024×1024, 1536×1024, 1024×1536 are supported. Your 2048×1152 and 1152×2048 are valid (both ÷16, ~2.36M px, 16:9 ratio).
- **`images.edit` accepts up to 16 reference images** for GPT image models (each png/webp/jpg under 50MB), passed as URL, file ID, or base64 data URL. **Transparent backgrounds are NOT supported by gpt-image-2.**
- **Same-session contamination is a real empirical bug.** Community users on the OpenAI Developer Community thread "Collection of GPT-image-generator 2.0 issues" (started by user "Daller," April 22, 2026) documented "noise amplification" — "The generator keeps some data from the made images, and reuses it for the next images… after just 3-5 pictures, the images are destroyed." The work-around is a fresh session per image. Your pipeline's one-call-per-sheet design already sidesteps this — keep it that way; never chain edits inside one conversation.
- **Downstream:** Seedance 2.0 (ByteDance, image-to-video; web app supports up to ~1080p and 15s) "preserves the visual content of your image and animates it" — so realism is inherited from the still. The anti-AI-skin and identity-lock work below is the single highest-leverage quality investment in the pipeline.

---

## DELIVERABLE 1 — Validated Best-Practice Guide (documented vs empirical)

### A. Multi-panel grid layouts (N distinct, numbered, non-merging panels in one image)

**DOCUMENTED (OpenAI cookbook / API docs):**

- The cookbook's official "Story-to-Comic Strip" recipe prompts "a short vertical comic-style reel with 4 equal-sized panels" with Panel 1–Panel 4 spelled out, and advises: "define the narrative as a sequence of clear visual beats, one per panel. Keep descriptions concrete and action-focused."
- "If layout matters, call out placement… For complex requests, use short labeled segments or line breaks instead of one long paragraph."
- Keep prompt order consistent: "background/scene → subject → key details → constraints," and include the intended use ("ad," "storyboard sheet") to set the mode/polish.
- gpt-image-2 has integrated reasoning ("thinking") that plans layout before drawing; OpenAI lists "comics, multi-panel scenes" among its stronger structured tasks. (Note: OpenAI's separate claim that thinking mode can "generate multiple distinct images from one prompt" refers to _separate_ output images, not panels-in-one-image.)

**EMPIRICAL (community/practitioner):**

- gpt-image-2 appears to build images as "layered, precisely bounded rectangular regions," so prompt the sheet as an explicit layout spec: "Think of your prompt as a layout spec. Name the components. Describe where things are." Name every cell, its grid position, and its content.
- State exact grid geometry up front: "a single landscape image containing a clean 2×2 four-panel grid," "tidy white gutters," "thin dividers between cells," "equal-sized panels." Practitioners reliably get correct counts by naming the grid (e.g., "2×5 ten-panel," "3×3 nine-card") AND enumerating each panel.
- Number/label panels by putting the literal label in quotes per cell ("1", "2", "3", "4") — treat panel numbers as in-image text (see C) so they render verbatim.
- "Concrete details outperform adjective stacks every time."
- One generation per request; do not iterate panels inside one chat/session (noise-amplification bug).

### B. Reference-image editing (`images.edit`) to preserve product/person identity

**DOCUMENTED:**

- Use `images.edit` whenever references are passed; up to 16 images, each ≤50MB. Label each input by index and role: "Image 1: product photo… Image 2: style reference," and describe interaction ("apply Image 2's style to Image 1," "put the bird from Image 1 on the elephant in Image 2").
- Official virtual try-on pattern locks identity: "Do not change her face, facial features, skin tone, body shape, pose, or identity in any way. Preserve her exact likeness, expression, hairstyle, and proportions."
- Separate what changes from what is invariant, and "repeat the preserve list on each iteration to reduce drift."
- Do NOT pass `input_fidelity` — auto-high for gpt-image-2.

**EMPIRICAL:**

- Multiple inconsistent reference images of one identity get averaged (a documented Seedance failure mode that applies at image stage too). Use the cleanest, most consistent reference(s) and name one as the canonical identity anchor.
- Early-launch reference-image artifacts (noise/checkerboard, reported by community user "scohissto," April 23, 2026 — "makes my workflow almost impossible") were sometimes triggered by the model running a background "in the style of" search; avoid "in the style of [real brand]" phrasing in edit calls.
- The cookbook's documented route to cross-sheet consistency is a **character-anchor workflow**: generate the person/product once, then feed that approved image back as the reference for every subsequent sheet ("a reusable 'character anchor'… ensures visual continuity across scenes, poses, and pages").

### C. Text / label / logo fidelity

**DOCUMENTED:**

- "Put literal text in quotes or ALL CAPS and specify typography details (font style, size, color, placement) as constraints. For tricky words (brand names, uncommon spellings), spell them out letter-by-letter." "Use medium or high quality for small text, dense information panels, and multi-font layouts."
- Official billboard example: `Billboard text (EXACT, verbatim, no extra characters): "Fresh and clean"` plus "Ensure text appears once and is perfectly legible. No watermarks, no logos."
- gpt-image-2 renders non-Latin scripts (Japanese, Korean, Hindi, Bengali) far better than predecessors.

**EMPIRICAL:**

- Add a hard stop: "Render this text verbatim. No extra characters. No duplicate text. No additional logos." Each constraint layer reduces paraphrasing.
- Brand-logo reproduction is "still inconsistent… doesn't reliably reproduce exact vector shapes or proprietary typefaces. Generate the surrounding composition and composite your logo in afterward." When the logo MUST appear, supply it as a reference image via `images.edit` and instruct "reproduce the logo from Image X exactly, do not redraw or restyle it."
- If a word misspells, regenerate with less text, larger type, and stricter "exact text only" language. There is also a documented text-artifact bug where the model occasionally rendered its own workflow/instructions as text inside the image (largely resolved ~May 3, 2026) — a reason to keep prompts clean and single-purpose.

### D. Photoreal skin / anti-"AI-look" phrasing

**DOCUMENTED:**

- "To get believable photorealism, prompt the model as if a real photo is being captured in the moment. Use photography language (lens, lighting, framing) and explicitly ask for real texture (pores, wrinkles, fabric wear, imperfections). Avoid words that imply studio polish or staging."
- Official photoreal example: "weathered skin with visible wrinkles, pores, and sun texture… Shot like a 35mm film photograph… subtle film grain, natural color balance. The image should feel honest and unposed, with real skin texture, worn materials, and everyday detail. No glamorization, no heavy retouching."
- Include "photorealistic" to engage the photoreal mode; "real photograph," "taken on a real camera," "iPhone photo" also help.

**EMPIRICAL:**

- Name micro-texture explicitly: "visible pores, fine micro-texture, peach fuzz, subtle natural oil sheen on high points, fine flyaway hairs, slight asymmetry, uneven skin tone, subtle natural redness."
- Forbid the failure modes: "no plastic skin, no waxy texture, no airbrushing, no beauty filter, no AI glow, no porcelain finish, no over-smoothing, no perfect symmetry, no toothpaste-ad teeth."
- Avoid "8K / ultra HD / masterpiece / flawless skin / beautiful" — these push toward over-smoothed wax. Prefer "raw photo, unretouched, 35mm film grain, natural skin shine."
- Side/window light reveals texture; flat frontal studio light hides it and reads artificial.

### E. Lighting-control language

**DOCUMENTED:** Use real photography cues — "soft coastal daylight, shallow depth of field," "softbox from camera-left, neutral grey gradient backdrop," "soft directional lighting from upper left." Concrete sources ("incandescent work lamp spilling warm light") beat mood words.

**EMPIRICAL:** Name source, direction, quality, and time of day: "single soft key at 45°, gentle rim light, daylight feel," "golden-hour window light, gradual shadow transitions," "overhead fluorescent pooling on wet concrete." For UGC: "natural light with visible shadows," "ring-light glow on face." For demo_clean: "studio softbox, controlled, even, low-contrast."

### F. Aspect-ratio / size behavior

**DOCUMENTED:** gpt-image-2 accepts arbitrary WIDTHxHEIGHT when both edges ÷16, longest edge ≤3840, ratio ≤3:1, total pixels 655,360–8,294,400; >2560×1440 is "considered experimental." Standard tiers 1024×1024, 1536×1024, 1024×1536 supported. No transparent background.

**EMPIRICAL:** Always pass an explicit size — the model has been observed silently changing aspect ratio when none is given (community tip: "send an exact pixel ratio or aspect ratio like 1536x1024 or 3:2"). Validate custom sizes client-side (edge, ÷16, ratio, pixel-count) before the call to avoid a 400. Use 2048×1152 (landscape grids) and 1152×2048 (portrait/vertical-ad sheets). For a tall N×4 master grid, keep total pixels ≤8.29M and ratio ≤3:1 — if a long master grid would exceed 3:1, split into two sheets rather than pushing the ratio.

---

## DELIVERABLE 2 — Per-Look-Family Style Fragments (drop-in, ≤80 words each)

```json
{
  "ugc_authentic": "Shot on a handheld smartphone, front-facing-camera look, vertical framing. Natural available light from a window with visible soft shadows, slightly uneven exposure, mild lens softness and faint sensor grain. Candid, imperfect framing, tiny handheld micro-shake. Real skin with visible pores, fine flyaway hairs, subtle shine; no glamour, no studio polish. Lived-in everyday rooms, minor clutter. Looks filmed by a real person, not a commercial. No watermark, no captions, no beauty filter.",

  "cinematic_polished": "Premium cinematic commercial frame, shot on a full-frame cinema camera with a 35-85mm prime, shallow depth of field, gentle film grain. Controlled three-point lighting with soft key, hair/rim light and motivated practicals; rich directional shadows. Filmic color grade, teal-and-amber contrast, deep blacks, smooth highlight roll-off, wide 16:9 framing with intentional negative space. Real skin texture retained under polish. Story-driven mood. No watermark, no on-image text unless specified.",

  "graphic_text": "Flat motion-graphics / kinetic-typography design on a solid brand-color background, bold geometric sans-serif type as the hero element, crisp clean kerning, high contrast, generous safe margins. Simple vector shapes, flat icons, color-blocked panels, subtle gradient accents; no live photography, no real product, no people. Punchy, modern, broadcast-style layout. All text rendered verbatim and perfectly legible. No watermark, no stock-photo imagery, no 3D realism.",

  "demo_clean": "Clean studio product photography on a seamless white or soft neutral-gradient sweep, single hero product as the visual subject, centered with generous negative space. Soft even softbox lighting from upper-left, gentle realistic contact shadow, subtle reflection, crisp focus edge-to-edge, accurate materials and true color. Macro-sharp on label and texture. Tabletop minimalism, no props, no clutter, commercial catalog look. No watermark, no extra objects, no invented text."
}
```

---

## DELIVERABLE 3 — Per-Ad-Type Keyframe Guidance (16 templates)

Each value is the panel-composition block to inject into the storyboard prompt. For 15s use a "2×2 four-panel grid"; for 30/45/60s use an "N×4 master grid" (N rows of 4). **Always prepend** a grid-geometry line ("a single [landscape 2048×1152 / portrait 1152×2048] image containing a clean 2×2 four-panel grid, thin white gutters, equal-sized self-contained panels, a small label reading '1'/'2'/'3'/'4' in the top-left corner of each panel") and **append** the matching look fragment from Deliverable 2.

```json
{
  "product-showcase": {
    "look": "demo_clean",
    "product": "required",
    "person": "optional",
    "panels": "Hero product across all 4 panels, each a different glamour angle/crop: (1) front three-quarter hero on seamless sweep, (2) macro detail of key feature/texture, (3) top-down flat-lay, (4) dramatic low-angle with reflection. Product fills 50-70% of frame, centered, label legible. Vary camera distance and angle; keep lighting and background identical across panels for a cohesive set."
  },

  "product-demo": {
    "look": "demo_clean",
    "product": "required",
    "person": "optional",
    "panels": "Function-first, step-by-step sequence: (1) product at rest/closed, (2) hands beginning to use/open it, (3) product mid-action showing the mechanism, (4) clear end result. Close-ups of hands and product; consistent studio lighting; show the function, not glamour. Optional person = hands only. Panels read as ordered steps."
  },

  "testimonial": {
    "look": "ugc_authentic",
    "product": "optional",
    "person": "required",
    "panels": "Same person (locked identity) talking to camera across all 4 panels: (1) medium close-up front, eye contact, mid-sentence expression, (2) slightly wider showing room context, (3) holding/showing the product toward camera, (4) reaction/smile close-up. Handheld vertical phone look, natural window light, authentic imperfect framing. Keep face identical across panels."
  },

  "social-proof": {
    "look": "graphic_text",
    "product": "optional",
    "person": "optional",
    "panels": "NO product, NO person required - pure motion-graphics. (1) big star-rating card: five gold stars + headline '4.9/5'; (2) wall of stylized review-screenshot cards with short quotes in quotes and 5-star rows; (3) big-number stat callout, e.g. '50,000+ Happy Customers' in oversized bold sans-serif; (4) press/logo strip placeholder with a pull-quote. Flat brand-color backgrounds, all text verbatim, legible, no real photos."
  },

  "problem-agitate-solve": {
    "look": "ugc_authentic",
    "product": "required",
    "person": "optional",
    "panels": "Narrative arc: (1) the pain point / frustration moment in a real home setting, candid; (2) intensified struggle, close on the problem; (3) product introduced as resolution, hands reaching for it; (4) relief/satisfied outcome with product visible. Handheld phone aesthetic, natural light. Keep any person's identity consistent across panels."
  },

  "before-after": {
    "look": "demo_clean",
    "product": "required",
    "person": "optional",
    "panels": "Split contrast: (1) 'before' state of the product/result, neutral; (2) product applied/in use; (3) 'after' improved result; (4) product hero with result. POLICY GUARD: do NOT depict human-body weight-loss or facial wrinkle/anti-aging transformations or body-part close-ups, and avoid 'implied transformation' (e.g. product beside a fit/healthy person); restrict to product, object, surface, or non-health results. Label panels 'BEFORE' / 'AFTER' as in-image text where used."
  },

  "comparison": {
    "look": "demo_clean",
    "product": "required",
    "person": "optional",
    "panels": "Side-by-side split-screen across panels: (1) 'OUR WAY' product vs 'OLD WAY' generic alternative, vertical divider; (2) close-up advantage of the product; (3) close-up shortfall of the unbranded 'old way'; (4) product hero winner. POLICY GUARD: use generic/unbranded 'old way' or 'others' - do NOT depict or name real competitor brands/logos. Clean studio look, labels verbatim."
  },

  "unboxing": {
    "look": "ugc_authentic",
    "product": "required",
    "person": "optional",
    "panels": "Anticipation-to-reveal: (1) sealed box/package in hands on a desk, (2) opening/lifting the lid, (3) first reveal of product inside with tissue/packaging, (4) product held up to camera / reaction. Handheld phone POV, natural light, real hands, authentic clutter. Keep packaging and product consistent across panels."
  },

  "explainer": {
    "look": "graphic_text",
    "product": "optional",
    "person": "optional",
    "panels": "NO live footage required - educational motion graphics. (1) title card 'HOW IT WORKS' in bold type; (2) labeled 3-4 step horizontal flow with arrows and flat icons, each step label in quotes; (3) simple diagram/cutaway with leader-line labels; (4) summary card with key takeaway. Flat brand colors, consistent icon style, ample whitespace, all labels verbatim and legible."
  },

  "founder-pov": {
    "look": "cinematic_polished",
    "product": "optional",
    "person": "required",
    "panels": "Founder (locked identity) first-person across panels: (1) cinematic medium portrait, soft key + rim light, eye contact; (2) founder in the workspace/origin setting, wider; (3) hands-on detail of the craft/product; (4) reflective close-up. Polished film grade, shallow DOF. Maintain identical face, wardrobe, hair across all panels."
  },

  "brand-story": {
    "look": "cinematic_polished",
    "product": "optional",
    "person": "optional",
    "panels": "Emotional cinematic mood piece, flexible (product and/or person optional): (1) evocative establishing scene, (2) human/emotional beat, (3) brand-relevant symbolic detail, (4) aspirational resolution frame. Color-graded, voiceover-led tone, wide negative space for later text. If a person appears, lock identity; if product appears, preserve it. No hard sell."
  },

  "lifestyle": {
    "look": "cinematic_polished",
    "product": "required",
    "person": "optional",
    "panels": "Aspirational real-life context: (1) product in a desirable environment (kitchen/outdoors/studio), (2) product in use within the lifestyle scene, (3) close-up beauty detail of product in context, (4) wide aspirational hero. Premium natural+graded light, shallow DOF. Product clearly present in every panel; optional person interacts naturally, identity consistent."
  },

  "promo-offer": {
    "look": "graphic_text",
    "product": "optional",
    "person": "optional",
    "panels": "NO product/person required - offer cards. (1) oversized headline '40% OFF' on brand color; (2) 'ENDS SUNDAY' urgency card with subtle countdown motif; (3) 'BUY ONE GET ONE FREE' / code card with the promo code in quotes; (4) hard-CTA button card 'SHOP NOW'. Bold sans-serif, high contrast, all copy verbatim, no duplicate text, legible, flat graphics."
  },

  "announcement": {
    "look": "graphic_text",
    "product": "optional",
    "person": "optional",
    "panels": "NO product/person required - teaser typography. (1) intrigue line 'SOMETHING NEW IS COMING'; (2) teaser date card 'DROPPING 6.20' in oversized type; (3) abstract brand-color shapes building anticipation; (4) logo-lockup placeholder + 'STAY TUNED'. Minimal, bold, kinetic-typography style, exact text verbatim, generous margins."
  },

  "brand-awareness": {
    "look": "graphic_text",
    "product": "optional",
    "person": "optional",
    "panels": "Pure manifesto - NO product, NO person. (1) opening slogan line in bold kinetic type; (2) second manifesto line, different weight/scale; (3) third line building rhythm; (4) brand wordmark + tagline lockup. Solid brand-color or high-contrast backgrounds, expressive typography as the only subject, each line verbatim and legible. Looks like an animated brand statement."
  },

  "spokesperson": {
    "look": "cinematic_polished",
    "product": "optional",
    "person": "required",
    "panels": "Scripted presenter/avatar (locked identity) direct-to-camera: (1) polished medium close-up, eye contact, confident expression; (2) presenter gesturing, slightly wider; (3) presenter presenting the product toward camera (if product used); (4) closing CTA expression. Controlled studio key+rim lighting, premium grade, real skin texture retained. Identical face/wardrobe across panels."
  }
}
```

---

## DELIVERABLE 4 — Fidelity Playbook (copy-paste snippets)

### 4.1 Lock product markings, logos, and colors from an uploaded reference (via `images.edit`)

```
Image 1 is the product reference. Reproduce this exact product in every panel.
Preserve EXACTLY, with no changes: the product's geometry and proportions, cap/closure
shape, label layout, all label text, logo, typography, print sharpness, and all colors
(match the exact hues, finish, and material). Do not restyle, redesign, recolor, or
re-letter the product. Do not invent new text or markings. The label must read exactly
as in Image 1, verbatim, no extra characters, no duplicate text, no additional logos.
Only the camera angle, framing, lighting environment, and background may change between
panels; the product identity stays identical. No watermark.
```

Documented helpers: name the product surface and the exact on-label string in quotes; restate this preserve-block once per call (don't rely on prior turns); pass the reference as base64/URL in the `image[]` array; rely on automatic high-fidelity input handling (no `input_fidelity`). If the logo is intricate/proprietary, composite the real vector logo in post — gpt-image-2 does not reliably reproduce exact logo vectors.

### 4.2 Lock a person's identity across the 8-panel person sheet (4 body angles + 4 face close-ups)

Build the sheet in ONE `images.edit` call with the person's reference image(s) as Image 1, OR generate the canonical face once and feed it back as the anchor. Inject:

```
Image 1 is the identity reference for the SAME person shown in all 8 panels.
A single portrait-orientation image, clean 2x4 eight-panel grid, equal panels, thin white
gutters, a small label '1'-'8' in each panel's top-left corner.
Panels 1-4 = full-body angles of this person: (1) front, (2) 3/4 left, (3) profile,
(4) back. Panels 5-8 = face close-ups: (5) front neutral, (6) 3/4 smiling, (7) profile,
(8) looking slightly off-camera.
ABSOLUTE IDENTITY LOCK across all 8 panels: same face, same facial features and bone
structure, same eye color and spacing, same hairstyle and hair color, same skin tone,
same age, same wardrobe. Do not idealize, beautify, slim, or restyle the face. Treat the
face as fixed source material, not inspiration.
Real skin: visible pores, fine micro-texture, subtle natural redness, fine flyaway hairs,
slight asymmetry. No plastic skin, no waxy smoothing, no airbrushing, no beauty filter,
no AI glow, no over-symmetry. Consistent neutral studio lighting across every panel.
No watermark, no on-image text other than the panel numbers.
```

Empirical reinforcement: use a front or 3/4 reference (avoid extreme profile as the anchor); if identity drifts, reduce to the single cleanest reference image and strengthen the lock language; keep wardrobe/hair description explicit so they can't wander.

---

## DELIVERABLE 5 — Failure-Mode Fixes (prompt-level)

```json
{
  "panels_merging_or_bleeding": "Cause: under-specified layout; model treats the sheet as one scene. Fix: open with explicit grid geometry - 'a single image containing a clean N x4 grid of equal-sized panels separated by thin white gutters, each panel a distinct bordered cell.' Add 'each panel is visually self-contained; do not let imagery cross gutters or bleed between panels.' Name each cell and its position; treat the prompt as a layout spec naming bounded regions.",

  "wrong_panel_count": "Cause: count stated once, not enumerated. Fix: state the count three ways - the grid math ('2x2 four-panel'), the total ('exactly 4 panels, no more, no fewer'), and an enumerated Panel 1...Panel 4 list. Add a numbered label in each cell as in-image text so the model must commit to the count. If a long N x4 master grid drops/merges rows, split into two calls.",

  "invented_or_garbled_product_text": "Cause: text treated as a suggestion; tiny type under compression. Fix: quote the exact string, mark 'EXACT TEXT, verbatim, no extra characters, no duplicate text, no invented words.' Spell tricky brand names letter-by-letter. Use quality='high' for small/dense text. For edits, add 'preserve label text exactly as in the reference; do not re-letter.' If still wrong, reduce text, enlarge type, regenerate; composite real logos/legal copy in post.",

  "plastic_over_smoothed_skin": "Cause: default beauty-filter bias plus polish words. Fix: prompt as a real in-the-moment photo with lens/lighting; require 'visible pores, fine micro-texture, peach fuzz, subtle redness, fine flyaway hairs, slight asymmetry.' Forbid 'plastic, waxy, airbrushed, beauty filter, AI glow, porcelain, over-smoothing, perfect symmetry, 8K, flawless.' Use side/window light, not flat frontal. Win realism here because Seedance 2.0 inherits the still's texture.",

  "identity_drift_across_panels": "Cause: model re-interprets the person each panel; multiple inconsistent references averaged. Fix: pass one clean reference via images.edit, declare it the identity anchor for ALL panels, and add an ABSOLUTE IDENTITY LOCK block (same face/features/eye color/hair/skin tone/age/wardrobe; 'treat the face as fixed source material, do not idealize or restyle'). Restate the lock once per call. Use a front/3-4 anchor; if drift persists, drop to a single best reference and tighten wording."
}
```

## Recommendations

1. **Standardize the request envelope now:** `images.generate` for no-reference graphic_text sheets (social-proof, explainer, promo-offer, announcement, brand-awareness, and brand-story when it carries no assets); `images.edit` (base64 refs, up to 16) for every sheet that must preserve a product or person. Always pass explicit size (2048×1152 or 1152×2048), `quality:"high"` for any sheet with small text or fine skin/label detail, never pass `input_fidelity`, never request 4K base, never request a transparent background.
2. **Make the gpt-4.1 prompt-author assemble each prompt in fixed order:** grid-geometry line → per-panel enumeration (Deliverable 3) → identity/preserve block (Deliverable 4 if refs) → look fragment (Deliverable 2) → global constraints/negatives (Deliverable 5 anti-patterns). This matches OpenAI's documented "scene → subject → details → constraints" structure.
3. **One call per sheet, fresh context every time** — never chain edits in a conversation (avoids the documented noise-amplification/ghosting bug).
4. **Treat logos and legal/compliance copy as compositing steps**, not generation guarantees; supply logos as reference images and/or overlay post-generation.
5. **Hard-gate before-after and comparison at the prompt-author layer:** block human weight-loss/anti-aging/wrinkle/body-part transformations _and_ implied transformations (product beside a fit/healthy person) for before-after; block named/real competitors for comparison.
6. **Benchmarks that change the plan:** if text-fidelity pass-rate on stat/offer/announcement sheets falls below your bar, cut text volume per panel and enlarge type before blaming the model; if identity-drift QA fails more than ~1 in 5 person sheets, switch to the generate-anchor-then-edit workflow; if 2K grids show artifacting, regenerate in a fresh call rather than editing.

## Caveats

- **GPT-Image-2 is new (April 21, 2026).** Behavioral detail above is corroborated by the official OpenAI cookbook and API docs (DOCUMENTED) plus practitioner reports and the OpenAI Developer Community (EMPIRICAL); where a behavior is only confirmed for gpt-image-1.5/1, the official cookbook states the same prompting principles apply to gpt-image-2.
- OpenAI's own docs explicitly hedge text rendering and cross-generation consistency — assume neither is guaranteed; the patterns reduce, not eliminate, failures. OpenAI did **not** publish a quantified guarantee about non-merging numbered panels with consistent characters in a single image; it _showcased_ such outputs (comics, character sheets, infographics) as capabilities.
- The "#1 Arena sweep / large text-to-image lead" figures originate in OpenAI's launch communications and third-party coverage (Arena.ai leaderboard), not an independent benchmark; treat as vendor-adjacent claims.
- Meta ad-policy specifics evolve. Per Meta's Transparency Center Health & Wellness policy, advertisers may not show "Side-by-side comparison after the use of a product or transformation for weight loss" (except fitness-class impact, e.g. Pilates) or "for wrinkles treatment such as Botox, dermal fillers, or any other anti-aging treatment"; 2026 enforcement also flags "implied transformations" (e.g., a product shown next to a fit/healthy person). Verify against Meta's current policy before launch.
- Seedance 2.0 inherits realism from the still, so the anti-AI-skin and identity-lock work at image stage is the single highest-leverage quality investment in the pipeline.
