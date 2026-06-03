# Architecture

UGC Video System turns a **product image (+ optional person image) + a text prompt** into a
single ~15s ad video with native audio. Cooperating AI agents drive an
**images → storyboard → video** pipeline.

> Companion docs: [agents-and-skills.md](./agents-and-skills.md) ·
> [worker-state-machine.md](./worker-state-machine.md) ·
> [api-reference.md](./api-reference.md). Deep dives live in
> [apps/api/docs](../apps/api/docs/) (DB schema, RLS, BytePlus face assets).
> `SPEC.md` (repo root) is the authoritative design + progress tracker.

## Monorepo layout

```
apps/web        Next.js 16 + React 19 + Tailwind 4 (App Router, Turbopack, Biome, React Compiler)
apps/api        Hono + @hono/node-server. tsx in dev AND prod (no bundle step). Holds agents,
                providers, DB, storage, routes, and the in-process worker.
packages/shared @ugc/shared — raw TypeScript (no build). Single source of truth for enums + Zod
                DTOs, imported by both apps via workspace:* directly from src/.
```

Everything is ESM (`"type": "module"`). The API imports use `.js` extensions even from `.ts`
sources (ESM + `moduleResolution: bundler`). Dev/diagnostic scripts live in `apps/api/scripts/`,
kept out of the runtime `src/` tree.

## The pipeline

One run advances through these steps (the orchestrator decides the order; see
[worker-state-machine.md](./worker-state-machine.md)):

```
interpret style + person brief (once)      Creative Direction — adStyle + adType, and a
   │                                       product-derived person brief (vision over the upload)
   ▼
product_sheet  ∥  person_sheet             Image Agent — generated IN PARALLEL. person_sheet is
   │            (person only if NO person  driven by the person-brief TEXT, not the product sheet
   │             image was uploaded)        image, so it has no dependency on product_sheet.
   ▼
product_inspection            (only if criticEnabled)   Critic — vision check + ≤1 regen
   │
   ▼
storyboard                                 Image Agent — 4-panel keyframe sheet + 4-scene script
   │
storyboard_inspection         (only if criticEnabled)   Critic — vision check + ≤1 regen
   │
   ▼
video                                      Video Agent — Seedance 2.0, single final video + audio
```

Hard non-goals (per SPEC): no per-scene video, no separate audio step, no merge step —
Seedance 2.0 produces one final video with native audio.

## Components

- **Agents as code, not a framework** (`apps/api/src/agents/*`). Each "skill" is a prompt module
  (`prompt.ts`) + a function (`index.ts`) of shape `(ctx: SkillContext, input) => SkillResult<T>`.
  - **Creative Direction** (`agents/creative-direction`): the orchestrator (run state machine),
    the in-process worker (claim/drive/lock), and three small LLM skills — `interpret-style`
    (prompt → `adStyle`/`adType`), `person-brief` (vision over the uploaded product → a TEXT
    person brief that drives the parallel person sheet), and `interpret-feedback` (gate reply
    → approve/revise).
  - **Image** (`agents/image`): `product-sheet`, `person-image`, `storyboard` — OpenAI GPT Image.
  - **Critic** (`agents/critic`): `product-inspection`, `storyboard-inspection` — OpenAI vision +
    a generic inspect→regen `remediate` engine (run-level regen budget).
  - **Video** (`agents/video`): `videoBuilder` — composes a motion/audio prompt then calls the
    video provider (BytePlus Seedance 2.0).
- **Provider adapter boundary** (`apps/api/src/providers/{openai,byteplus}`). All model calls go
  through these adapters so providers are swappable without touching agent logic. Adapters are
  injected into skills via `ctx` (`SkillContext`), never imported directly inside a skill.
- **Worker + polling.** A route enqueues a run (`status=queued`); the in-process worker loop in
  `apps/api` claims it and advances it step by step. The `runs` DB row is the authoritative state
  machine, so a refresh/restart never loses progress. The frontend polls `GET /runs/:id`.
- **Web** (`apps/web`): Next.js App Router. Server Actions (`app/studio/actions.ts`) call the Hono
  API directly (no browser CORS); Route Handlers under `app/api/*` proxy the browser's polling
  reads. TanStack Query drives the 1.5s poll loop.

## Data model (summary)

Drizzle over Supabase Postgres. Full reference: [apps/api/docs/database-schema.md](../apps/api/docs/database-schema.md).

| Table | Role |
| --- | --- |
| `projects` | Owns runs (auto-created per run from the prompt). |
| `runs` | The state-machine row: `status`, `currentStep`, `adStyle`, `adType`, `mode`, `criticEnabled`, `error`, `feedback`, `lockedAt`/`lockedBy`. |
| `assets` | Every stored file (uploads + generated). Holds `storagePath` (internal) + public `url`. |
| `step_events` | Append-only audit trail (`started`/`passed`/`failed`/`regenerated`) — the frontend timeline. |
| `product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`, `videos` | Per-artifact rows with `status` (`draft`/`approved`/`rejected`). |

Shared enums + DTOs (the wire contract) live in `packages/shared/src`; see
[api-reference.md](./api-reference.md). DB→DTO mapping happens **only** in `apps/api/src/lib/mappers.ts`
(drops internal columns like `storagePath`).

## External services

- **OpenAI** — GPT Image (reference/storyboard sheets) + chat/vision (style interpretation,
  planning, critic inspection, video-prompt synthesis). Adapter: `providers/openai`.
- **BytePlus ModelArk / Seedance 2.0** — final video with native audio. Adapter:
  `providers/byteplus`. Faces are registered as BytePlus assets first (AK/SK-signed OpenAPI) so
  Seedance's face filter accepts them — see [apps/api/docs/byteplus-face-assets.md](../apps/api/docs/byteplus-face-assets.md).
- **Supabase** — Postgres (Drizzle) + Storage (`ugc-assets` bucket; rows hold path + URL).

Config is Zod-validated at boot in `apps/api/src/config/index.ts` (server secrets) and via
`NEXT_PUBLIC_*` only on web. Keys: `OPENAI_API_KEY`, `BYTEPLUS_API_KEY` (+ optional `BYTEPLUS_*`),
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CORS_ORIGIN`,
`WORKER_ENABLED`, `WORKER_POLL_INTERVAL_MS`, `LOG_LEVEL`.

## Known pre-production gaps

These are deliberate scope cuts, not bugs — track before a real launch:

- **No auth (F8).** RLS is enabled on all tables but **no policies exist**, and the API has no
  authentication. Anyone who can reach the API can create/cancel/delete runs. The service-role key
  bypasses RLS for storage/DB. Do not expose the API publicly without adding auth.
- **No rate limiting / cost controls.** Each run makes multiple paid OpenAI + BytePlus calls; a
  buggy or hostile client can run up spend. No per-user/run quota or token/cost accounting yet.
- **CORS** is env-driven (`CORS_ORIGIN`). Set it to the exact frontend origin in prod — never `*`.
- **Single video provider.** Seedance 2.0 only (behind the `VideoProvider` interface, so swappable).
- **One worker per database.** The worker claims runs with a DB lock; running two API instances
  against the **same** `DATABASE_URL` makes both drive runs. Keep dev on its own DB
  (see [local-dev](#local-development)).

## Local development

Local dev must use its **own** database so the prod worker never processes local runs. Either the
bundled `docker-compose.yml` (Postgres on `localhost:5432`) or a native Postgres cluster — both
expose the same URL `postgresql://postgres:postgres@localhost:5432/ugc`. Then
`pnpm --filter api db:migrate` and `pnpm dev`. See the root `README.md` for step-by-step setup.
