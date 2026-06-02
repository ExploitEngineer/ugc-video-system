# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AI ad-video generator: product image (+ optional person image) + text prompt → single ~15s ad video with audio. Cooperating AI agents drive **images → storyboard → video** pipeline.

**`SPEC.md` = authoritative design + progress tracker.** Defines full architecture, data model, agent/skill design, F0–F8 build order. Read before any non-trivial work. Keep its `- [ ]` checklists and **Progress Log** updated as items land — that section source of truth for what done.

**Subsystem docs:** `docs/` holds [architecture](docs/architecture.md), [agents-and-skills](docs/agents-and-skills.md), [api-reference](docs/api-reference.md), [worker-state-machine](docs/worker-state-machine.md); `apps/api/docs/` has DB schema, RLS, and BytePlus face-asset deep dives.

**Current state:** F0–F7 are built and wired end to end — the agents (creative-direction / image / critic / video), provider adapters (OpenAI, BytePlus), the Drizzle/Supabase schema + migrations, the in-process worker, the `/runs` API, and the studio UI all exist. **F8 (auth / RLS policies) is NOT started** — RLS is enabled with no policies and the API is unauthenticated (see docs/architecture.md → Known pre-production gaps). Still verify specifics against the code; SPEC.md tracks per-feature status.

## Commands

Run from repo root (pnpm workspaces, Node >=20, pnpm >=11):

```bash
pnpm install              # install all workspace deps
pnpm dev                  # web + api in parallel (web :3000, api :3001)
pnpm dev:web              # web only
pnpm dev:api              # api only
pnpm build                # build all (-r)
pnpm typecheck            # tsc --noEmit across all packages
pnpm lint                 # biome check (web only — see below)
pnpm format               # biome format --write (web only)
pnpm clean                # remove dist/.next/.turbo/caches
```

Per-package: `pnpm --filter <web|api> <script>`. Override api port with `PORT`.

After dependency installs, pnpm requires explicit build-script approval for `@biomejs/biome`, `esbuild`, `sharp` (declared in `pnpm-workspace.yaml` `onlyBuiltDependencies`).

## Layout & cross-package wiring

```
apps/web      Next.js 16 + React 19 + Tailwind 4 (Turbopack, Biome, React Compiler)
apps/api      Hono + @hono/node-server — runs via tsx in dev (watch) AND prod (no bundle/dist step)
packages/shared   @ugc/shared — types/schemas shared by web + api
```

- **`@ugc/shared` ships raw TypeScript, no build step** — `main`/`types` point at `src/index.ts`, consumed via `workspace:*`. Add shared types/Zod schemas here; both apps import direct from source. Per SPEC, this where shared enums (run status, step, asset kind, mode) and Zod mirrors live.
- Everything ESM (`"type": "module"`).
- `lint`/`format` are Biome but **only `web` package defines those scripts**; `api` and `shared` only `typecheck`. `web/biome.json` uses `extends: "//"` (root config) — no root `biome.json` yet, so add one if need shared lint rules across packages.

## Architecture the build targets (from SPEC.md)

Once built, system is:

- **Agents as code, not framework.** Creative Direction Agent (orchestrator) interprets requested ad style, propagates downstream, drives run state machine. Image Agent (OpenAI GPT Image 2) produces reference/storyboard sheets; Critic Agent (OpenAI vision) validates + triggers regeneration; Video Agent (BytePlus ModelArk — Seedance 2.0) turns full storyboard sheet into final video. Each "skill" = prompt module + function.
- **Provider adapter boundary:** all OpenAI/BytePlus calls live behind `apps/api/src/providers/{openai,byteplus}` so models swappable without touching agent logic.
- **Execution = background worker + polling.** Hono route enqueues a `run`; in-process worker loop in `apps/api` advances it step-by-step. `runs` DB row = authoritative state machine, so refresh never loses progress. Frontend polls status endpoint.
- **Two run modes:** `automatic` (no gating) and `confirm` (pauses at `awaiting_confirmation` after each step). Critic auto-checks run in **both** modes.
- **Persistence:** Drizzle over Supabase Postgres; files in Supabase Storage (DB rows hold path + URL); Zod validates every API route using shared schemas.
- **Hard non-goals:** no per-scene video generation, no separate audio step, no merge step, one output video per run. Seedance 2.0 produces single final video with native audio.

Config/secrets Zod-validated in `apps/api/src/config` (server) and `NEXT_PUBLIC_*`-only on web. Keys: `OPENAI_API_KEY`, `BYTEPLUS_API_KEY` (+ optional `BYTEPLUS_*` tuning), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, plus `CORS_ORIGIN`, `WORKER_ENABLED`, `WORKER_POLL_INTERVAL_MS`, `LOG_LEVEL`.

**Local dev DB:** point `apps/api/.env` `DATABASE_URL` at a LOCAL Postgres (`docker-compose.yml`, or a native cluster — both at `postgresql://postgres:postgres@localhost:5432/ugc`), never the prod Supabase. The worker claims runs by DB lock, so sharing one DB makes local + prod both drive the same runs. Then `pnpm --filter api db:migrate`. See README → Getting started.

## Relevant skills

`.claude/skills/` includes project-matched skills — `supabase`, `supabase-postgres-best-practices`, `next-best-practices`, `frontend-design`, `tailwind-design-system`, `framer-motion-animator`, `seedance-v2`, `ai-image-generation`. Use for corresponding subsystems.