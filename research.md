# Engineering a Photorealistic, Physically-Correct UGC Ad Pipeline (GPT-Image-2 → Seedance 2.0)

## TL;DR

- **Fix realism and physics at the storyboard-image stage first.** GPT-Image-2 must render a _photorealistic_ 2×2 grid whose four panels encode a causal state progression (a prep-state change in an earlier panel that persists into the use panel); Seedance 2.0 inherits the still's photographic style and panel order, so a fake-looking or state-inconsistent grid guarantees a fake-looking, state-broken video.
- **Replace negative walls with positive causal + photographic signals.** Both models respond far better to "what IS true" than "what to avoid": for GPT-Image-2 use photography vocabulary (lens, lighting, imperfections) and an explicit panel-by-panel state machine; for Seedance use the Subject+Action+Scene+Camera+Style+Constraints structure with one verb per shot, one camera move, a short 3–5 item Avoid: tail, and quoted dialogue with an emotion/accent tag.
- **Audio is solvable with discipline, not luck.** Seedance generates joint native audio (`generate_audio:true`); keep spoken lines short (~12 words/10s, ~20 words/15s), quote them, tag voice tone + accent, insert written beats as re-sync anchors, and suppress the default music with "no music."

---

## Key Findings

### Source quality map (official vs community)

**First-party / official:**

- **OpenAI GPT Image Generation Models Prompting Guide** (developers.openai.com cookbook, published Apr 21, 2026) — the authoritative GPT-Image-2 guide. Fully retrievable; contains explicit photorealism, multi-panel, multi-image, and product-fidelity guidance.
- **BytePlus ModelArk Seedance 2.0 docs**: "Dreamina Seedance 2.0 series prompt guide" (ModelArk/2222480), "Seedance 2.0 API Reference / Create a video generation task" (ModelArk/1520757), "Series tutorial" (ModelArk/2291680). These are official but **client-rendered / partially sign-in-gated** — their body text could not be extracted directly. Their substance was recovered via a near-verbatim mirror (seedance2.ai/guide, whose examples match Google's indexed snippets of the official page) and corroborating API references.
- **fal.ai, Replicate, WaveSpeed, Atlas Cloud, Pixazo** — platform docs hosting the official Seedance/GPT-Image-2 APIs; reliable for parameters.

**Community (well-tested, weight second):** apiyi.com "official prompt guide interpretation," ugccopilot.ai native-audio guide, cutout.pro / crepal.ai lip-sync field notes, the fal GPT-Image-2 guide, James Palm's UGC reverse-engineering, miraflow/aivideobootcamp photorealism guides, redreamality/promptaivideos/sirioberati Seedance guides. Many "official Seedance guides" online are community blogs — treat their _formula_ as reliable (it is consistent across many independent testers) but their _parameter claims_ as needing verification against BytePlus.

**Critical caveat flagged across sources:** visual realism and physical correctness are _not_ the same axis. Per the Physics-IQ benchmark (Motamed et al., "Do generative video models learn physical principles from watching videos?", arXiv:2501.09038, Jan 2025), models "achieve visual realism without understanding the physical principles of reality," and across Sora, Runway, Pika, Lumiere, Stable Video Diffusion and VideoPoet "physical understanding is severely limited, and unrelated to visual realism" — "those two properties are not statistically significantly correlated." This is exactly why the cap-on-bottle error needs an explicit _causal_ prompt fix, not just a "more realism" fix.

### The three problems, root-caused

**Problem 1 — Physically-impossible product use (cap-on-bottle).** This is a confirmed general class of failure. Per PhyRPR ("Training-Free Physics-Constrained Video Generation," arXiv:2601.09255): "despite their impressive visual realism, video diffusion models remain largely correlation-driven: they primarily exploit patterns in large-scale training data, rather than explicitly enforcing physical constraints. As a result, they often fail in scenarios with clear physical constraints." OpenAI's own Sora technical report ("Video generation models as world simulators," Feb 2024) states Sora "does not accurately model the physics of many basic interactions, such as glass shattering," and that "other interactions, like eating food, do not always yield correct changes in the object state." The Physics-IQ paper gives a vivid state-error example of the same class: "in a scenario where a burning matchstick is lowered into a glass full of water… Runway Gen 3 generates a continuation where as soon as the flame touches the water, a candle spontaneously appears and is lit by the match." The fix is _temporal/causal structuring_: research on multi-event generation (Prompt Relay, arXiv:2604.10030) shows models treat a single paragraph as global context and "bleed" concepts across time unless you give explicit per-segment ordering. Practically: a prep state-change (cap removed) must occupy an **earlier panel / earlier timestamp** than the use, the changed state must be **restated as persisting**, and the product must be shown **functioning** (liquid level drops, cap set aside on the counter).

**Problem 2 — Fake "AI ad" look.** The dominant tells are over-smooth surfaces, studio-perfect lighting, and over-saturation. The fix (consistent across OpenAI's guide and every photorealism source) is to _prompt as if a real photo is being captured_: name the camera/lens, name the exact light source and direction, demand real texture (pores, fabric weave, wear), and explicitly forbid glamorization/heavy retouching. The user's key insight is correct and corroborated by the whole pipeline community: **fix realism in the GPT-Image-2 still first** because Seedance treats the storyboard as "visual DNA" (characters, wardrobe, lighting, palette all locked from the image), so a photoreal still propagates to a photoreal video.

**Problem 3 — Audio/voice.** Seedance 2.0 uses _joint_ audio-video synthesis (one forward pass), which gives tighter lip-sync than bolt-on pipelines but has documented failure modes: lip-sync drift on long/long-line clips, default auto-inserted background music, accent drift across generations, and foley desync at 15s. All are addressable in the prompt.

---

## Details

### A. GPT-Image-2 (storyboard still) — official prompting model

**Structure that works (OpenAI official):** write in consistent order — _background/scene → subject → key details → constraints_ — and include the **intended use** ("UGC ad," "brand film") to set the polish "mode." For complex requests use **short labeled segments / line breaks**, not one paragraph. The model weights early tokens most heavily, so put the core subject/use first (community-confirmed).

**Photorealism levers (OpenAI official, verbatim guidance):**

- Include the literal word **"photorealistic"** to engage the photoreal mode; "real photograph," "taken on a real camera," "iPhone photo" also help. _Camera specs are interpreted loosely_ — use them for look/composition, not exact physical simulation.
- Use **photography language**: lens (35mm, 50mm, 85mm), framing (medium close-up, eye level), depth of field, film grain, natural color balance.
- Demand **real texture and imperfection**: "visible wrinkles, pores, sun texture," "worn materials, everyday detail."
- **Explicitly forbid the AI look**: "No glamorization, no heavy retouching," "Avoid cinematic lighting, dramatic color grading, or stylized composition" (OpenAI's own bear-attack and sailor examples do exactly this).
- Set `quality:"high"` when the image has dense detail/small text (storyboard captions, product labels).

**UGC vs inspirational aesthetic (community-validated):**

- **UGC/amateur:** "shot on iPhone [model] front/back camera," harsh overhead fluorescent or on-camera flash, slight motion blur, lens smudge, mild distortion at frame edges, JPEG compression in shadows, slight color cast, casual unposed body language, ordinary/average-looking subject, messy real environment. The single biggest UGC-killer is **studio lighting** — explicitly avoid it. Describe a _real moment mid-action_, not a photoshoot.
- **Inspirational/cinematic:** prime lens at wide aperture (f/1.8–f/2.0), golden-hour or motivated key light, rim light, restrained "magazine-grade commercial" color grade, shallow depth of field, deliberate composition/negative space. Still demand real skin texture to avoid the plastic look.

**2×2 grid with labelled panels + consistent identity (OpenAI "story-to-comic" pattern):** OpenAI's documented approach is to define the narrative as _clear visual beats, one per panel_, with concrete action-focused descriptions. For identity lock across panels, OpenAI's "character anchor" technique applies: fix appearance/proportions/wardrobe once and restate it for every panel. A single-image 2×2 grid naturally enforces consistency because all four panels are "regions on the same canvas" (community finding — eliminates downstream identity engineering).

**Forensic product fidelity (OpenAI edit guidance):** When the product image is passed as a reference/edit input, GPT-Image-2 processes references at high fidelity automatically. Lock it with explicit preserve language: "Preserve the product shape, label text, proportions, color, and material exactly. Do not restyle the product." Put any on-pack text in quotes for verbatim rendering. Label multiple inputs by index ("Image 1: product photo; Image 2: person").

**Encoding the causal 4-panel state machine (the core fix for Problem 1):** Treat each panel as a time-slice in a state machine and _write the state explicitly in each caption and scene description_:

- Panel 1 = baseline/approach (product in initial state, e.g., closed).
- Panel 2 = **prep state-change** (the enabling action: cap twisted off and **set on the counter**).
- Panel 3 = **use with persisted state + functioning** (drinking; cap still off and visible aside; liquid level visibly lower).
- Panel 4 = aftermath/payoff (satisfied beat; product state consistent with prior panels).
  This derives generically from any product by extracting its _access/operation verb_ (uncap, open lid, unclasp, power on, twist, flip) and its _visible function signal_ (liquid drops, steam rises, screen lights, strap closes).

**Negative-vs-positive balance (OpenAI):** state exclusions explicitly but briefly ("no watermark, no extra text, no logos/trademarks"); carry the heavy lifting with positive description and a restated preserve list.

### B. Seedance 2.0 (video) — official + community prompting model

**API ground truth (model `dreamina-seedance-2-0-260128`, BytePlus global endpoint `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`):**

- `content`: array of typed objects — `{type:"text"}`, `{type:"image_url",image_url:{url}}` (storyboard sheet as first/reference image), plus additional `image_url` for the person/face reference.
- `ratio`: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`, `adaptive`.
- `resolution`: `480p`/`720p`/`1080p`/`2K`; **1080p is supported** on the native BytePlus route (some third-party resellers cap at 720p — verify per account).
- `duration`: integer 4–15; `-1` = auto.
- `generate_audio` (boolean, enable for native voice/SFX/music), `watermark` (boolean), `seed` (int; -1 random), `camerafixed`, `return_last_frame`, `callback_url`.
- Multimodal reference limits: up to 9 images, 3 video clips (2–15s each), 3 audio files; first/last-frame mode and multi-reference mode are mutually exclusive; audio cannot be submitted alone.

**Prompt structure (official formula via mirror + community consensus):** **Subject → Action → Environment → Camera → Style → Constraints**, target **60–100 words**. Rules that recur across every independent tester:

- **One verb per shot** — "She walks slowly toward the window," not a chain of actions (multiple verbs blend into mush).
- **One primary camera move**, paired with a pacing word (slow/smooth/gentle) and optionally a distance; separate camera movement from subject movement.
- **Lighting is the single highest-leverage element** — one good lighting line beats ten adjectives.
- **The model follows the first 2–3 instructions most reliably**; after ~8 requirements only ~4–5 land. Front-load the critical direction.
- Use the **same noun** for the subject throughout (no "a man" → "the detective" drift).

**Negative prompting (important nuance):** The widely-reproduced rule is that Seedance does **not** support traditional negative prompts — phrasing like "no blur" can parse the noun "blur" as content to include. The robust pattern is **positive constraints** ("sharp, in-focus, stable face, natural proportions") plus a **short Avoid:/constraints tail of 3–5 items max** placed at the end. A minority of platform docs say short negative lines do work; the safe, consistent practice is: positive phrasing for quality, and a tiny targeted tail only for stubborn recurring artifacts and for suppressing defaults ("no music, no on-screen captions, no watermark").

**Reference conditioning & the storyboard grid:** Seedance treats an uploaded grid as composition/visual-DNA and will animate panels **in order** if told to. Reference naming in the official prompt guide is natural-language **"Image 1 / Image 2"**; the **@Image1** form is the Dreamina console/@-mention convention (and some reseller APIs) — since this system uses the `@Image 1` syntax, keep it but describe the role in words too. **Crucial grid pitfall (community, strongly corroborated):** if you tell it to "pan across the storyboard," it will literally film a comic page. Instead, describe the _real scene's action_ and explicitly instruct it to render the live scene, not the panels-as-image. There is **no official anti-grid-line directive**, so you must author one: add "render as one continuous live-action scene, do not show grid lines, panel borders, captions, or text overlays."

**Timeline/beat prompting (the Problem-1 fix in video):** Seedance supports timestamped beats within a single generation (it flows between beats rather than hard-cutting). Divide ~15s into 3–4 beats, one action per beat, and **encode the causal sequence as ordered beats**: the prep state-change beat must precede the use beat, and you restate the persisted state in the later beat ("cap already off and resting on the counter; water level lower than before"). This directly counteracts the "global context bleed" that produces cap-on-bottle drinking.

**Product motion / functioning:** name the operative motion and its visible consequence ("liquid level drops as she drinks," "steam rises," "strap clasps shut") — Seedance is documented as strong on pour/click/snap foley and on object-state reveals.

**Audio / voice / lip-sync (official + ugccopilot/cutout/crepal field notes):**

- `generate_audio:true` produces three joint layers: dialogue (lip-synced), ambient (environment-aware), foley.
- **Quote the spoken line** and attach a **voice descriptor + accent**: e.g., `A warm, upbeat young woman (American accent, conversational) says: "..."`. Tone adjectives set mouth openness/breathing and improve sync.
- **Keep lines short to prevent drift:** ~12 words for a 10s clip, ~20 words for a 15s clip. Insert a written beat ("She pauses, then continues:") between sentences — Seedance uses written beats as **re-sync anchors**.
- **Suppress default music** with the literal "no music" (more reliable than "no background music"); for UGC authenticity request "ambient room tone… single-take phone recording quality."
- **Foley desync** worsens at 15s; for audio-critical product sounds consider 8–10s.
- Lip-sync is best with stable framing and the mouth clearly in frame — avoid big head turns/extreme camera moves during the spoken line.

### C. Comparison & recommendation for THIS system

- **Where to spend effort:** ~70% on the GPT-Image-2 still. It is the cheapest place to fix realism, identity, product fidelity, _and_ the causal state machine, and Seedance inherits all four. A correct, photoreal, state-consistent grid is the highest-leverage single artifact in the pipeline.
- **Causal logic belongs in BOTH stages** but expressed differently: in the still as **panel order + per-panel state captions**; in the video as **ordered timestamped beats + persisted-state restatement**. Redundancy is the point — the still sets the keyframes, the video's beats prevent temporal bleed.
- **Negatives:** minimal in both. GPT-Image-2 tolerates a short exclusion list; Seedance needs positive constraints + a 3–5 item tail. Long negative walls (the current root cause) actively hurt.
- **Photorealism anchoring in Seedance:** because style is inherited from the still, the video prompt only needs a _light_ style re-anchor ("photorealistic, true-to-life color, natural skin texture, handheld single-take feel" for UGC; "cinematic, shallow depth of field, natural light" for inspirational) — do not re-describe the whole look.
- **Resolution/format:** 1080p, 16:9 or 9:16, duration ~15s, `generate_audio:true`, `watermark:false` — all supported by the documented parameter set.

---

## (B) Ready-to-paste prompt-builder code

Both builders are **generic and per-product-derived** — no hard-coded product list. They derive the causal sequence from a small `productUse` descriptor you compute once per product (ideally via an LLM call or simple heuristics), with fields for the access verb, the changed state, the persistence cue, and the function signal.

### Shared types (put in a common module, e.g. `prompt/types.ts`)

```ts
export type AdType = "ugc" | "inspirational";

// Derived ONCE per product — generic, not hard-coded to bottles.
export interface ProductUse {
  productNoun: string; // "stainless-steel gym water bottle", "automatic dive watch"
  accessVerb: string; // enabling state-change: "twist off the cap", "unclasp the strap"
  changedState: string; // resulting persistent state: "cap off, resting on the counter"
  persistenceCue: string; // restated later: "cap still off beside her, set down earlier"
  functionSignal: string; // visible functioning: "water level visibly lower", "second hand sweeping"
  useVerb: string; // the actual use: "drinks", "checks the time on"
  forensicMarks: string; // what must be preserved: "the embossed logo, lid threads, matte finish"
}

export interface StoryboardScene {
  cameraAngle: string;
  actionMovement: string;
  sceneDescription: string; // ~40-70 words
  panelCaption: string;
  transcript: string; // spoken UGC line or VO
  adStyle: string;
}

export interface AdSpec {
  adType: AdType;
  ratio: "16:9" | "9:16";
  productUse: ProductUse;
  personDescription?: string; // for the face reference
  brand?: string;
  scenes: StoryboardScene[]; // exactly 4
}
```

### `storyboard/prompt.ts` — GPT-Image-2 photoreal 2×2 grid builder

```ts
import { AdSpec, AdType, ProductUse, StoryboardScene } from "../prompt/types";

// --- Aesthetic presets: positive photographic signals, not negative walls ---
function realismProfile(adType: AdType): string {
  if (adType === "ugc") {
    return [
      "Photorealistic, looks like a real photo taken on an iPhone 15 Pro,",
      "authentic amateur UGC aesthetic: candid mid-action moment (not posed),",
      "natural indoor lighting or on-camera flash, slight handheld imperfection,",
      "true-to-life muted color, visible skin pores and texture, fabric weave and folds,",
      "ordinary real environment with everyday clutter.",
      "No glamorization, no heavy retouching, no studio lighting, no over-saturation.",
    ].join(" ");
  }
  // inspirational / cinematic brand-film
  return [
    "Photorealistic commercial photography, shot on a 50mm prime at f/2.0,",
    "motivated natural key light with soft rim light, golden-hour warmth,",
    "shallow depth of field, restrained magazine-grade color grade,",
    "real skin texture with fine detail, premium materials rendered honestly.",
    "No plastic over-smoothing, no garish saturation, no obvious CGI look.",
  ].join(" ");
}

// --- Causal state-machine assignment across the 4 panels (generic) ---
// Panel 1 baseline -> Panel 2 prep state-change -> Panel 3 use+persist+function -> Panel 4 payoff.
function panelStateLine(index: number, p: ProductUse): string {
  switch (index) {
    case 0:
      return `PRODUCT STATE: initial/closed. The ${p.productNoun} is held or in frame in its starting state.`;
    case 1:
      return `PRODUCT STATE CHANGE (prep): the person performs the enabling action — ${p.accessVerb}. Result now visible: ${p.changedState}.`;
    case 2:
      return `PRODUCT STATE PERSISTS + FUNCTIONS: ${p.persistenceCue}; the person ${p.useVerb} the ${p.productNoun}; ${p.functionSignal}.`;
    case 3:
      return `PRODUCT STATE CONSISTENT: aftermath/payoff beat; product state matches the earlier panels (do not revert the state change).`;
    default:
      return "";
  }
}

export function buildStoryboardImagePrompt(spec: AdSpec): string {
  const { adType, productUse, scenes, ratio } = spec;
  const useLabel =
    adType === "ugc"
      ? "authentic UGC social ad"
      : "cinematic inspirational brand film";

  const header = [
    `Create a single photorealistic 2x2 storyboard sheet (four equal panels, labelled Panel 1 to Panel 4) for a ${useLabel}.`,
    `Aspect ratio ${ratio}. Treat this as a real-photography storyboard: every panel must look like a genuine photograph, the SAME person and the SAME ${productUse.productNoun} across all four panels (consistent face, hair, wardrobe, body, and product identity).`,
    realismProfile(adType),
  ].join(" ");

  // Forensic product fidelity (works for generate-with-reference; restate every run)
  const fidelity = [
    `PRODUCT FIDELITY: preserve exactly ${productUse.forensicMarks};`,
    `keep the product's shape, proportions, color, material and all on-pack text identical in every panel; do not restyle or invent branding.`,
  ].join(" ");

  // Per-panel blocks: caption + camera + action + ~40-70w scene + the causal state line
  const panels = scenes
    .slice(0, 4)
    .map((s: StoryboardScene, i: number) => {
      return [
        `PANEL ${i + 1} — caption "${s.panelCaption}":`,
        `${s.cameraAngle}, ${s.actionMovement}.`,
        s.sceneDescription,
        panelStateLine(i, productUse),
      ].join(" ");
    })
    .join("\n");

  const constraints = [
    "LAYOUT: clean 2x2 grid, thin neutral gutters, each panel clearly separated and legible.",
    "Render each panel caption as small sharp text in quotes exactly as given, no other text.",
    "No watermark, no logos other than the product's own, no extra captions.",
  ].join(" ");

  return [header, fidelity, "PANELS:", panels, constraints].join("\n");
}
```

### `video/prompt.ts` — Seedance 2.0 single-line directive builder

```ts
import { AdSpec, AdType, ProductUse, StoryboardScene } from "../prompt/types";

// Light style re-anchor only (style is inherited from the storyboard still).
function styleAnchor(adType: AdType): string {
  return adType === "ugc"
    ? "photorealistic, true-to-life color, natural skin texture, single-take handheld phone-recording feel"
    : "photorealistic cinematic, shallow depth of field, natural motivated light, premium brand-film grade";
}

// Audio direction: quoted line + voice tone + accent, music suppressed for UGC realism.
function audioLine(scene: StoryboardScene, adType: AdType): string {
  const voice =
    adType === "ugc"
      ? "a warm, upbeat young woman (American accent, conversational, single-take phone-recording clarity)"
      : "a calm, confident narrator (American accent, measured, cinematic warmth)";
  // Keep lines short; caller should pre-trim transcript (~12 words/10s, ~20 words/15s).
  return `${voice} says: "${scene.transcript.trim()}"`;
}

// Build one timestamped, causal beat per scene (3-4 beats over ~15s).
function beats(spec: AdSpec): string {
  const { scenes, productUse, adType } = spec;
  const n = Math.min(scenes.length, 4);
  const slot = Math.floor(15 / n); // ~ even beats across 15s
  return scenes
    .slice(0, n)
    .map((s, i) => {
      const t0 = i * slot;
      const t1 = i === n - 1 ? 15 : (i + 1) * slot;
      // Encode the SAME causal state machine as the storyboard, as ordered beats.
      let stateBeat = "";
      if (i === 0)
        stateBeat = `${productUse.productNoun} in its initial closed state`;
      else if (i === 1)
        stateBeat = `she ${productUse.accessVerb}; now ${productUse.changedState}`;
      else if (i === 2)
        stateBeat = `${productUse.persistenceCue}; she ${productUse.useVerb} it; ${productUse.functionSignal}`;
      else
        stateBeat = `payoff beat; product state stays consistent (state change not reverted)`;
      return `${t0}-${t1}s: ${s.cameraAngle}, ${s.actionMovement}; ${stateBeat}; ${audioLine(s, adType)}`;
    })
    .join(" ");
}

export function buildVideoPrompt(spec: AdSpec): string {
  const { adType, productUse } = spec;

  // SEGMENT 1 — Global setup
  const global = [
    `One continuous live-action ${adType === "ugc" ? "UGC" : "cinematic"} ad, ~15s.`,
    `Use @Image 1 as the storyboard/visual reference (characters, wardrobe, lighting and the ${productUse.productNoun} are locked from it) and @Image 2 as the person's face reference.`,
    `Render the real scene as one continuous shot — do NOT show grid lines, panel borders, captions, or text overlays from the reference.`,
    `Same person and same ${productUse.productNoun} throughout (${productUse.forensicMarks} preserved, no logo drift).`,
  ].join(" ");

  // SEGMENT 2 — Timeline (ordered causal beats, one action + one camera move each)
  const timeline = `Timeline — ${beats(spec)}`;

  // SEGMENT 3 — Quality & constraints (positive + short Avoid tail)
  const quality = [
    `Style: ${styleAnchor(adType)}.`,
    `Smooth natural motion, stable face and proportions, accurate physics, product state changes persist across the clip.`,
    `Native audio on: clear lip-synced dialogue matching the quoted lines, ambient room tone; no music.`,
    `Avoid: jitter, bent limbs, identity drift, on-screen captions/grid lines, reverting the product state.`,
  ].join(" ");

  // Emit ONE engineered single-line directive in 3 labelled segments.
  return [
    `Global setup · ${global}`,
    `Timeline · ${timeline}`,
    `Quality & constraints · ${quality}`,
  ].join("  ||  ");
}

// Request params for the API call (BytePlus ModelArk):
export function buildVideoRequest(spec: AdSpec) {
  return {
    model: "dreamina-seedance-2-0-260128",
    content: [{ type: "text", text: buildVideoPrompt(spec) }],
    ratio: spec.ratio, // '16:9' | '9:16'
    resolution: "1080p",
    duration: 15,
    generate_audio: true,
    watermark: false,
  };
}
```

### Concrete example output 1 — 'ugc' gym water bottle

`ProductUse`:

```
productNoun: "stainless-steel gym water bottle"
accessVerb: "twists off the cap"
changedState: "cap off and set on the bench beside her"
persistenceCue: "cap still off on the bench from a moment ago"
functionSignal: "water level visibly drops as she gulps"
useVerb: "drinks from"
forensicMarks: "the embossed brand logo, the matte teal finish, the lid threads"
```

GPT-Image-2 storyboard prompt (abridged emitted form):

> Create a single photorealistic 2x2 storyboard sheet (four equal panels, labelled Panel 1 to Panel 4) for an authentic UGC social ad. Aspect ratio 9:16. … Photorealistic, looks like a real photo taken on an iPhone 15 Pro, authentic amateur UGC aesthetic: candid mid-action moment … No glamorization, no heavy retouching, no studio lighting. PRODUCT FIDELITY: preserve exactly the embossed brand logo, the matte teal finish, the lid threads … PANELS: PANEL 1 — caption "post-set thirst": eye-level handheld, she reaches for the bottle … PRODUCT STATE: initial/closed. PANEL 2 — caption "cap off": she twists off the cap. Result now visible: cap off and set on the bench beside her. PANEL 3 — caption "big gulp": she drinks from the bottle; cap still off on the bench from a moment ago; water level visibly drops as she gulps. PANEL 4 — caption "back to it": aftermath; product state matches earlier panels …

Seedance directive (emitted single line):

> Global setup · One continuous live-action UGC ad, ~15s. Use @Image 1 as the storyboard/visual reference … and @Image 2 as the person's face reference. Render the real scene as one continuous shot — do NOT show grid lines, panel borders, captions, or text overlays. Same person and same stainless-steel gym water bottle throughout (embossed brand logo, matte teal finish, lid threads preserved). || Timeline · 0-3s: eye-level handheld, she reaches for the bottle; bottle in its initial closed state; a warm, upbeat young woman (American accent, conversational) says: "Okay gym besties, hydration check." 3-7s: medium handheld, she twists the cap; she twists off the cap; now cap off and set on the bench beside her; … says: "Cap off—" 7-11s: close handheld, she drinks; cap still off on the bench from a moment ago; she drinks from it; water level visibly drops as she gulps; … says: "—and this thing keeps it ice cold." 11-15s: she lowers the bottle; payoff beat; product state stays consistent; … says: "Obsessed, honestly." || Quality & constraints · Style: photorealistic, true-to-life color, natural skin texture, single-take handheld phone-recording feel. Smooth natural motion, stable face, accurate physics, product state changes persist. Native audio on: clear lip-synced dialogue, ambient gym room tone; no music. Avoid: jitter, bent limbs, identity drift, on-screen captions/grid lines, reverting the product state.

### Concrete example output 2 — 'inspirational' watch

`ProductUse`:

```
productNoun: "automatic dive watch"
accessVerb: "unclasps and fastens the strap"
changedState: "strap clasped snug on the wrist"
persistenceCue: "watch already fastened on the wrist"
functionSignal: "the second hand sweeping smoothly, lume glinting"
useVerb: "checks the time on"
forensicMarks: "the engraved bezel markings, the brand text on the dial, the brushed-steel case"
```

Seedance directive (emitted single line):

> Global setup · One continuous live-action cinematic ad, ~15s. Use @Image 1 as the storyboard/visual reference … and @Image 2 as the person's face reference. Render the real scene as one continuous shot — do NOT show grid lines, panel borders, captions, or text overlays. Same person and same automatic dive watch throughout (engraved bezel markings, brand text on the dial, brushed-steel case preserved). || Timeline · 0-4s: low angle, slow push-in, the watch resting in its case; automatic dive watch in its initial closed state; a calm, confident narrator (American accent, measured) says: "Some things are worth the wait." 4-8s: medium, he unclasps and fastens the strap; now strap clasped snug on the wrist. 8-12s: macro, slow orbit, watch already fastened on the wrist; he checks the time on it; the second hand sweeping smoothly, lume glinting; narrator says: "Built to outlast the moment." 12-15s: pull back to the wrist at his side; payoff; product state stays consistent. || Quality & constraints · Style: photorealistic cinematic, shallow depth of field, natural motivated light, premium brand-film grade. Smooth natural motion, stable proportions, accurate physics, product state persists. Native audio on: clear lip-synced narration, soft ambient room tone; no music. Avoid: jitter, identity drift, on-screen captions/grid lines, reverting the product state.

### Wiring notes for Claude Code

1. **Derive `ProductUse` once per product** (LLM or rules) by extracting the access verb, the resulting persistent state, a persistence restatement, and a visible function signal. This is the single generalization point — no product list needed.
2. In `storyboard/prompt.ts`, the `panelStateLine()` function is the causal state machine; the scenes array still drives camera/action/caption/transcript, but the state line is injected per panel so the still bakes in cap-off-then-drink ordering.
3. In `video/prompt.ts`, `beats()` re-expresses the _same_ state machine as ordered timestamps so Seedance doesn't bleed states across time; `audioLine()` handles quoted dialogue + voice tone + accent; pre-trim `transcript` to ~12 words (10s) / ~20 words (15s) before building.
4. Keep the **Avoid:** tail to ≤5 items and keep all other guidance positive.
5. Set `generate_audio:true`, `watermark:false`, `resolution:'1080p'`, `ratio` per spec, `duration:15`.

---

## Recommendations (staged)

1. **Ship the storyboard-stage fix first (highest leverage).** Rewrite `storyboard/prompt.ts` to (a) lead with `realismProfile()` photographic signals, (b) inject `panelStateLine()` per panel, (c) restate forensic product fidelity every run. **Threshold to proceed:** in a 20-image sample, ≥90% show the product in the physically-correct state in Panel 3 (cap off while drinking) and read as photographs, not AI art.
2. **Then rewrite `video/prompt.ts`** to the 3-segment single-line directive with ordered causal beats, the grid-suppression line, light style re-anchor, quoted/tagged audio, and the short Avoid: tail. **Threshold:** ≥80% of clips preserve the product state across the full 15s and show the function signal.
3. **Tune audio.** If lip-sync drifts: shorten lines and add written-beat anchors; if music leaks: confirm "no music" is present; if accent drifts across renders: pin accent in every beat. **Threshold:** lip-sync acceptable on first take in ≥70% of UGC clips; if not, drop dialogue-heavy beats to 8–10s.
4. **A/B negatives.** Run identical specs with the short Avoid: tail vs. no tail to confirm the tail isn't degrading output (Seedance can over-reject with long negatives). Keep whichever wins; never reintroduce long negative walls.
5. **Lock a seed during prompt iteration** so you can attribute changes to the prompt, not the dice; release the seed for production variety.
6. **Escalate quality only where needed:** GPT-Image-2 `quality:"high"` for the grid (captions + labels are dense); Seedance 1080p standard tier for finals, fast tier for iteration.

---

## Caveats

- **Official Seedance body text could not be fully extracted** (BytePlus pages are client-rendered/partially sign-in-gated). The prompt formula and examples come from a near-verbatim mirror plus consistent community corroboration; verify the live parameter table against your BytePlus account, especially the **resolution ceiling** (native route supports 1080p/2K; some resellers cap at 720p).
- **`@Image` vs "Image 1":** the official prompt guide uses natural-language "Image 1"; the `@Image 1` form is the Dreamina/console convention this system already uses — both are kept in the templates with the role described in words.
- **No official anti-grid-line directive exists** — the grid-suppression instruction in the template is author-added best practice, validated by community reports that the model otherwise films the comic page.
- **Real-face uploads:** ByteDance tightened restrictions on identifiable real-face reference images in 2026; the person/face reference may be rejected or altered. Test with your actual reference assets; have an AI-generated-persona fallback.
- **Physics is probabilistic, not guaranteed.** Even with causal prompting, expect a minority of state errors at 15s; the staged thresholds above assume re-rolls. Foley/lip-sync reliability degrades toward 15s — shorten audio-critical beats if needed.
- **Model/version drift:** GPT-Image-2 (Apr 21, 2026 guide) and Seedance 2.0 (`dreamina-seedance-2-0-260128`) are current as of June 8, 2026; prompt behavior may shift with updates — keep the seed-locked eval harness to detect regressions.
