# Research prompt — Hook library

> Attach `00-system-briefing.md` first, then paste this. If you've already run the
> ad-taxonomy prompt (`02`), paste its output too so hooks can reference real ad-type ids.

You are a senior direct-response copywriter + ad creative strategist. You've read the
system briefing for our AI ad-video generator. We are adding a **hook** layer: every ad
opens with a hook (the first ~2–4 seconds that stops the scroll), and the system will
pick the hook(s) per ad automatically.

**Key architectural constraint we want you to respect:** hooks must be **orthogonal** to
ad types — i.e. a hook is a small, additive instruction injected into the OPENING beat of
an ad, layered on top of whatever ad type was chosen. We do NOT want a full ad-type ×
hook matrix (that explodes combinatorially). One ad type + any allowed hook = the type's
base treatment + a single hook-opening fragment. Design the catalog so that holds.

## Your task

Produce a **hook library** we can turn into a code registry (`HookDef`), where each hook
is a reusable, ad-type-agnostic opening strategy plus the prompt fragments it implies.

## What I need

1. **The hook list.** ~10–18 hooks. For each a stable `id` (kebab-case, e.g.
   `problem-solution`, `pattern-interrupt`, `testimonial`, `stat-shock`,
   `curiosity-gap`, `question`, `before-after`, `negativity-bias`, `direct-callout`,
   `unexpected-comparison`, `bold-claim`, `relatable-scenario`, `demonstration`).

2. **For each hook, these fields** (maps 1:1 to our future `HookDef`):
   - `id`, `displayName`
   - `description` — what the hook is + **why it works** (the psychological lever:
     curiosity gap, pattern interrupt, social proof, loss aversion, etc.). This text
     feeds the classifier LLM, so make it discriminative.
   - **`openingDirective`** — the concrete instruction we inject into the FIRST
     scene/shot of the storyboard and the first time-slice of the video prompt. Write it
     as 1–3 imperative sentences a prompt builder can drop in verbatim (e.g. "Open on the
     exact frustrating moment the product solves — show the problem first, before the
     product appears."). This is the most important field.
   - `scriptToneNote` — optional one-line nudge to the spoken/voiceover line's tone for
     this hook.
   - **`fitsAdTypes`** — which ad-type ids (from prompt `02`, or by category if you
     haven't seen them) this hook works well with, and any it actively clashes with.
   - `worksWithoutProduct` / `worksWithoutPerson` — booleans: can this hook open an ad
     that has no product shot / no on-screen person? (Important: some hooks like
     `demonstration` implicitly need a product.)

3. **Hook × ad-type fit guidance** — a compact table mapping ad types → their best 2–3
   default hooks and their full allowed-hook set. This is what populates each
   `AdTypeDef.defaultHooks` / `allowedHooks`. Keep it as data.

4. **Composition rules** — state plainly: how should 1 vs 2 hooks combine if the
   detector picks two? Which hooks are mutually exclusive? Recommend a max number of
   hooks per ad and the precedence rule.

## Output format

A markdown table for the hook library, a markdown table for the hook×ad-type fit, then a
compact JSON array (the `HookDef` fields above) we can paste into code. Minimal prose.

## Constraints

- Every `openingDirective` must be writable into a video/image prompt verbatim — concrete
  and visual, not abstract marketing talk.
- Keep hooks ad-type-agnostic where possible; only mark genuine clashes.
- Name the psychological principle behind each hook.
