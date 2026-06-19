# research-prompts/

Prompts to run on **Claude web (claude.ai)** to research the "generate any type of ad"
expansion. You run these yourself; paste the output into your own `research/` directory
(create it next to this folder — it is git-ignored on your side, your call).

## How to use

1. **Always start a thread by attaching `00-system-briefing.md`.** It is the
   self-contained explanation of our current pipeline so Claude answers with full
   context instead of guessing. Attach it as a file, or paste it as the first message.
2. Then paste **one** topic prompt (`02`–`07`) as the next message. One topic per
   thread keeps the output deep and focused.
3. Save the result into your `research/` directory, named to match (e.g.
   `research/02-ad-taxonomy.md`).

If you'd rather do it all at once, use **`01-combined-research.md`** — it covers
topics 02–05 in a single thread (note: depth per topic drops vs. running them
separately; the two provider guides `06`/`07` are still best as their own threads).

## Files

| File                                  | What it researches                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `00-system-briefing.md`               | **Context input.** Our current pipeline, agents, providers, state machine, and current prompting approach. Attach FIRST in every thread. |
| `01-combined-research.md`             | Everything (02–05) in one thread.                                                                                                        |
| `02-ad-taxonomy-and-assets.md`        | The full universe of ad types + which need product / character / neither.                                                                |
| `03-hook-library.md`                  | The hook taxonomy + how each hook maps to a prompt fragment + which hooks fit which ad types.                                            |
| `04-ad-type-and-hook-detection.md`    | How to auto-detect ad type + hook(s) from the user's raw prompt.                                                                         |
| `05-prompt-restructure-and-skills.md` | How to restructure our prompts into a registry + a per-ad-type skill format.                                                             |
| `06-seedance-2.0-prompting-guide.md`  | Best-practice Seedance 2.0 (video) prompting, per ad type + hook.                                                                        |
| `07-gpt-image-2-prompting-guide.md`   | Best-practice GPT-Image-2 (sheets/storyboards) prompting, per ad type.                                                                   |

## What "good output" looks like

Every research prompt asks for **structured, registry-mappable output** (tables / JSON /
fragment lists), not essays. We will drop the results into a code registry
(`apps/api/src/agents/ad-types/`) and per-type skill docs (`.claude/skills/ad-type-*/`),
so the more it reads like data, the less translation we do later.
