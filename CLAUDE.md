# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AI ad-video generator: a product image (+ optional person image) + a text prompt → a single ~15s ad video with audio. Cooperating AI agents drive an **images → storyboard → video** pipeline.

**`SPEC.md` is the authoritative design + progress tracker.** It defines the full architecture, data model, agent/skill design, and the F0–F8 build order. Read it before any non-trivial work, and keep its `- [ ]` checklists and the **Progress Log** updated as items land — that section is the source of truth for what's done.

**Current state:** scaffold only. The monorepo, tooling, and stub `web`/`api`/`shared` exist. None of the SPEC architecture (agents, DB, providers, worker, real UI) is built yet — F0 onward is greenfield. Do not assume code described in SPEC.md exists; verify first.

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
apps/api      Hono + @hono/node-server (tsx watch in dev, tsc → dist/ for prod)
packages/shared   @ugc/shared — types/schemas shared by web + api
```

- **`@ugc/shared` ships raw TypeScript, no build step** — its `main`/`types` point at `src/index.ts` and it's consumed via `workspace:*`. Add shared types/Zod schemas here; both apps import directly from source. Per SPEC, this is where shared enums (run status, step, asset kind, mode) and Zod mirrors live.
- Everything is ESM (`"type": "module"`).
- `lint`/`format` are Biome but **only the `web` package defines those scripts**; `api` and `shared` only `typecheck`. `web/biome.json` uses `extends: "//"` (root config) — there is no root `biome.json` yet, so add one if you need shared lint rules across packages.

## Architecture the build targets (from SPEC.md)

Once built, the system is:

- **Agents as code, not a framework.** A Creative Direction Agent (orchestrator) interprets the requested ad style, propagates it downstream, and drives a run state machine. Image Agent (OpenAI GPT Image 2) produces reference/storyboard sheets; Critic Agent (OpenAI vision) validates and triggers regeneration; Video Agent (Volcengine/BytePlus Ark Seedance 2.0) turns the full storyboard sheet into the final video. Each "skill" = a prompt module + a function.
- **Provider adapter boundary:** all OpenAI/Ark calls live behind `apps/api/src/providers/{openai,ark}` so models are swappable without touching agent logic.
- **Execution = background worker + polling.** A Hono route enqueues a `run`; an in-process worker loop in `apps/api` advances it step-by-step. The `runs` DB row is the authoritative state machine, so a refresh never loses progress. Frontend polls a status endpoint.
- **Two run modes:** `automatic` (no gating) and `confirm` (pauses at `awaiting_confirmation` after each step). Critic auto-checks run in **both** modes.
- **Persistence:** Drizzle over Supabase Postgres; files in Supabase Storage (DB rows hold path + URL); Zod validates every API route using the shared schemas.
- **Hard non-goals:** no per-scene video generation, no separate audio step, no merge step, one output video per run. Seedance produces the single final video with native audio.

Config/secrets are Zod-validated in `apps/api/src/config` (server) and `NEXT_PUBLIC_*`-only on web. Keys: `OPENAI_API_KEY`, `ARK_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.

## Relevant skills

`.claude/skills/` includes project-matched skills — `supabase`, `supabase-postgres-best-practices`, `next-best-practices`, `frontend-design`, `tailwind-design-system`, `framer-motion-animator`, `seedance-v2`, `ai-image-generation`. Use them for the corresponding subsystems.
