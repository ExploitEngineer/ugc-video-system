# Quality fixes — WIP tracker (TEMPORARY)

Delete this file once all branches below are merged. Tracks the pipeline quality
fixes for product fidelity, scene scripts, and video realism.

## Branches

- [x] **1. `fix/product-brief-text-anchor`** — text anchor for the product.
  - [x] New `describeProduct` skill (`agents/creative-direction/describe-product/`).
  - [x] `runs.product_brief` column + migration (`0008_even_black_tarantula.sql`).
  - [x] `SkillContext.productBrief` + `buildCtx` wiring.
  - [x] Orchestrator: compute + persist `productBrief` in the reference phase.
  - [x] Storyboard prompt: inject brief anchor, remove all "bracelet" examples.
- [x] **2. `fix/storyboard-critic-grounding`** — attach reference sheets + brief
  to storyboard & product critics so wrong product is caught.
  - [x] Storyboard critic: attach product + person sheets (Image 2/3) + brief;
    rubric flags wrong-kind product as blocking/global.
  - [x] Product critic: attach original upload (Image 2) + brief; same check.
- [ ] **3. `fix/scene-script-tailoring`** — product/person-grounded,
  non-repetitive transcripts.
- [ ] **4. `fix/video-realism`** — 720p→1080p default + `BYTEPLUS_VIDEO_RESOLUTION`
  env; de-glamour UGC keyframes.
- [ ] **5. `docs/io-contract-refresh`** — update IO doc / SPEC / pipeline; delete
  this tracker.

## Root causes (reference)
1. No textual product description anywhere → no anchor when storyboard image
   drifts. "bracelet" baked into storyboard prompt examples 6×. Storyboard critic
   never receives the reference sheets.
2. Transcripts have zero product/person grounding; generic examples + filler
   fallbacks.
3. `DEFAULT_RESOLUTION = "720p"` hardcoded; UGC keyframes authored glossy.
