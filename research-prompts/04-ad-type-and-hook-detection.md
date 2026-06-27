# Research prompt — Ad-type + hook detection from the user prompt

> Attach `00-system-briefing.md` first, then paste this. If available, also paste the
> outputs of `02` (ad taxonomy) and `03` (hook library) so the schema references real ids.

You are an applied-LLM / prompt engineer. You've read the system briefing. Today a single
skill, `interpretAdStyle`, reads the user's free-text prompt and returns
`{ adStyle, adType }` where `adType` is only `"ugc" | "inspirational"`. We are extending
this so the **same step** classifies the ad into our full ad-type taxonomy **and** picks
1–2 hooks — because the user never states the ad type or hook; it must be inferred.

## Your task

Design the **detection / decomposition step**: how to reliably classify ad type + hook(s)

- style from a raw prompt, with a concrete LLM prompt design, an output schema, and
  fallback rules. We want to extend the existing single LLM call (not add a second
  round-trip), so the design must fit one `gpt-4.1` JSON call.

## What I need

1. **Output schema.** Extend our current `AdStylePlan { adStyle, adType }` to something
   like `{ adStyle, adType, hooks[], confidence?, assetIntent? }`. Specify each field's
   type and meaning. `adType` is now one of the taxonomy ids; `hooks` is 1–2 hook ids.
   Consider whether we also want the model to emit an `assetIntent` (does the prompt imply
   a product? a person? neither?) to corroborate the asset policy.

2. **The classification rubric.** For each ad type, the **cues** in a user prompt that
   should route to it (keywords, intent signals, what's present/absent). This is the
   discriminative knowledge the LLM needs — give it as a compact per-type cue list the we
   can embed in the system prompt. Same for hooks: what in the prompt suggests each hook.

3. **The detector prompt design.** Draft the actual system+user prompt structure for the
   `gpt-4.1` JSON call. Important: the ad-type menu and hook menu should be **injected
   from our registry at runtime** (we generate the menu from the `AdTypeDef` /`HookDef`
   list), so design the prompt to take the menu as a templated block rather than
   hard-coding type names. Show the template with a placeholder for the menu.

4. **Disambiguation + fallback rules.** What to do when the prompt is vague, mentions
   multiple types, or contradicts the uploaded assets (e.g. asks for a "no-product brand
   film" but a product image was uploaded). Specify: the default ad type, default hook,
   how to clamp an out-of-menu answer, and how confidence should bias toward a safe
   default. (We will hard-validate the LLM output against the registry and fall back if
   it returns an unknown id — describe that clamp.)

5. **Asset reconciliation.** Detection runs in the worker AFTER upload. Recommend how to
   reconcile detected ad type's asset policy with what was actually uploaded: if a type
   requires a product but none was uploaded, do we fail the run, downgrade to a
   product-optional neighbor type, or prompt the user? Recommend a default behavior.

6. **A handful of worked examples.** 6–10 example user prompts → the expected
   `{ adType, hooks, adStyle, assetIntent }` output, including at least two ambiguous
   ones and one no-product case, so we can use them as eval fixtures.

## Output format

The schema as a TypeScript interface + Zod sketch; the rubric and detector prompt as
clearly delimited blocks; the worked examples as a JSON array (prompt → expected output)
we can reuse as test fixtures. Keep prose tight.

## Constraints

- One LLM call, JSON output. No multi-step agent.
- Never trust the LLM to stay in-menu — design assumes a registry clamp after parsing.
- Cues must be concrete enough to embed directly in the system prompt.
