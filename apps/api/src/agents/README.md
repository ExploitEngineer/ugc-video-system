# Agents

Agents as code, not a framework. Each **skill** = a prompt module (`prompt.ts`)
+ a function (`index.ts`) of shape `(ctx: SkillContext, input) => Promise<SkillResult<T>>`.
The OpenAI/Ark provider adapters are injected via `SkillContext` (see `types.ts`),
never imported inside a skill — so skills stay swappable and testable.

Layout:

```
agents/
  types.ts                 SkillContext, SkillResult (shared plumbing)
  json.ts                  parseJsonObject — pull strict JSON from an LLM reply
  image/                   Image Generation Agent (GPT Image 2) — F4 ✅
    index.ts               agent barrel (the 3 skills)
    persist.ts             upload → assets row → artifact row (shared persist step)
    product-sheet/         { prompt.ts, index.ts }  Product Sheet Builder
    person-image/          { prompt.ts, index.ts }  Generate Person Image
    storyboard/            { prompt.ts, index.ts }  StoryBoard Generator
  critic/                  Critic Agent (vision QA) — F5 (reserved home)
  video/                   Video Generation Agent (Seedance 2.0) — F6 (reserved home)
  creative-direction/      Creative Direction Agent (orchestrator) — F7 (reserved home)
```

Reserved homes (`critic/`, `video/`, `creative-direction/`) are not implemented
yet — they land in their own features, following the same per-skill convention.
A worker loop wires the skills into the run state machine in **F7**; until then
skills are invoked directly (see `image/verify.ts`).
