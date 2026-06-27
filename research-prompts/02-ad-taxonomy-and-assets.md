# Research prompt — Ad-type taxonomy + asset requirements

> Attach `00-system-briefing.md` first, then paste this.

You are a senior performance-creative strategist + a systems architect. You have just
read the system briefing for our AI ad-video generator. Today it only produces two ad
treatments (`ugc` and `inspirational`) and always requires a product image. We are
expanding it to generate **any type of ad**, and some ad types must work with **no
product image and/or no person at all**.

## Your task

Define the **practical universe of ad types** we should support, as a structured
catalog we can turn directly into a code registry. This is the foundation the rest of
the project builds on, so be comprehensive but pragmatic — real ad formats that a small
business or DTC brand would actually request, not academic categories.

## What I need

1. **The ad-type list.** Propose ~12–20 ad types. For each, give a short, stable
   `id` (kebab-case, e.g. `product-showcase`, `testimonial`, `brand-story`,
   `explainer`, `promo-offer`, `founder-pov`, `comparison`, `unboxing`,
   `problem-agitate-solve`, `lifestyle`, `announcement`, `social-proof`). Map our two
   existing types (`ugc`, `inspirational`) into this taxonomy so we don't lose them —
   say which new id(s) they correspond to or whether they survive as-is.

2. **For each ad type, a row with these fields** (this maps 1:1 to our future
   `AdTypeDef`):
   - `id`, `displayName`
   - `description` — one or two sentences. (This text will be fed to the classifier LLM,
     so make it discriminative — what makes THIS type, not a neighbor.)
   - `whenToUse` — the buyer intent / funnel stage it fits (awareness, consideration,
     conversion, retargeting).
   - **`assetPolicy`** — the critical part:
     - `product`: `required` | `optional` | `forbidden`
     - `person`: `required` | `optional` | `forbidden`
     - one line of rationale (e.g. "a brand-awareness motion-graphics ad needs neither
       a product photo nor an actor").
   - `look` — the visual treatment family (e.g. `ugc_authentic` phone-captured /
     `cinematic` polished / `graphic_text` motion-graphics-led). Reuse a small fixed set
     of look families across types so our renderer can share base styling.
   - `defaultHooks` and `allowedHooks` — leave these as placeholders referencing hook
     ids; the hook catalog is a separate research prompt (`03`). Just note which hook
     *categories* each type tends to favor.
   - `differsFromUgcInspirational` — one line on how it differs from our current two
     treatments (so we understand the delta).

3. **Asset-policy summary table** — a compact matrix of `ad type × {product, person}`
   so we can see at a glance which types are product-led, person-led, both, or neither.
   Explicitly call out the types that need **neither** (these drive the biggest pipeline
   change — skipping the product/person reference steps).

4. **Edge cases / decisions** — flag any ad types where the asset policy is genuinely
   ambiguous (e.g. a testimonial with no product shown), and recommend a default.

## Output format

A markdown table for the catalog (one row per ad type) plus the asset-policy matrix.
Then a compact JSON array of the same data (the fields above) we can paste into code.
No long prose — make it data we can consume.

## Constraints

- Ground every type in real advertising practice; if you reference a known framework
  (AIDA, PAS, problem-solution, etc.) name it.
- Keep `look` families to a small fixed set (3–5) shared across types.
- Don't invent fields beyond what I listed unless you flag them as optional additions.
