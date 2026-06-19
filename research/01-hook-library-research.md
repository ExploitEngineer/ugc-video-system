# Hook Library & `HookDef` Registry for the AI Ad-Video Generator

A hook = a small, **ad-type-agnostic opening fragment** injected into the FIRST
scene/shot of the storyboard and the first time-slice of the video prompt. One ad type +
one (or at most two) hook(s) = the type's base treatment + a hook opening. **No ad-type ×
hook matrix** — hooks are an orthogonal layer.

**16 hooks.** Only **two** require a person on screen (`testimonial`, `confession`) and only
**one** requires a product in frame (`demonstration`); the other 13 can open an asset-free
ad. That keeps hooks compatible with the "neither product nor person" ad types
(`brand-awareness`, `explainer`, `social-proof`, `promo-offer`, `announcement`).

---

## Mapping from `02`'s placeholder hook ids → canonical ids

`02` used snake_case **placeholders** in `AdTypeDef.defaultHooks` / `allowedHooks`. Swap
them for these canonical kebab-case ids when wiring the registries:

| `02` placeholder    | canonical `HookDef.id` | note                                                                                                                     |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pattern_interrupt` | `pattern-interrupt`    | —                                                                                                                        |
| `curiosity_gap`     | `curiosity-gap`        | —                                                                                                                        |
| `pain_point`        | `problem-solution`     | the pain-first opening                                                                                                   |
| `contrarian`        | `contrarian`           | —                                                                                                                        |
| `direct_callout`    | `direct-callout`       | —                                                                                                                        |
| `question`          | `question`             | —                                                                                                                        |
| `stat_shock`        | `stat-shock`           | —                                                                                                                        |
| `social_proof`      | `social-proof`         | aggregate proof. For the **testimonial TYPE's** default, use the `testimonial` hook instead (one person, not aggregate). |
| `transformation`    | `before-after`         | the contrast/result-tease opening (distinct from the before-after ad _type_)                                             |
| `warning`           | `negativity-bias`      | warning/mistake opening                                                                                                  |
| `unboxing_reveal`   | — (folded)             | no standalone hook; use `curiosity-gap` + `demonstration` for the reveal opening                                         |
| `confession`        | `confession`           | —                                                                                                                        |

New hooks added beyond `02`'s seed: `bold-claim`, `relatable-scenario`,
`unexpected-comparison`, and an explicit `testimonial` hook split out from `social-proof`.

---

## Table 1 — Hook library

`woProd` / `woPerson` = can this hook open an ad with **no product shot** / **no on-screen person**.

| id                      | displayName                         | psych lever                                           | what it is / why it works                                                                                                                                   | openingDirective (drop in verbatim)                                                                                                                                                                                                                                                           | scriptToneNote                                                                                       | woProd | woPerson |
| ----------------------- | ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | -------- |
| `problem-solution`      | Problem–Solution (Pain-First)       | Loss aversion / problem recognition (Prospect Theory) | Opens on the frustrating moment the product later fixes, before the product appears; a vividly felt pain primes the desire for relief.                      | "Open on the exact frustrating moment the product solves — show the problem happening to the subject in close-up first, before the product is anywhere in frame. Hold on the friction for the first beat; do not reveal or name the product yet."                                             | First line names the pain in the viewer's own words ("Why won't this just…"), empathetic not salesy. | ✓      | ✓        |
| `pattern-interrupt`     | Pattern Interrupt                   | Orienting response / novelty                          | An unexpected, slightly jarring first frame that breaks the feed's rhythm and snaps the eye to what doesn't fit. Universal secondary hook.                  | "Open on a visually surprising, rhythm-breaking first frame — an unexpected object, motion, scale, or action that doesn't belong in a normal feed (something dropped, flipped, or revealed abruptly). The first ~0.5s must look 'wrong' enough to stop a thumb, then resolve into the scene." | Optional first line is abrupt or mid-thought, cut into the action.                                   | ✓      | ✓        |
| `curiosity-gap`         | Curiosity Gap                       | Information-gap curiosity (Loewenstein)               | Withholds a key piece of info, opening a loop the viewer must watch to close.                                                                               | "Open on a teaser that promises a payoff without delivering it — a partially hidden result, a covered object, or a 'wait for it' setup, paired with text like 'The one thing nobody tells you about \_\_\_'. Withhold the reveal until later in the ad."                                      | Conspiratorial, "let me show you something"; never state the answer in the first line.               | ✓      | ✓        |
| `question`              | Direct Question                     | Self-referential processing / open loop               | Poses a pointed question straight to the viewer; the brain starts answering before deciding to engage.                                                      | "Open with one short question on screen and/or spoken straight to camera in the first second (e.g., 'Still [doing the painful thing]?'). Frame the shot as addressing the viewer directly; keep the question under 8 words."                                                                  | Conversational, second-person ("you"), one question only.                                            | ✓      | ✓        |
| `stat-shock`            | Shocking Stat                       | Anchoring + surprise                                  | One surprising number that reframes the stakes and lends instant credibility.                                                                               | "Open on one big number as bold on-screen text, held for the first beat (e.g., '90% of people [surprising fact]'). Make the figure the visual focus of frame 1; keep supporting words minimal."                                                                                               | Read the number flatly and let it land before any pitch.                                             | ✓      | ✓        |
| `bold-claim`            | Bold Claim                          | Bold promise / skeptical curiosity                    | A confident, almost-too-good promise that dares the viewer to disprove it.                                                                                  | "Open with a single superlative claim as a spoken line and/or on-screen text in the first beat (e.g., 'The last \_\_\_ you'll ever buy'). Deliver it with full confidence and no hedging; pair with a clean hero frame."                                                                      | Assured, declarative, zero qualifiers.                                                               | ✓      | ✓        |
| `contrarian`            | Contrarian Take                     | Belief / expectation violation                        | Contradicts a widely held belief, forcing re-evaluation ("wait, that's wrong?").                                                                            | "Open by stating a common assumption and immediately negating it in the first beat (e.g., 'Stop [common advice] — here's why it's backwards.'). Shoot as a direct, confident address or bold text card; the contradiction must land in the first sentence."                                   | Confident, mildly provocative, "everyone's wrong about this."                                        | ✓      | ✓        |
| `testimonial`           | Testimonial Quote                   | Social proof (individual credibility)                 | A real person delivers a first-person verdict to camera before any pitch; a peer's lived endorsement lowers skepticism.                                     | "Open on a person talking straight to camera, mid-sentence, delivering their honest verdict as the very first words (e.g., 'I did not think this would work, but…'). Authentic, phone-captured framing; the face and voice carry the opening — no product or graphics first."                 | First-person, unscripted-sounding, starts mid-thought.                                               | ✓      | ✗        |
| `social-proof`          | Social Proof (Aggregate)            | Social proof (consensus / volume)                     | Stacked third-party proof — ratings, review snippets, press logos, user counts — establishing consensus up front.                                           | "Open on aggregated proof rendered as motion graphics — a wall of 5-star ratings, scrolling review snippets, a press-logo strip, or a big user-count — as the first frame. No single presenter; the proof elements are the visual."                                                           | Optional VO states the headline number ("Over 50,000 five-star reviews").                            | ✓      | ✓        |
| `before-after`          | Before / After Tease                | Contrast effect / transformation salience             | A stark before→after contrast compressed into the opening; the worse-to-better gap is instantly legible and desirable. (Hook ≠ the before-after ad _type_.) | "Open with a hard cut or split-screen between the 'before' and the 'after' in the first 1–2 seconds — show the worse state, then snap to the improved result. Make the contrast unmistakable in one beat; the product need not be in frame, only the change."                                 | Minimal words; let the visual contrast talk ("Watch this.").                                         | ✓      | ✓        |
| `demonstration`         | Demonstration (Show-It-Working)     | Visual proof / seeing-is-believing                    | Opens mid-action with the product visibly doing the impressive thing; proof by sight needs no argument. **Needs the product on screen.**                    | "Open mid-action on the product performing its single most impressive function in extreme close-up (the satisfying result happening in real time). The product and its effect fill the first frame; start at the peak of the action, not the setup."                                          | Few or no words; let the action play ("Just look.").                                                 | ✗      | ✓        |
| `relatable-scenario`    | Relatable Scenario                  | Self-identification / in-group recognition            | A hyper-specific everyday moment the target reads as "that's me," creating identification before selling.                                                   | "Open on a tightly specific everyday scene the target sees themselves in, framed POV or fly-on-the-wall (the 3pm slump, the messy junk drawer), with a caption like 'POV: \_\_\_'. Keep it mundane and recognizable; no product pitch in the first beat."                                     | Casual, knowing, second- or first-person ("us").                                                     | ✓      | ✓        |
| `direct-callout`        | Direct Callout                      | Self-relevance / cocktail-party effect                | Names the exact audience so the right viewer self-selects and feels personally addressed.                                                                   | "Open by calling out the target audience in the first words, spoken to camera and/or as bold text (e.g., 'If you have [trait/problem], stop scrolling.'). Make it specific enough that the right person knows it's for them within one second."                                               | Direct, second-person, slightly urgent.                                                              | ✓      | ✓        |
| `unexpected-comparison` | Unexpected Comparison               | Analogical framing / novelty                          | Likens the product or problem to something surprising and unrelated, making an abstract benefit concrete and memorable.                                     | "Open by comparing the product to something unexpected in the first beat (e.g., 'This does for your **_ what _** does for \_\_\_'), or cut between the product and the surprising stand-in. The comparison must be clear and a little jarring in one sentence."                               | Playful, "bet you didn't expect this."                                                               | ✓      | ✓        |
| `negativity-bias`       | Negativity Bias (Warning / Mistake) | Negativity bias / loss aversion                       | A warning or "you're doing it wrong" callout; the brain weights flagged risk harder than a positive promise.                                                | "Open with a sharp warning in the first beat — a mistake the viewer is likely making or a risk they're ignoring, as a spoken line and/or alarming text (e.g., 'You're [doing this] wrong — and it's costing you.'). Frame as urgent caution; no product reveal yet."                          | Cautionary, slightly alarming, "listen up."                                                          | ✓      | ✓        |
| `confession`            | Confession                          | Self-disclosure / authenticity + curiosity            | A person admits something candid or counterintuitive; candor signals honesty and opens a loop. **Needs a person.**                                          | "Open on a person talking candidly to camera, confessing something in the first words (e.g., 'I almost didn't share this…' / 'Okay, I was wrong about \_\_\_'). Raw, phone-captured, low-production framing; the admission is the opening line, before any product."                          | Vulnerable, candid, lowered voice, unpolished.                                                       | ✓      | ✗        |

---

## Table 2 — Hook × ad-type fit (populates `AdTypeDef.defaultHooks` / `allowedHooks`)

This table is the **source of truth** for each ad type's hook arrays. `defaultHooks` ⊆
`allowedHooks`. Every type's allowed set respects its asset policy (the five
"neither-capable" types never allow `demonstration`, `testimonial`, or `confession`).

| ad type                 | category            | defaultHooks (2–3)                          | allowedHooks (full set)                                                                                                                                    |
| ----------------------- | ------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-showcase`      | product-led         | `bold-claim`, `curiosity-gap`, `stat-shock` | `bold-claim`, `curiosity-gap`, `stat-shock`, `pattern-interrupt`, `question`, `before-after`, `demonstration`, `unexpected-comparison`, `social-proof`     |
| `product-demo`          | product-led         | `demonstration`, `problem-solution`         | `demonstration`, `problem-solution`, `before-after`, `curiosity-gap`, `question`, `pattern-interrupt`, `stat-shock`, `relatable-scenario`                  |
| `testimonial`           | person-led          | `testimonial`, `problem-solution`           | `testimonial`, `problem-solution`, `confession`, `direct-callout`, `before-after`, `question`, `relatable-scenario`, `social-proof`, `curiosity-gap`       |
| `social-proof`          | neither-capable     | `social-proof`, `stat-shock`                | `social-proof`, `stat-shock`, `curiosity-gap`, `question`, `bold-claim`, `before-after`, `pattern-interrupt`                                               |
| `problem-agitate-solve` | product-led         | `problem-solution`, `negativity-bias`       | `problem-solution`, `negativity-bias`, `pattern-interrupt`, `contrarian`, `question`, `relatable-scenario`, `before-after`, `curiosity-gap`                |
| `before-after`          | product-led         | `before-after`, `problem-solution`          | `before-after`, `problem-solution`, `curiosity-gap`, `stat-shock`, `negativity-bias`, `demonstration`, `pattern-interrupt`                                 |
| `comparison`            | product-led         | `unexpected-comparison`, `contrarian`       | `unexpected-comparison`, `contrarian`, `stat-shock`, `pattern-interrupt`, `question`, `negativity-bias`, `demonstration`, `before-after`, `social-proof`   |
| `unboxing`              | product-led         | `curiosity-gap`, `demonstration`            | `curiosity-gap`, `demonstration`, `pattern-interrupt`, `social-proof`, `bold-claim`, `relatable-scenario`                                                  |
| `explainer`             | neither-capable     | `question`, `curiosity-gap`                 | `question`, `curiosity-gap`, `stat-shock`, `problem-solution`, `contrarian`, `unexpected-comparison`, `bold-claim`, `pattern-interrupt`, `negativity-bias` |
| `founder-pov`           | person-led          | `confession`, `problem-solution`            | `confession`, `problem-solution`, `curiosity-gap`, `contrarian`, `direct-callout`, `relatable-scenario`, `question`, `pattern-interrupt`                   |
| `brand-story`           | flexible            | `curiosity-gap`, `pattern-interrupt`        | `curiosity-gap`, `pattern-interrupt`, `question`, `relatable-scenario`, `bold-claim`                                                                       |
| `lifestyle`             | product-led         | `relatable-scenario`, `pattern-interrupt`   | `relatable-scenario`, `pattern-interrupt`, `curiosity-gap`, `direct-callout`, `bold-claim`                                                                 |
| `promo-offer`           | neither-capable     | `direct-callout`, `stat-shock`              | `direct-callout`, `stat-shock`, `negativity-bias`, `pattern-interrupt`, `bold-claim`, `social-proof`                                                       |
| `announcement`          | neither-capable     | `curiosity-gap`, `pattern-interrupt`        | `curiosity-gap`, `pattern-interrupt`, `stat-shock`, `question`, `bold-claim`, `direct-callout`                                                             |
| `brand-awareness`       | neither (canonical) | `pattern-interrupt`, `contrarian`           | `pattern-interrupt`, `contrarian`, `curiosity-gap`, `question`, `stat-shock`, `bold-claim`, `unexpected-comparison`, `direct-callout`                      |
| `spokesperson`          | person-led          | `direct-callout`, `question`                | `direct-callout`, `question`, `problem-solution`, `stat-shock`, `social-proof`, `bold-claim`, `curiosity-gap`                                              |

---

## Composition rules

1. **Max 2 hooks per ad; default to 1.** The opening is ~2–4s — a third hook muddies it.
2. **Of any 2 hooks, exactly one is the VISUAL-LEAD (owns the first frame/action) and one
   is the OVERLAY/TONE (a spoken line or on-screen text layered on that frame). Two
   visual-leads are never combined.**
   - Visual-lead hooks: `problem-solution`, `demonstration`, `before-after`,
     `testimonial`, `confession`, `relatable-scenario`. `pattern-interrupt` can serve as
     either, and is the best general-purpose secondary (it's _how_ you shoot frame 1).
   - Overlay/tone hooks: `stat-shock`, `curiosity-gap`, `question`, `bold-claim`,
     `direct-callout`, `contrarian`, `social-proof`, `unexpected-comparison`,
     `negativity-bias`.
   - A valid 2-hook open is sequential-within-the-opening (lead frame, then the overlay
     line/text) — never two hooks competing for the same first frame.
3. **Mutually exclusive sets — the detector must collapse each to ONE:**
   - proof mode: `{ testimonial, social-proof }` (one person vs aggregate — pick one)
   - spoken opening: `{ testimonial, confession }` (only one first spoken line)
   - problem framing: `{ problem-solution, negativity-bias }` (empathetic vs accusatory)
   - product visibility: `{ problem-solution, demonstration }` (hide-then-reveal vs show-now)
   - strong claim: `{ bold-claim, contrarian }` (two big-statement openings — redundant)
4. **Precedence when collapsing or when >2 are detected:** prefer a hook in the ad type's
   `defaultHooks`; if both/neither are defaults, prefer higher classifier confidence;
   tie-break **visual-lead over overlay**. Drop any hook not in the chosen type's
   `allowedHooks` rather than overriding the type's base treatment.
5. **Asset guardrail:** if the resolved ad type is running without a person, strip
   `testimonial`/`confession` from its hook selection; if running without a product,
   strip `demonstration`. Fall back to the type's first asset-compatible default.

---

## `HookDef` JSON (paste-ready)

`fitsAdTypes.good` lists each hook's strongest pairings (the types where it's a default);
Table 2 is authoritative for the full allowed set. `clashes` are types to actively avoid.

```json
[
  {
    "id": "problem-solution",
    "displayName": "Problem–Solution (Pain-First)",
    "psychPrinciple": "Loss aversion / problem recognition (Prospect Theory)",
    "description": "Opens on the specific frustrating moment the product later resolves, shown before the product appears. A vividly felt pain primes the viewer to want relief, so the product lands as the obvious fix.",
    "openingDirective": "Open on the exact frustrating moment the product solves — show the problem happening to the subject in close-up first, before the product is anywhere in frame. Hold on the friction for the first beat; do not reveal or name the product yet.",
    "scriptToneNote": "First line names the pain in the viewer's own words ('Why won't this just…'), empathetic not salesy.",
    "fitsAdTypes": {
      "good": [
        "product-demo",
        "problem-agitate-solve",
        "before-after",
        "testimonial",
        "founder-pov",
        "spokesperson"
      ],
      "clashes": ["unboxing", "announcement", "brand-awareness", "brand-story"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "pattern-interrupt",
    "displayName": "Pattern Interrupt",
    "psychPrinciple": "Orienting response / novelty",
    "description": "Opens with an unexpected, slightly jarring visual or action that breaks the feed's rhythm and triggers the orienting response, buying a half-second of attention. Universal secondary hook.",
    "openingDirective": "Open on a visually surprising, rhythm-breaking first frame — an unexpected object, motion, scale, or action that doesn't belong in a normal feed (something dropped, flipped, or revealed abruptly). The first ~0.5s must look 'wrong' enough to stop a thumb, then resolve into the scene.",
    "scriptToneNote": "Optional first line is abrupt or mid-thought, cut into the action.",
    "fitsAdTypes": {
      "good": ["brand-story", "lifestyle", "announcement", "brand-awareness"],
      "clashes": []
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "curiosity-gap",
    "displayName": "Curiosity Gap",
    "psychPrinciple": "Information-gap curiosity (Loewenstein)",
    "description": "Opens by withholding a key piece of information, creating an open loop the viewer must watch to close.",
    "openingDirective": "Open on a teaser that promises a payoff without delivering it — a partially hidden result, a covered object, or a 'wait for it' setup, paired with text like 'The one thing nobody tells you about ___'. Withhold the reveal until later in the ad.",
    "scriptToneNote": "Conspiratorial, 'let me show you something'; never state the answer in the first line.",
    "fitsAdTypes": {
      "good": ["unboxing", "explainer", "brand-story", "announcement"],
      "clashes": ["promo-offer"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "question",
    "displayName": "Direct Question",
    "psychPrinciple": "Self-referential processing / open loop",
    "description": "Opens by posing a pointed question straight to the viewer, triggering automatic self-referential processing — the brain starts answering before deciding to engage.",
    "openingDirective": "Open with one short question on screen and/or spoken straight to camera in the first second (e.g., 'Still [doing the painful thing]?'). Frame the shot as addressing the viewer directly; keep the question under 8 words.",
    "scriptToneNote": "Conversational, second-person ('you'), one question only.",
    "fitsAdTypes": {
      "good": ["explainer", "spokesperson"],
      "clashes": ["brand-story"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "stat-shock",
    "displayName": "Shocking Stat",
    "psychPrinciple": "Anchoring + surprise (credibility heuristic)",
    "description": "Opens with a single surprising number that reframes the stakes and lends instant credibility; a concrete figure feels authoritative and sets a reference point.",
    "openingDirective": "Open on one big number as bold on-screen text, held for the first beat (e.g., '90% of people [surprising fact]'). Make the figure the visual focus of frame 1; keep supporting words minimal.",
    "scriptToneNote": "Read the number flatly and let it land before any pitch.",
    "fitsAdTypes": {
      "good": ["social-proof", "promo-offer", "product-showcase"],
      "clashes": ["brand-story", "lifestyle"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "bold-claim",
    "displayName": "Bold Claim",
    "psychPrinciple": "Bold promise / skeptical curiosity",
    "description": "Opens with a confident, almost-too-good promise that dares the viewer to disprove it, driving engagement through skeptical curiosity.",
    "openingDirective": "Open with a single superlative claim as a spoken line and/or on-screen text in the first beat (e.g., 'The last ___ you'll ever buy'). Deliver it with full confidence and no hedging; pair with a clean hero frame.",
    "scriptToneNote": "Assured, declarative, zero qualifiers.",
    "fitsAdTypes": {
      "good": ["product-showcase"],
      "clashes": ["testimonial", "founder-pov", "confession"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "contrarian",
    "displayName": "Contrarian Take",
    "psychPrinciple": "Belief / expectation violation",
    "description": "Opens by contradicting a widely held belief, creating a belief-violation that forces re-evaluation ('wait, that's wrong?').",
    "openingDirective": "Open by stating a common assumption and immediately negating it in the first beat (e.g., 'Stop [common advice] — here's why it's backwards.'). Shoot as a direct, confident address or bold text card; the contradiction must land in the first sentence.",
    "scriptToneNote": "Confident, mildly provocative, 'everyone's wrong about this.'",
    "fitsAdTypes": {
      "good": ["comparison", "brand-awareness"],
      "clashes": ["promo-offer", "announcement", "unboxing"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "testimonial",
    "displayName": "Testimonial Quote",
    "psychPrinciple": "Social proof (individual credibility)",
    "description": "Opens on a real person delivering a first-person verdict to camera before any pitch; a peer's lived endorsement lowers skepticism faster than brand claims.",
    "openingDirective": "Open on a person talking straight to camera, mid-sentence, delivering their honest verdict as the very first words (e.g., 'I did not think this would work, but…'). Authentic, phone-captured framing; the face and voice carry the opening — no product or graphics first.",
    "scriptToneNote": "First-person, unscripted-sounding, starts mid-thought.",
    "fitsAdTypes": {
      "good": ["testimonial"],
      "clashes": [
        "brand-awareness",
        "announcement",
        "promo-offer",
        "explainer",
        "social-proof"
      ]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": false
  },
  {
    "id": "social-proof",
    "displayName": "Social Proof (Aggregate)",
    "psychPrinciple": "Social proof (consensus / volume)",
    "description": "Opens with stacked third-party proof — star ratings, review snippets, press logos, or user counts — establishing consensus in the first beat ('lots of people can't be wrong').",
    "openingDirective": "Open on aggregated proof rendered as motion graphics — a wall of 5-star ratings, scrolling review snippets, a press-logo strip, or a big user-count — as the first frame. No single presenter; the proof elements are the visual.",
    "scriptToneNote": "Optional VO states the headline number ('Over 50,000 five-star reviews').",
    "fitsAdTypes": {
      "good": ["social-proof"],
      "clashes": ["brand-story", "founder-pov", "confession"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "before-after",
    "displayName": "Before / After Tease",
    "psychPrinciple": "Contrast effect / transformation salience",
    "description": "Opens on a stark contrast between a 'before' state and the 'after' result, compressing the product's payoff into the first beat. This is the opening hook, distinct from the before-after ad type.",
    "openingDirective": "Open with a hard cut or split-screen between the 'before' and the 'after' in the first 1–2 seconds — show the worse state, then snap to the improved result. Make the contrast unmistakable in one beat; the product need not be in frame, only the change.",
    "scriptToneNote": "Minimal words; let the visual contrast talk ('Watch this.').",
    "fitsAdTypes": {
      "good": ["before-after"],
      "clashes": [
        "brand-awareness",
        "announcement",
        "brand-story",
        "confession"
      ]
    },
    "policyNote": "For weight-loss and anti-aging/wrinkle categories, avoid the literal split-screen (Meta prohibits before/after there); use positive, after-forward framing instead.",
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "demonstration",
    "displayName": "Demonstration (Show-It-Working)",
    "psychPrinciple": "Visual proof / seeing-is-believing",
    "description": "Opens mid-action with the product visibly doing the impressive thing, proving the benefit by sight before any words. Implicitly requires the product on screen.",
    "openingDirective": "Open mid-action on the product performing its single most impressive function in extreme close-up (the satisfying result happening in real time). The product and its effect fill the first frame; start at the peak of the action, not the setup.",
    "scriptToneNote": "Few or no words; let the action play ('Just look.').",
    "fitsAdTypes": {
      "good": ["product-demo", "unboxing"],
      "clashes": ["brand-awareness", "explainer", "brand-story", "announcement"]
    },
    "worksWithoutProduct": false,
    "worksWithoutPerson": true
  },
  {
    "id": "relatable-scenario",
    "displayName": "Relatable Scenario",
    "psychPrinciple": "Self-identification / in-group recognition",
    "description": "Opens on a hyper-specific everyday moment the target instantly recognizes as 'that's me,' creating identification before any selling.",
    "openingDirective": "Open on a tightly specific everyday scene the target sees themselves in, framed POV or fly-on-the-wall (the 3pm slump, the messy junk drawer), with a caption like 'POV: ___'. Keep it mundane and recognizable; no product pitch in the first beat.",
    "scriptToneNote": "Casual, knowing, second- or first-person ('us').",
    "fitsAdTypes": {
      "good": ["lifestyle"],
      "clashes": [
        "brand-awareness",
        "announcement",
        "promo-offer",
        "social-proof"
      ]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "direct-callout",
    "displayName": "Direct Callout",
    "psychPrinciple": "Self-relevance / cocktail-party effect",
    "description": "Opens by naming the exact audience so the right viewer self-selects and feels personally addressed.",
    "openingDirective": "Open by calling out the target audience in the first words, spoken to camera and/or as bold text (e.g., 'If you have [trait/problem], stop scrolling.'). Make it specific enough that the right person knows it's for them within one second.",
    "scriptToneNote": "Direct, second-person, slightly urgent.",
    "fitsAdTypes": {
      "good": ["promo-offer", "spokesperson"],
      "clashes": ["brand-story", "confession"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "unexpected-comparison",
    "displayName": "Unexpected Comparison",
    "psychPrinciple": "Analogical framing / novelty",
    "description": "Opens by likening the product or problem to something surprising and unrelated, reframing it via a vivid analogy that makes an abstract benefit concrete.",
    "openingDirective": "Open by comparing the product to something unexpected in the first beat (e.g., 'This does for your ___ what ___ does for ___'), or cut between the product and the surprising stand-in. The comparison must be clear and a little jarring in one sentence.",
    "scriptToneNote": "Playful, 'bet you didn't expect this.'",
    "fitsAdTypes": {
      "good": ["comparison"],
      "clashes": ["testimonial", "confession", "promo-offer"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "negativity-bias",
    "displayName": "Negativity Bias (Warning / Mistake)",
    "psychPrinciple": "Negativity bias / loss aversion",
    "description": "Opens with a warning, threat, or 'you're doing it wrong' callout, exploiting the brain's stronger weighting of negative information.",
    "openingDirective": "Open with a sharp warning in the first beat — a mistake the viewer is likely making or a risk they're ignoring, as a spoken line and/or alarming text (e.g., 'You're [doing this] wrong — and it's costing you.'). Frame as urgent caution; no product reveal yet.",
    "scriptToneNote": "Cautionary, slightly alarming, 'listen up.'",
    "fitsAdTypes": {
      "good": ["problem-agitate-solve"],
      "clashes": ["brand-story", "lifestyle", "announcement", "unboxing"]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": true
  },
  {
    "id": "confession",
    "displayName": "Confession",
    "psychPrinciple": "Self-disclosure / authenticity + curiosity",
    "description": "Opens with a person admitting something candid or counterintuitive ('I wasn't going to post this…'), trading polish for authenticity and opening a curiosity loop. Requires a person.",
    "openingDirective": "Open on a person talking candidly to camera, confessing something in the first words (e.g., 'I almost didn't share this…' / 'Okay, I was wrong about ___'). Raw, phone-captured, low-production framing; the admission is the opening line, before any product.",
    "scriptToneNote": "Vulnerable, candid, lowered voice, unpolished.",
    "fitsAdTypes": {
      "good": ["founder-pov"],
      "clashes": [
        "brand-awareness",
        "promo-offer",
        "announcement",
        "social-proof",
        "explainer"
      ]
    },
    "worksWithoutProduct": true,
    "worksWithoutPerson": false
  }
]
```
