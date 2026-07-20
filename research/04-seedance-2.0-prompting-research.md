# Seedance 2.0 (BytePlus ModelArk) Prompting Guide for an AI Ad-Video Pipeline

## TL;DR

- **The team's instincts are mostly correct.** SHORT prompts (~60–100 words), causal/time-sliced motion, and "push realism into the still image" are validated by both ByteDance's official guidance and community testing — but with one correction: **lighting and a single camera move are the highest-leverage tokens**, so don't trim those. Seedance reads "left-to-right with diminishing attention," so over-stuffing genuinely produces worse video.
- **Voice CANNOT be cloned through the ModelArk text+image pipeline.** Seedance _synthesizes_ a voice from the on-screen character + your text description; the photo→voice cloning feature was suspended by ByteDance on Feb 10, 2026 over consent concerns, and real-face image uploads are blocked. Direct voice by description (age/gender/energy/accent/language) and write dialogue as quoted speech. Cross-clip voice drift is real and is minimized (not eliminated) by repeating an identical verbatim voice descriptor in every segment.
- **There is no dedicated negative-prompt parameter in the ModelArk API** — negatives are inline text. Keep them SHORT (2–3 terms tied to the actual failure). The team's fixed `"avoid jitter, bent/distorted limbs, temporal flicker, identity drift"` is acceptable-but-imperfect: well-supported for character clips, but for the graphic_text/no-person types the limb/identity terms are wasted, and a `"no music, no logo, no text on screen"`-style closer is far more valuable.

---

## 2026-07-18 REFRESH #2 — fake-looking action + prompt economy (applied to code)

A second deep-research pass (99 agents, adversarially verified) plus a line-level inventory of the ACTUAL submitted prompt found why the generated action looked fake/stiff, and it was NOT only length.

The measured problem: the submitted Seedance prompt for a UGC run was 214 words (LLM tier) to 433 words (deterministic fallback); only ~15-20% was actual beat ACTION, and appearance/identity/product were re-described 4-5 times.

Verified, HIGH-confidence findings (official fal.ai + Runway, corroborated):

- **Re-describing what the input still already carries ACTIVELY REDUCES motion** — Runway's official image-to-video guide: restating the image's details "can actually reduce motion and produce unexpected results — the model gets busy and stops moving". This was a direct cause of our stiff action. So the still carries appearance/identity/product/wardrobe/lighting/setting, and the prompt now spends its words almost entirely on MOTION.
- **Physical grounding is the realism lever.** Name a concrete CONSEQUENCE the model must resolve toward ("the mug slides and tips") and the MECHANICS of the motion — weight, contact points, momentum, follow-through. Fixes the exact failure modes: gliding feet → "each foot lands heel-first, then rolls forward"; morphing hands → anchor to objects ("fingers close around the cup"). These phrases are SHORT, so they don't cost economy.
- **Physically-grounded VERBS + causal/temporal sequencing beat adjective stacks.** "she picks it up, feels its weight, then sets it down" beats "she elegantly handles the product". Praise adjectives (beautiful/smooth/elegant/cinematic) give the model nothing to animate.
- **~60-100 words per shot; long actively HURTS via conflicting instructions + attention dilution.** ONE primary action + ONE camera move per beat, stated together ("what moves, how it moves, what the camera does").
- **Negatives: unresolved — every web claim was refuted.** No reliable guidance on which inline negatives help vs summon the artifact, so MINIMIZE them (this repo's memory already warns failure-naming can summon the failure). Keep only positive-framed, load-bearing cues (one full-frame/no-grid cue; audio suppression like "no music" for UGC).

What changed in code (this refresh):

- The Seedance prompt was cut from ~214-433 words to ~120-185. Wrapper (`video/index.ts` `composePrompt`) 134→~46 words: the `@Image` legend is a bare NAMING of each reference (no "keep its exact shape/colour/markings" — that reduced motion), a 4-word identity anchor kept ONLY for merged segments; `videoRenderDirective`, `videoNegatives` (`ad-types/fragments/looks.ts`) and the speech directive each cut to one short clause.
- The LLM writer system (`buildVideoPrompt`) 594→~280 words, rebuilt around the physical-motion instruction (consequence + mechanics + causal order), with an explicit "do NOT re-describe appearance — it reduces motion" and "no praise adjectives".
- The deterministic fallback (`buildDeterministicVideoPrompt`) 340→~150 words: dropped the appearance pins, the product hard-freeze rigidity clause (it fought natural handling), and the repeated anti-grid wording.
- The per-type `videoAudioLine` skill fragments were cut to their music/SFX nuance (the lip-sync/voice rule is owned once by the wrapper); the UGC `videoPacing` lost its duplicate audio tail. Resolved the motion CONTRADICTIONS (UGC was told "handheld micro-shake" AND "stable, never fast"; the product was frozen AND handled) by removing the code-side competing cues so each look has ONE coherent camera voice.
- Golden `legacy-prompts.json` regenerated + audited.

STILL OPEN (needs first-party in-pipeline A/B, not web research): which exact negatives reduce floaty motion vs backfire; per-ad-type motion recipes; cross-clip identity/voice drift threshold for merged 30/45/60s runs.

---

## 2026-07-18 REFRESH (targeted re-research, applied to code)

A fresh 5-angle deep-research pass (20 sources, adversarial verify) re-confirmed most of this guide and pinned the ONE change that was actually costing us on-camera speech.
Documented-vs-empirical is marked; the hard API facts are PRIMARY (fal.ai schema + fal GitHub), the phrasing rules are SECONDARY (fal.ai learn pages) + community, well-corroborated but not vendor-guaranteed.

- **Lip-sync trigger (HIGH-confidence, now in code).** On-screen lip-sync is triggered by a SPEAKING-VERB attribution plus the line in DOUBLE quotes tied to the visible speaker, e.g. `she says: "..."` (fal.ai official guide: "Put any spoken line in double quotes, and the model lip-syncs it, generates the voice, and times it to the cut"; BytePlus ModelArk corroborates).
  A bare `(spoken: "...")` label or a single-quoted floating line reads as ambient audio, which is exactly why our UGC character wasn't talking.
  Off-screen voiceover is the CONTRAST case: phrase it as narration with a `narrates:` verb, e.g. `a low, unhurried female voice narrates: "..."`.
  Applied: `agents/video/prompt.ts` now attributes UGC/service lines with `says:` and cinematic lines with `narrates:`, in double quotes, in BOTH the LLM builder and the deterministic builder; `agents/video/index.ts` also prepends a deterministic, LLM-immune lip-sync directive (see `[[09-multi-speaker-voice-and-lipsync]]` update).
- **Lip-sync reliability (MEDIUM).** Keep spoken lines SHORT (5-10 words/line, ~20 words per 15s); long monologues drift out of sync toward the clip end. Medium close-up, front-facing or slight three-quarter, camera relatively stable during the line. Our transcripts are already short; keep them so.
- **Speech is the WEAKEST audio channel (MEDIUM, against-interest).** fal.ai (the official host) says lip-sync "works, but the audio quality appears to be strongest on sound effects and ambient audio" and recommends testing lip-sync against your standards before a dialogue-heavy production pipeline (~50-60% production-ready, metallic sibilants). So the two-pass post-dub VO path stays the guaranteed option for voice-critical ads.
- **Inline negatives + no camera_fixed on fal (HIGH for the fact, MEDIUM for the list).** The fal image-to-video schema exposes only `prompt/image_url/end_image_url/resolution/duration/aspect_ratio/generate_audio/seed/end_user_id/bitrate_mode` — NO `negative_prompt` and NO `camera_fixed` (a real change from Seedance 1.0). Negatives stay inline + short + positive/rigid; failure-naming can soft-summon the artifact and long lists get ignored (keep our look-family-conditional negatives, not one universal string). Vague intensity adjectives BACKFIRE: unqualified `fast` = chaos, `epic` = no-op, `lots of movement` = jitter; make exactly ONE element move and use ONE camera instruction.
- **WRAPPER vs NATIVE (important for the code).** All the confirmed API detail is the fal.ai WRAPPER. This pipeline calls the NATIVE BytePlus ModelArk REST API (`providers/byteplus/index.ts`), which differs: discrete integer durations (`snapSeedanceDuration`), 1080p available (`BYTEPLUS_VIDEO_RESOLUTION`), and `camerafixed` MAY be a real native parameter. Our `--camerafixed true` suffix is safe (silently ignored if unsupported). Do NOT port fal's `480p/720p-only` or continuous `4-15` duration into the native path.
- **REFUTED / still open.** Two candidate cross-clip drift mitigations were REFUTED (restating the accent in every scene; inserting written-beat "she pauses, then continues:" resync anchors) — so our frozen-identity-block + same-refs approach is the best available but remains UNVALIDATED. Per-ad-type camera/motion recipes had NO surviving confirmed web evidence: they need first-party A/B testing THROUGH the pipeline, not more web research — so we deliberately did NOT rewrite the per-ad-type fragments speculatively (consistent with this repo's history of reverted prompt-rule tuning).
- **Unchanged, re-confirmed.** `generate_audio` defaults true (single pass, no extra cost); single clip caps at 15s (30/45/60s = N merged clips); voice is described in-prompt, not a field, and there is no voice-clone path (the `@Audio` voice-MATCH input needs Ark Console activation and is a timing/mood reference, not a voice template).

---

## DELIVERABLE 1 — Validated Best-Practice Guide

### A. What is DOCUMENTED vs EMPIRICAL (read this first)

- **DOCUMENTED (official BytePlus/ByteDance/Volcengine):** The canonical sources are the BytePlus ModelArk docs — "Dreamina Seedance 2.0 series prompt guide" (docs.byteplus.com/en/docs/ModelArk/2222480), "Create a video generation task" API reference (docs.byteplus.com/en/docs/ModelArk/1520757), and the "Dreamina Seedance 2.0 series tutorial" (…/2291680). **CRITICAL LIMITATION: these pages are JavaScript-rendered and their parameter tables/body text do not load via normal fetch.** I confirmed their existence, titles, and meta-descriptions but could not extract verbatim parameter tables. The official prose is therefore cited via (a) a faithful English translation of ByteDance's own Mandarin user manual (paralleldistribution.com, translated from ByteDance Lark Office) and (b) the Volcengine/Ark schema as mirrored by integration docs. Where I rely on these I mark **DOCUMENTED (via translation/mirror)**.
- **EMPIRICAL/COMMUNITY:** fal.ai (an _official_ Seedance host — useful for the production API schema), WaveSpeed, Higgsfield, Morphic, Magic Hour, apiyi, mangomindbd, ugccopilot, videoai.me, crepal, Atlas Cloud, plus Reddit/Medium field reports. Marked **EMPIRICAL**.
- **Where official docs are sparse, I say so explicitly.** The exact ModelArk request-body parameter table and any negative-prompt field are NOT extractable from the official page in plain text; the schema below is reconstructed from official-host (fal.ai) and mirror docs and should be validated against your live console.

### B. Prompt structure Seedance responds to best

- **DOCUMENTED (via translation):** Official "prompt structure blueprint": `[Subject/Character] + [Scene/Environment] + [Action/Motion] + [Camera Movement] + [Timing Breakdown] + [Transitions] + [Audio/Sound] + [Style/Mood]`. For 10s+ videos the official guide _recommends time-segmented prompts_: `0–3s: … / 3–6s: … / 6–10s: …`. This directly supports your "global settings → time-sliced storyboard → editing/quality" structure.
- **DOCUMENTED (via translation):** "Seedance 2.0 reads left to right with diminishing attention. The first sentence carries the most weight… anything after the third is 'details to use if there's room.'" → Front-load the hardest constraint (the hook) in the first time-slice.
- **EMPIRICAL:** Community consensus 6-step formula = `Subject → Action → Environment → Camera → Style → Constraints`, **target 60–100 words**, ONE primary camera instruction, at least one lighting line (apiyi, mangomindbd). One vendor (Atlas Cloud) found their best prompts average **50–70 words** and warns "very long prompts may contain conflicting instructions which can result in a decrease in generation quality."

### C. Validate/refute the team's four principles

- **(a) "Short beats long; push realism into the still." → VALIDATED, with a caveat.** Supported by official "diminishing attention" guidance and by multiple empirical testers (Atlas Cloud's 50–70-word sweet spot; WaveSpeed's "shots that read cleanly in stills hold up in motion"; "longer/over-stuffed prompts increase drift"). **Caveat:** "short" must not mean "stripped." The single most quality-moving token per official guidance is a **lighting description**, plus ONE camera move; cutting those to save words hurts. So the rule is "short _and_ dense," ~60–100 words, with lighting + one camera move always present. Because your pipeline supplies a labelled storyboard sheet as image guidance, you correctly offload appearance/composition to the image and keep the video prompt about _motion, camera, pacing, audio_.
- **(b) "Explicit motion in causal order; short negatives." → VALIDATED.** Official guide uses time-stamped causal segments throughout. EMPIRICAL: "one motion verb per shot"; compound moves should be written as beats ("Start: slow dolly-in. Then: gentle pan right for final 2s") — the model "respected the sequence better than if I jammed both into one clause" (WaveSpeed). Short negatives: validated (see Deliverable 5).
- **(c) "Cannot clone a voice; direct by description." → VALIDATED (this is the most important correction in your favor).** See Deliverable 4. The model synthesizes; it does not clone through your pipeline.
- **(d) "Labelled storyboard sheet is the only shot guide; reference sheets not sent." → VALIDATED as a sound design choice, with a nuance.** Official + empirical both stress that **every uploaded image must be given an explicit @-role or it's processed ambiguously** ("handing a stack of unlabelled photos to a director" — Morphic). A single labelled storyboard sheet with an explicit role ("@Image1 is the storyboard; follow its framing, shot order and composition") is exactly the documented "storyboard script generation" pattern. NUANCE: face-identity anchoring is strongest with ONE tight, clean face crop; multiple inconsistent face refs cause "face averaging"/morphing (Magic Hour, VicSee). So sending only the storyboard sheet (+ optional single face ref) is consistent with best practice — just ensure the optional face ref is one clean crop, and note real-face photos are blocked (use stylized/generated faces).

### D. The "@Image N" multi-image reference convention

- **DOCUMENTED (via translation):** This is REAL official syntax. The manual: "Seedance 2.0 uses `@` to assign roles to each uploaded asset. This is the most critical part of prompt writing." Syntax `@Image1 … @Image9`, `@Video1–3`, `@Audio1–3`. Mapping is **positional** — the first uploaded image is @Image1, etc.; there is no name field. On the China/Volcengine route the underlying tokens are Chinese (`图片1…图片9`, `视频1–3`); English `@Image1` is the BytePlus/Dreamina-facing form. (Some host docs show a `[Image1]` bracket variant; fal accepts `@Image1`.)
- **DOCUMENTED (via translation) — role assignment is mandatory and explicit.** Examples: `@Image1 as the first frame`, `@Image2 as the last frame`, `@Image1's character as the subject`, `scene references @Image3`, `reference @Video1's camera movement`, `BGM references @Audio1`, `wearing the outfit from @Image2`, `product details reference @Image3`.
- **EMPIRICAL:** Multi-image caps confirmed by Higgsfield's official Seedance 2.0 page: "combine up to 9 images, 3 video clips (up to 15 seconds each), 3 audio clips (up to 15 seconds each), and text prompts in a single generation. The model reads each input's role automatically." 12 files max; practical sweet spot 2–5 images + ≤1 video/audio. Using all 12 "often produces worse results" (VicSee).

### E. First-frame / last-frame control

- **DOCUMENTED (via translation) + EMPIRICAL (fal):** Supported. 1 image = first frame; 2 images = first + last frame. Phrase as `@Image1 as the first frame, @Image2 as the last frame`. fal's image-to-video also exposes an `end_image_url` for A→B transitions (good for before-after/reveal).

### F. Audio/voice direction (confirm: synthesizes own voice, cannot clone)

- **CONFIRMED.** See Deliverable 4 for the full treatment. Native synchronized audio (dialogue + SFX + ambient + music) generated in one pass; lip-sync in up to 8 languages; voice is synthesized from character description + quoted dialogue.

### G. Camera-motion vocabulary

- **DOCUMENTED (via translation), official camera-language table:** push in / pull back / pan left-right / tilt up-down / track (follow) / orbit (revolve) / one-take (oner) / Hitchcock (dolly) zoom / fisheye / whip pan / crane. Shot sizes: extreme close-up / close-up / medium close-up / medium / full / wide (establishing).
- **EMPIRICAL:** Community lists "8 camera movements" = push-in, pull-out, pan, tracking, orbit, aerial, handheld, fixed. **Rule: ONE primary camera instruction per shot; use pacing words (slow/smooth/gentle), not technical specs (fps/focal length).** "Fast" is the single most quality-degrading word — fast camera + fast cuts + busy scene "almost guarantees jitter and artifacts" (apiyi). Separate camera motion from subject motion ("The dancer spins slowly. Camera holds fixed framing." ✅ vs "spinning camera around a dancing person" ❌).

### H. Duration parameter & the production API schema

- **EMPIRICAL (official host fal.ai + mirror docs):** Per generation, **duration = 4–15 seconds** (fal.ai, the official host: "Seedance 2.0 generates videos up to 15 seconds in a single generation"; integer, with `"auto"`/`-1` to let the model choose). Your 15s segment cap is the model's max single-pass length, so it's the correct unit. Resolution 480p/720p (fal) up to 1080p–2K on some ModelArk tiers (fast tier does NOT support 1080p). 24 fps. Aspect ratios 21:9/16:9/4:3/1:1/3:4/9:16/auto.
- **ModelArk request body (reconstructed; VALIDATE against your console):** async POST to `…/api/v3/contents/generations/tasks`; model `dreamina-seedance-2-0-260128` / `…-fast-260128`. Body fields seen across official-host + mirror docs: `model`, `content` (multimodal array of `{type:text|image_url|video_url|audio_url}`), `ratio`/`aspect_ratio`, `resolution`, `duration`, `generate_audio` (bool, default ON; audio is free and billed the same on/off), `watermark`, `seed`, `return_last_frame`, `callback_url`. **`generate_audio: true` is the right setting for your pipeline.** The model returns a task ID; poll until `succeeded`; video URL expires ~24h. (No `camera_fixed` parameter found for 2.0 — camera control is via prompt text.)

---

## DELIVERABLE 2 — Per-Ad-Type Motion Patterns (16 templates, ≤100 words each)

Stored as JSON, keyed by ad-type id. Each `pattern` is a fill-in template (square brackets = fill slots) built for a single 15s segment, assuming the labelled storyboard sheet is `@Image1` and an optional clean face crop is `@Image2`. Replace `[VOICE]` with your standard voice descriptor (see Deliverable 4). All include a SHORT inline negative closer; swap per look family (Deliverable 5).

```json
{
  "product-showcase": {
    "look": "demo_clean",
    "pattern": "Follow @Image1 storyboard. [PRODUCT] on [surface], seamless studio backdrop. 0-4s: hero product enters, slow 360° orbit revealing front/side/back, crisp highlight scanning across [material]. 5-10s: slow push-in on logo/texture detail. 11-15s: settle to hero shot, [brand] tagline. ONE camera move per beat, soft three-point studio light, shallow depth of field, clean. VO [VOICE]: \"[benefit line]\". Crisp product SFX, subtle music bed. — no jitter, no warped product, no garbled logo text."
  },
  "product-demo": {
    "look": "demo_clean",
    "pattern": "Follow @Image1. Function-first. 0-4s: hands enter frame, [product] performs [core action] in real time, close-up on the working part. 5-10s: medium shot showing the result/outcome, smooth tracking. 11-15s: product at rest, [brand] end card. Locked or slow dolly camera, clean even lighting, realistic physics on [moving part]. VO [VOICE]: \"[what it does]\". Real interaction SFX (click/pour/snap), light music. — no jitter, no extra fingers, no morphing product."
  },
  "testimonial": {
    "look": "ugc_authentic",
    "pattern": "UGC creator. @Image2 is the speaker (one clean face). [Age] [gender] in [setting], filmed iPhone front camera, slight handheld micro-shake, natural daylight. 0-2s: looks straight at camera. 2-12s: speaks naturally with small head/hand movement: \"[testimonial line, <16 words]\". 13-15s: easy smile, slight push-in. Eye-level medium shot, realistic skin texture. Synced lip dialogue [VOICE], ambient room tone. — no music, no logo, no on-screen text, no jitter."
  },
  "social-proof": {
    "look": "graphic_text",
    "pattern": "Follow @Image1. NO person. Motion-graphics montage of [star ratings / review cards / counters]. 0-4s: rating stars animate in and fill. 5-10s: review cards slide/stack in rhythm, key phrases pop. 11-15s: aggregate stat ([N]+ reviews) locks center, [brand] mark. Clean kinetic typography, brand palette, snappy beat-synced motion. Confident VO [VOICE]: \"[social proof line]\". Upbeat music bed, soft UI ticks. — no people, no jitter, no garbled text, keep numbers legible."
  },
  "problem-agitate-solve": {
    "look": "ugc_authentic",
    "pattern": "UGC creator. @Image2 speaker. 0-5s: [age] [gender] looks frustrated dealing with [pain], dull/cool light, slouched, handheld. 6-10s: hard cut, same person brighter and upright, holds @Image1 [product], taps it. 11-15s: relieved, to camera: \"[solution line]\". iPhone handheld, natural light shift cold→warm marks the turn. Synced dialogue [VOICE], ambient sound. — no music, no logo, no text on screen, no jitter."
  },
  "before-after": {
    "look": "demo_clean",
    "pattern": "Follow @Image1. Clean contrast. 0-6s: BEFORE state of [subject], muted/cool grade, locked shot. 7-8s: hard cut or quick wipe transition. 8-15s: AFTER state, same framing, brighter warm grade, slow push-in to highlight improvement. Identical composition both halves so the change reads instantly. Even lighting, stable camera. VO [VOICE]: \"[before] … now [after]\". Light whoosh on the transition, subtle music. — no jitter, no morphing between states, no warped subject."
  },
  "comparison": {
    "look": "demo_clean",
    "pattern": "Follow @Image1. Us-vs-them split screen. 0-4s: frame splits; LEFT [ours] performs [task] cleanly, RIGHT [theirs] struggles. 5-10s: parallel action continues, slow synchronized push on both sides. 11-15s: LEFT wins, RIGHT fades, [brand] mark center. Locked split-screen camera, even neutral lighting both sides, clear visual hierarchy. VO [VOICE]: \"[contrast line]\". Subtle music, light SFX. — no jitter, keep both sides legible, no garbled labels."
  },
  "unboxing": {
    "look": "ugc_authentic",
    "pattern": "UGC creator. @Image2 hands/speaker. 0-3s: anticipation — hands hold [package], to camera: \"[hook]\". 4-9s: opening — tears/lifts lid, close-up reveal of @Image1 [product], genuine reaction. 10-15s: holds product up, \"[reaction line]\". iPhone handheld, natural light, real cardboard/tape SFX. Synced dialogue [VOICE], ambient room tone. — no music, no logo, no on-screen text, no jitter."
  },
  "explainer": {
    "look": "graphic_text",
    "pattern": "Follow @Image1. NO person (or simple icon characters). Kinetic typography + motion graphics. 0-4s: problem statement types/animates in. 5-10s: 3 labelled steps or a simple animated diagram of [how it works], elements entering in causal order. 11-15s: payoff line + [brand] CTA locks. Clean flat-design motion, brand palette, smooth eases. Clear instructive VO [VOICE]: \"[explanation]\". Light music bed, soft UI ticks. — no people, no jitter, keep all text legible."
  },
  "founder-pov": {
    "look": "cinematic_polished",
    "pattern": "@Image2 founder (one clean face). [Age] [gender] at [authentic workspace], speaks to camera. 0-3s: settles, eye contact. 3-12s: delivers with calm conviction: \"[founder line]\". 13-15s: slight smile, gentle slow push-in. Cinematic medium shot, soft directional key light, shallow depth of field, warm grade, subtle gimbal stability (not handheld). Sincere synced dialogue [VOICE], quiet room tone, sparse piano underscore. — no jitter, no identity drift, no on-screen text."
  },
  "brand-story": {
    "look": "cinematic_polished",
    "pattern": "Follow @Image1. Cinematic mood piece, [theme]. 0-5s: evocative wide establishing of [setting], slow dolly forward, golden-hour light. 6-10s: medium shots of [human moments / product in life], smooth tracking. 11-15s: rise to [emotional peak], settle on [brand] logo. 2.35:1 widescreen feel, film grain, rich color grade, ONE flowing camera move per beat. Warm reflective VO [VOICE]: \"[manifesto line]\". Swelling orchestral/ambient score, natural ambience. — no jitter, no garbled logo."
  },
  "lifestyle": {
    "look": "cinematic_polished",
    "pattern": "Follow @Image1 (and @Image2 person if used). [Person] uses [product] within [aspirational real-life scene]. 0-5s: establish the moment, natural action with product present, slow tracking. 6-10s: close detail of product-in-use, warm natural light. 11-15s: satisfied beat, product visible, soft [brand] end card. Cinematic handheld-but-smooth, shallow depth of field, sun-kissed grade. Light VO [VOICE]: \"[aspiration line]\" or music-only. Ambient real-world sound, warm music bed. — no jitter, no morphing product."
  },
  "promo-offer": {
    "look": "graphic_text",
    "pattern": "Follow @Image1. NO person required. Urgency-driven kinetic typography. 0-3s: big offer ([X]% OFF / [deal]) slams in with energy. 4-9s: supporting terms + [product] cutout animate in rhythmically, countdown ticks. 10-15s: CTA button + code lock center, pulsing. Bold high-contrast brand palette, fast-but-clean beat-synced motion (only motion is fast, not camera). Punchy VO [VOICE]: \"[offer + CTA]\". Driving music, impact SFX. — no jitter, keep deal text and code legible, no garbled numbers."
  },
  "announcement": {
    "look": "graphic_text",
    "pattern": "Follow @Image1. NO person. Launch/teaser typography. 0-5s: dark/minimal field, teaser line fades in, slow build. 6-10s: [product name / date] reveals with a light sweep, restrained motion. 11-15s: [brand] logo + 'Coming [date]' locks center. Premium minimal kinetic type, brand palette, smooth slow eases, high negative space. Intriguing VO [VOICE]: \"[teaser line]\" or music-only. Cinematic ambient riser, single impact hit on reveal. — no people, no jitter, keep text crisp."
  },
  "brand-awareness": {
    "look": "graphic_text",
    "pattern": "Follow @Image1. NO product, NO person. Manifesto/slogan kinetic typography only. 0-5s: short phrases animate in one at a time, rhythmic. 6-10s: build to the core [slogan], scale + weight shifts for emphasis. 11-15s: [brand] logo resolves. Bold expressive type, brand palette, confident beat-synced motion, abstract shapes/textures only. Resonant VO [VOICE]: \"[slogan]\" or music-only. Anthemic music bed. — no people, no product, no jitter, keep every word legible."
  },
  "spokesperson": {
    "look": "cinematic_polished",
    "pattern": "@Image2 host (one clean face). Scripted VSL talking head. [Age] [gender], professional [setting], to camera. 0-2s: confident open. 2-13s: delivers script in clear segments: \"[line 1]\" … \"[line 2]\". 13-15s: direct CTA: \"[CTA]\". Polished medium shot, soft three-point light, slightly blurred branded background, stable framing (lock camera for clean lip-sync). Authoritative synced dialogue [VOICE], quiet room tone, faint music bed. — no jitter, no identity drift, no head-turn during speech."
  }
}
```

**Grouped notes by look family (efficiency):**

- **ugc_authentic** (testimonial, PAS, unboxing): lead with literal token "**UGC creator**" — it biases the model toward handheld phone footage/real lighting (EMPIRICAL, videoai.me). Always "looks at camera, says, '…'" for direct address. Handheld micro-motion, natural light, 6–10s dialogue beats. Append `— no music, no logo, no text on screen`.
- **cinematic_polished** (founder-pov, brand-story, lifestyle, spokesperson): smooth gimbal/dolly (NOT handheld), shallow DOF, warm graded light, ONE flowing move/beat, music bed yes. Lock the camera during spoken lines for clean lip-sync.
- **graphic_text** (social-proof, explainer, promo-offer, announcement, brand-awareness): NO on-screen person; brand-awareness also NO product. Kinetic typography + motion graphics; only the _motion/cuts_ may be fast, never the camera. Legibility is the #1 failure mode — always negative "keep text/numbers legible." Audio = VO + music only.
- **demo_clean** (product-showcase, product-demo, before-after, comparison): clean even/studio light, locked or slow-orbit/push camera, realistic product physics, crisp interaction SFX, subtle music. Identity/limb negatives matter less; product-warp/logo-garble negatives matter most.

---

## DELIVERABLE 3 — Per-Hook Opening Motion (first 2–4s, drop into time-slice `0–3s`/`0–4s`)

JSON keyed by hook id. Each `open` is a ≤2–4s opening beat. `needs_person`/`needs_product` flags noted.

```json
{
  "problem-solution": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: cold/dim shot of [pain moment] in motion (the thing going wrong), slight handheld, frustrated energy — then a beat of stillness before the turn."
  },
  "pattern-interrupt": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-2s: an abrupt, unexpected first frame ([surreal/oversized/out-of-place element]) held 1s, then a HARD CUT to the real scene. Jarring on purpose, no easing."
  },
  "curiosity-gap": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: slow push-in toward a partially hidden/obscured [subject] (covered, off-frame, in shadow) so the viewer can't quite see it yet. Withhold the reveal."
  },
  "question": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: direct-address medium shot (or bold text card) posing \"[question]?\"; if person, looks straight at camera and asks it; if graphic, question types in and holds."
  },
  "stat-shock": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: a big number ([STAT]) slams onto screen and animates/counts up fast, single impact hit, high contrast. Number fills the frame."
  },
  "bold-claim": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: confident statement delivered to camera (person) or as a hard-locking headline (text), steady framing, no hedging — claim lands in the first second."
  },
  "contrarian": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: show the 'expected'/conventional thing briefly, then a quick cut or head-shake that visually rejects it ('Everyone says X… wrong'), framing snaps to the counter-take."
  },
  "testimonial": {
    "needs_person": true,
    "needs_product": false,
    "open": "0-3s: real-feeling person, iPhone handheld, looks straight at camera mid-sentence already talking: \"[opening testimonial words]\". Natural light, slight shake."
  },
  "social-proof": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: rating stars fill in / review cards stack rapidly / live counter ticks up, beat-synced motion graphics, brand palette. No person needed."
  },
  "before-after": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: BEFORE state held ~2s in muted grade, then a clean wipe or hard cut to the AFTER state in identical framing — the cut IS the hook."
  },
  "demonstration": {
    "needs_person": false,
    "needs_product": true,
    "open": "0-3s: hands enter and the [product] immediately performs its [core action] in close-up — show the function instantly, real interaction SFX."
  },
  "relatable-scenario": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: a mundane, instantly-recognizable everyday moment ([scenario]) in natural handheld, so the viewer thinks 'that's me' before any pitch."
  },
  "direct-callout": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: point at camera / a 'Hey [audience]…' headline snaps in, eye contact (person) or aggressive text lock (graphic). Calls the target viewer out by name in beat one."
  },
  "unexpected-comparison": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: cut between two unlikely things side by side ([A] vs [B]) implying '[product] is like [A]' — quick split or match-cut to set up the surprise."
  },
  "negativity-bias": {
    "needs_person": false,
    "needs_product": false,
    "open": "0-3s: a warning/mistake framing ('Stop doing [X]' / 'You're [losing/ruining] [Y]'), red-tinged or stark grade, urgent push-in to create stakes."
  },
  "confession": {
    "needs_person": true,
    "needs_product": false,
    "open": "0-3s: intimate close-up, person leans in to camera, lowered voice, slightly vulnerable: \"[confession opener, e.g. 'I wasn't going to tell anyone this…']\". Handheld, soft light."
  }
}
```

- **Require a person on screen:** `testimonial`, `confession` (both need @-face ref or a generated person; remember real-face uploads are blocked).
- **Require product in frame:** `demonstration`.
- The rest are person-optional and work as either a talking-head opener or a graphic/typography opener depending on the ad type they're paired with. **Compatibility note:** person-only hooks (testimonial, confession) should NOT be paired with `brand-awareness` (no person allowed); the product hook (demonstration) should not be paired with `brand-awareness` (no product). Your taxonomy layer should block those combinations.

---

## DELIVERABLE 4 — Audio / Voice Direction Matrix

### Core mechanics (CONFIRMED via subagent + sources)

- **Native joint audio.** Seedance 2.0 generates video + audio in a single pass (dialogue, SFX, ambient, music). `generate_audio: true` (default; free either way). Lip-sync supported in **up to 8 languages** — per Imagine.art's spec, "English, Chinese (Mandarin/Cantonese), Japanese, Korean, Spanish, French, German, and Portuguese." Cutout.pro field testing notes "Mandarin produces the most consistent lip sync… English is a close second. Japanese and Korean work but occasionally drift on longer phrases." This native audio is a genuine differentiator vs silent Sora 2/Kling 3.0.
- **Voice is SYNTHESIZED, not cloned (this validates team claim c).** "Voice fingerprint is inferred from the character description — gender, age range, regional cues" (EMPIRICAL, ugccopilot). The photo→voice cloning capability was **suspended by ByteDance on Feb 10, 2026** over consent/privacy concerns. Per TechNode (Feb 10, 2026), Jimeng operators stated: "To maintain a healthy and sustainable creative environment, we are making urgent changes based on user feedback and will not allow real-human-like photos or videos to be used as reference subjects." The suspension was triggered after MediaStorm founder Pan Tianhong (Tim Pan) showed the model reconstructed his actual voice from a single facial photo with no audio reference; ByteDance's Jimeng & Doubao apps added a live image+voice verification step for avatar creation. The ModelArk text+image pipeline you use has no voice-clone path.
- **`@Audio` reference ≠ voice clone.** On fal (official host), an audio reference is used as a **soundtrack/rhythm/mood** guide or as a VO track to **lip-sync to** — it does not learn a voice identity to synthesize new speech. To get a _specific_ brand/CEO voice you must do a **two-pass workflow**: generate the visual with the line in quotes (locks lip-sync timing), then overdub your cloned/branded voice (e.g., ElevenLabs) in post. Your pipeline (generate_audio: true, no audio ref) gets the model's synthesized voice.
- **How to phrase dialogue:** put spoken lines in **double quotes**: `She looks at camera and says: "..."`. Official example: `A deep, calm male voice says: "In the grand universe, our world is but a fleeting moment."`. Keep lines **5–10 words** (mushy lip-sync past ~8s / >16 words). **Lock the camera and avoid head-turns during spoken lines** for clean lip-sync.
- **How to direct timbre by description:** prepend a voice descriptor before the quote: `[age] [gender], [energy], [accent/language] voice says: "..."` e.g. `A warm, upbeat woman in her late 20s, light American accent, says: "..."`. For off-screen narration use `Voiceover ([descriptor]): "..."`.
- **Suppress unwanted music:** the model defaults to adding library-style music; if you don't want it, add an explicit negative (`no music`) — the single most useful audio negative for UGC.

### Matrix (by look family / ad type)

| Ad type          | Voice mode             | Tone                   | Pace               | Music bed       | Phrasing in prompt                                                                |
| ---------------- | ---------------------- | ---------------------- | ------------------ | --------------- | --------------------------------------------------------------------------------- |
| product-showcase | VO (off-screen)        | polished, aspirational | measured           | yes (subtle)    | `Voiceover (calm confident [gender], 30s): "[benefit]"` + product SFX             |
| product-demo     | VO                     | clear, instructive     | even               | light           | `Voiceover (neutral [gender]): "[what it does]"` + interaction SFX                |
| testimonial      | On-camera lip-synced   | warm, genuine, casual  | natural, unhurried | NO (`no music`) | `looks at camera, says: "[line]"`; `[age]/[gender]` descriptor; ambient room tone |
| social-proof     | VO + music             | upbeat, credible       | snappy             | yes             | `Voiceover (energetic [gender]): "[social proof]"`; soft UI ticks                 |
| PAS              | On-camera lip-synced   | frustrated→relieved    | shifts at the turn | NO              | `frustrated tone 0-5s … relieved to camera: "[solution]"`                         |
| before-after     | VO                     | satisfying, clean      | measured           | yes (subtle)    | `Voiceover: "[before] … now [after]"` + transition whoosh                         |
| comparison       | VO                     | confident, fair        | brisk              | subtle          | `Voiceover (assured [gender]): "[contrast]"`                                      |
| unboxing         | On-camera lip-synced   | excited, real          | quick, reactive    | NO              | `tears open … "[reaction]"`; real cardboard/tape SFX                              |
| explainer        | VO                     | friendly, teacherly    | even, clear        | light           | `Voiceover (clear friendly [gender]): "[step-by-step]"`                           |
| founder-pov      | On-camera lip-synced   | sincere, grounded      | calm, deliberate   | sparse piano    | `[founder] speaks to camera: "[line]"`; lock camera                               |
| brand-story      | VO                     | reflective, warm       | slow, cinematic    | yes (swelling)  | `Voiceover (warm reflective [gender]): "[manifesto]"`                             |
| lifestyle        | light VO or music-only | breezy, aspirational   | relaxed            | yes             | `Voiceover: "[aspiration]"` or music-only + ambient                               |
| promo-offer      | VO + music             | punchy, urgent         | fast               | yes (driving)   | `Voiceover (high-energy [gender]): "[offer + CTA]"`; impact SFX                   |
| announcement     | VO or music-only       | intriguing, premium    | slow build         | yes (riser)     | `Voiceover (intriguing [gender]): "[teaser]"` or music-only                       |
| brand-awareness  | VO or music-only       | bold, anthemic         | rhythmic           | yes (anthemic)  | `Voiceover (resonant [gender]): "[slogan]"` or music-only                         |
| spokesperson     | On-camera lip-synced   | authoritative, clear   | scripted, even     | faint bed       | `host to camera: "[line 1]" … "[CTA]"`; lock camera                               |

- **No-on-screen-person graphic_text types (social-proof, explainer, promo-offer, announcement, brand-awareness):** audio is **VO and/or music only** — there is no face, so there's no lip-sync; just specify `Voiceover ([descriptor]): "..."` and a music descriptor (genre + mood, e.g., "upbeat indie", "tense orchestral build"). brand-awareness/announcement can run **music-only** with on-screen text carrying the message.

---

## DELIVERABLE 5 — Negatives Policy

### Stance

- **There is NO dedicated `negative_prompt` parameter in the ModelArk Seedance API.** Negatives are **inline text** in the prompt. (EMPIRICAL but strong: seedance2.so states flatly "There is no 'negative*prompt' field in the API contract"; fal's published Seedance schema also has no negative field. Note Seedance \_1.0 lite* docs even said "negative prompts do not respond" — so negative handling has historically been weak/soft on this family.) Inline negatives are honored "with reasonable consistency… not as deterministic as a true negative-prompt slot."
- **Keep negatives SHORT and tied to the actual failure (VALIDATED).** Multiple sources: 2–3 targeted terms outperform exhaustive lists; "a long negative prompt can backfire or simply get ignored" (Morphic, videoai.me). This supports the team's "short negatives" principle.
- **Does naming a failure make it appear?** This is a real risk on diffusion-family models (negatives can act as soft attention cues), and the practical guidance converges on the same place regardless: **name only the failures you actually see**, don't pre-list every theoretical failure. There's no hard published proof that naming "jitter" _causes_ jitter in Seedance specifically, but the dominant, lower-risk practice is minimal/targeted negatives — so the team's instinct is directionally right.

### Assessment of the team's fixed closer `"avoid jitter, bent/distorted limbs, temporal flicker, identity drift"`

- **Verdict: good for human/character clips, wasteful (and slightly risky) as a universal closer.** "avoid jitter and bent limbs" is literally the community-standard character-video negative, so for testimonial/PAS/unboxing/founder/spokesperson/lifestyle it's appropriate. BUT:
  - For **graphic_text types (no person)**, "bent/distorted limbs" and "identity drift" reference things that aren't in frame — they waste prompt budget and can confuse the model. Replace with text-legibility + no-people negatives.
  - The far more valuable universal closer for ads is **`no music, no logo, no text on screen`** (when you don't want those) — Seedance's most common ad-wrecking defaults are leaked library music, invented logos, and auto-captions, not limb bends.
  - **Recommendation: make negatives look-family-conditional**, not one global string.

### Concrete negatives per look family

```json
{
  "ugc_authentic": "— no music, no logo, no on-screen text, no jitter, no warped hands",
  "cinematic_polished": "— no jitter, no identity drift, no on-screen text, no warped face",
  "graphic_text": "— no people, no jitter, keep all text and numbers legible, no garbled letters",
  "demo_clean": "— no jitter, no morphing product, no garbled logo text, no extra fingers"
}
```

- For dialogue clips, append `no music` only if you want pure voice+ambient. For brand-awareness, also `no product`.
- Use a leading dash/colon to help the model parse the negative section as separate from the positive description (EMPIRICAL, videoai.me).

---

## DELIVERABLE 6 — Multi-Segment Continuity (N×15s clips, ffmpeg-merged, NOT frame-chained)

### Validate the current approach

- **Your existing "part i of N… keep SAME person/wardrobe/product/lighting" + other-segment summaries is the correct strategy and is well-supported.** Because each 15s clip is an independent generation (not frame-chained), the ONLY thing carrying continuity is (a) the shared labelled storyboard sheet/face ref as image guidance and (b) **identical descriptive tokens repeated verbatim** in every segment. Field reports confirm: "use short, consistent descriptors… treat them like constants"; rephrasing the same token between prompts causes drift (CrePal). Repeating an explicit token like `navy sweater, plain warm wall, 50mm, soft left window light` kept head-size, wardrobe and light falloff consistent across three separate generations.

### Improvements

1. **Maintain a frozen "continuity block"** — a verbatim string reused unchanged in every segment, covering 5 token classes (EMPIRICAL best practice):
   - **Identity:** `[gender], [age range], [2–3 hard facial/hair traits]` (e.g., "round face, dark curls, small silver hoop left ear")
   - **Wardrobe:** fitted, static, no logos (loose/flowing garments break continuity)
   - **Product:** exact name + key visual detail
   - **Look/lighting:** light direction + quality + color grade (e.g., "soft key from left, warm grade")
   - **Lens/framing baseline:** e.g., "50mm medium, eye-level"
2. **Pin the same image guidance to every segment** — the same storyboard sheet and the same single clean face crop (`@Image2`) in all N calls. Don't vary the reference between segments; periodically re-anchoring to the original reference beats chaining from a prior output (avoids cumulative drift).
3. **Keep a fixed seed** for the identity-bearing segments where possible (the ModelArk body supports `seed`); a stable seed + stable tokens reduces face/colour drift across separate generations.
4. **Pacing consistency:** keep the same time-slice rhythm and the same "one camera move per beat" discipline across segments so the merged cut feels even.
5. **Lighting/grade consistency is the sneaky failure** (style drift > identity drift in field tests): name the exact light source, direction and color grade identically every time; simplify backgrounds so the model spends "attention" on the consistent subject.

### Keeping the SYNTHESIZED voice consistent across separate clips (the hard problem)

- **The risk is real.** The model "will lock voice timbre across the duration of [one] clip but not necessarily across separate generations" — this is the **accent/voice-drift issue** (EMPIRICAL, ugccopilot). Since you can't clone a voice and each 15s clip is a fresh synthesis, the voice CAN shift between segments.
- **Minimize via description (best you can do natively):**
  - Use a **verbatim-identical voice descriptor** in every segment — same age, gender, energy, accent, AND language: e.g., `Voiceover: a warm, upbeat woman in her late 20s, light American accent, medium pace`. Don't paraphrase it between clips.
  - Keep the **same on-screen character** (same face ref) in dialogue segments — timbre is inferred partly from the visible character, so a consistent face helps a consistent voice.
  - Keep **dialogue cadence/energy** consistent (don't go calm in clip 1 and frantic in clip 3).
- **If voice consistency is mission-critical, escape the limitation entirely:** generate the N clips with `generate_audio: true` for lip-sync timing but **overdub a single consistent voice in post** (one TTS/cloned voice across all segments), or generate dialogue clips silent + lay one continuous VO over the merged cut. This is the only way to _guarantee_ a uniform voice across separately-generated clips. Recommend exposing a pipeline flag: "native voice (fast, slight drift risk)" vs "post-dub VO (guaranteed consistent)."

---

## Recommendations (staged)

1. **Adopt now (low risk):** the 60–100-word "short-and-dense" rule with lighting + one camera move always present; time-sliced causal prompts; `@Image1`-role labelling for the storyboard sheet; quoted dialogue with a verbatim voice descriptor; look-family-conditional negatives (replace the single global negative string).
2. **Restructure negatives:** swap the fixed `jitter/limbs/flicker/identity` closer for the four look-family closers in Deliverable 5; add `no music, no logo, no text on screen` to all UGC types.
3. **Continuity:** introduce a frozen "continuity block" + fixed seed for multi-segment ads; pin identical image guidance across segments.
4. **Voice:** ship the synthesized-voice path as default, but add a "post-dub VO" mode for any ad ≥30s where voice drift would be noticeable (brand-story, spokesperson, founder-pov especially).
5. **Validate the API schema against your live ModelArk console** — confirm the exact parameter names (`generate_audio`, `seed`, `return_last_frame`, `resolution` ceilings per tier) since the official docs page didn't render its parameter table for extraction.

**Thresholds that change the above:** if you see persistent cross-segment voice drift in QA, switch that ad type to post-dub VO. If text legibility fails on graphic_text types, that's a prompt-clarity issue (shorten text, name it explicitly) not a negative-prompt issue. If face morphing appears, reduce to ONE clean face crop and lower scene complexity.

## Caveats

- **Official docs are partly inaccessible in plain text.** The BytePlus ModelArk prompt-guide and API-reference pages are JS-rendered; verbatim parameter tables could not be extracted. Prose marked "DOCUMENTED (via translation/mirror)" relies on a faithful English translation of ByteDance's own Mandarin manual and on official-host (fal.ai)/mirror schemas. **Validate the exact request body against your console.**
- **Fast-moving benchmark.** On the Artificial Analysis Video Arena, Dreamina Seedance 2.0 720p currently holds **Elo 1273 (text-to-video, no audio, #2)**, **Elo 1344 (image-to-video, no audio, #1)**, **Elo 1194 (image-to-video, with audio, #1)**, and **Elo 1218 (text-to-video, with audio, #1)** — i.e., it leads every "with audio" category. Alibaba's Happy Horse 1.0 (released Apr 26, 2026) edged ahead on text-to-video-without-audio at **Elo 1292 vs Seedance's 1273 — a ~19-Elo lead, not a large margin**. Leaderboard positions shift weekly; this doesn't change prompting practice but affects model-choice decisions.
- **Vendor/marketing bias.** Many empirical sources are AI-tooling vendors with incentives; I weighted the official translation, fal.ai (official host), and convergent multi-source claims highest, and flagged single-source claims.
- **Policy.** Real-person face uploads are blocked and the photo→voice cloning feature is suspended; build around stylized/generated faces and synthesized/post-dubbed voices. Context: Douyin VP Li Liang said (Feb 15, 2026) Seedance 2.0 "would temporarily stop generating realistic human faces and IP-protected characters"; Disney issued a Feb 13, 2026 cease-and-desist (calling it a "virtual smash-and-grab") and the MPA set a Feb 27, 2026 remediation deadline. Expect access/feature rules to keep evolving.
