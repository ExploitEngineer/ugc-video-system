# Agents & skills

Agents are **code, not a framework**. A *skill* is a prompt module (`prompt.ts`) plus a function
(`index.ts`) of a uniform shape. The orchestrator ([worker-state-machine.md](./worker-state-machine.md))
calls skills in pipeline order; skills never talk to each other or to the worker.

## The skill contract

```ts
// apps/api/src/agents/types.ts
interface SkillContext {
  runId: string;
  adStyle: string;          // inferred once per run by interpret-style
  adType: "ugc" | "inspirational";
  openai: OpenAIProvider;   // injected — skills never import the adapter
  video: VideoProvider;     // injected — used by the Video Builder
}

interface SkillResult<TArtifact> {
  assetId: string;          // the stored asset row id
  assetUrl: string;         // public URL of the persisted file
  artifact: TArtifact;      // the inserted artifact row (sheet/video)
  promptUsed: string;       // what was sent — for debugging
}

type Skill = (ctx: SkillContext, input: TInput) => Promise<SkillResult<TArtifact>>;
```

Providers are **injected on `ctx`** (dependency injection), so skills are unit-testable with fakes
and the underlying model is swappable.

## Provider interfaces (what each adapter exposes)

`OpenAIProvider` (`providers/openai`):

```ts
chat(messages: ChatMessage[]): Promise<string>        // LLM reasoning; vision when a msg has images[]
generateImage(input: {                                 // GPT Image 2
  prompt: string; refs?: ImageRef[]; size?: string;
}): Promise<{ bytes: Uint8Array; mime: string }>       // refs present → image edit; else text-to-image
// ImageRef = { source: url | dataURI, mime? }
```

`VideoProvider` (`providers/video.ts`, implemented by `providers/byteplus`):

```ts
submitVideo(input: {
  prompt: string; durationSec?: number;
  referenceImages?: string[];   // non-face guidance (sent as plain image_url)
  personReferences?: string[];  // faces — registered as BytePlus assets first (asset://<id>)
  referenceTag?: string;        // stable prefix for idempotent asset reuse (the runId)
}): Promise<{ taskId: string; pollUrl?: string }>
pollVideo(task): Promise<{ state: "processing"|"completed"|"failed"; videoUrl?; hasAudio?; downloadHeaders?; error? }>
```

Seedance runs async: submit a task, then poll until `completed`/`failed` or timeout
(`BYTEPLUS_POLL_TIMEOUT_MS`, default 10 min; interval `BYTEPLUS_POLL_INTERVAL_MS`, 5s).

## The skills

| Skill (file) | Step | Input it consumes | Provider call | Produces |
| --- | --- | --- | --- | --- |
| **interpret-style** `creative-direction/interpret-style` | (pre-run) | user prompt | `chat` (LLM) → `{ adStyle, adType }` | sets `runs.adStyle`/`adType` (no asset) |
| **interpret-feedback** `creative-direction/interpret-feedback` | (gate reply) | gate stage + user message | `chat` (LLM) → `{ intent: approve\|revise, target }` | routing decision (no asset) |
| **product-sheet** `image/product-sheet` | `product_sheet` | product upload, prompt, `adStyle` | `chat` → plan (`imagePrompt`+views); `generateImage` (edit from upload) | `assets(product_sheet)` + `product_reference_sheets` |
| **person-image** `image/person-image` | `person_sheet` | product sheet ref, prompt | `chat` → plan; `generateImage` (refs: product sheet) | `assets(person_sheet)` + `person_reference_sheets` |
| **storyboard** `image/storyboard` | `storyboard` | product (+person) sheet refs, prompt, `adType` | `chat` → `{ imagePrompt, scenes[4] }`; `generateImage` (refs) | `assets(storyboard_sheet)` + `storyboard_sheets` (scenes) |
| **product-inspection** `critic/product-inspection` | `product_inspection` | product sheet + original upload | `chat` (vision) → `InspectionVerdict` | approve/reject; ≤1 regen (localized or full) |
| **storyboard-inspection** `critic/storyboard-inspection` | `storyboard_inspection` | storyboard sheet + scenes | `chat` (vision) → `InspectionVerdict` | approve/reject; ≤1 regen (full only) |
| **video-builder** `video` | `video` | clean storyboard sheet, scenes, `hasPerson` | `chat` → motion/audio prompt; `submitVideo`+`pollVideo` | `assets(final_video)` + `videos` |

Notes:
- **Critic regen budget** is run-level (`MAX_REGEN_PER_RUN`, `critic/constants.ts`), shared across
  both inspection steps. The generic inspect→regen loop lives in `critic/remediate.ts`; outcomes
  are `approved` / `regenerated_approved` / `failed_retry_cap` (the last fails the run).
- **Video Builder** sends only the **clean** storyboard sheet as guidance (no product/person
  sheets) — identity reaches Seedance via the keyframes + scene/transcript text. When `hasPerson`,
  the sheet is routed through the face-asset path. The LLM prompt has a deterministic fallback so
  the video step never fails on a prompt/parse hiccup.

## LLM JSON parsing & validation

Skills ask the model for strict JSON; `agents/json.ts` `parseJsonObject<T>(raw, schema?)` strips
``` ```json ``` fences, extracts the outermost object, sanitizes stray control bytes, and — when a
Zod `schema` is passed — validates/normalizes the result (else throws a clear, debuggable error).

- **interpret-style / interpret-feedback / video-prompt** already guard with enum whitelists +
  try/catch fallbacks (safe defaults), so they don't pass a schema.
- **critic inspections** pass the tolerant `inspectionVerdictSchema` (`critic/types.ts`): a
  missing/odd `pass` normalizes to `false` (= regenerate, the safe direction); a structurally
  broken reply throws rather than feeding the engine garbage.

## How skills are dispatched

The orchestrator (`creative-direction/orchestrator.ts`) reads the `runs` row, loads the needed
inputs from the DB (`creative-direction/inputs.ts`), writes a `started` step_event, calls the
skill, then writes `passed`/`failed`/`regenerated`. The pipeline order (and which steps are
skipped) is pure logic in `creative-direction/plan.ts`. See
[worker-state-machine.md](./worker-state-machine.md).

## Running a skill standalone

Diagnostic runners live in `apps/api/scripts/` and hit **live, paid** APIs — run explicitly,
never in CI. Each takes a real `<runId>` (created via `POST /runs` so a product upload exists):

```bash
pnpm --filter api agents:verify <runId> ["ad style"]   # Image Agent: product → person → storyboard
pnpm --filter api critic:verify <runId> ["ad style"]   # Critic: inspect latest sheets (needs agents:verify first)
pnpm --filter api video:verify  <runId> ["ad style"]   # Video Builder: storyboard sheet → final video
pnpm --filter api cda:verify    <runId>                # Orchestrator: drive one run to its next stop
pnpm --filter api byteplus:probe <runId>               # Register a run's person sheet as a BytePlus face asset
```
