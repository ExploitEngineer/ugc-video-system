# UGC Video System

Turn a **product image (+ optional person image) + a text prompt** into an ad video with native
audio — a single ~15s clip or a merged 30/45/60s clip, chosen per run. Cooperating AI agents drive an
**images → storyboard → video** pipeline, and a completed video can be edited in a browser editor
(img.ly CE.SDK). Monorepo, managed with [pnpm workspaces](https://pnpm.io/workspaces).

## Structure

```
.
├── apps/
│   ├── api/        # Hono + Node — agents, providers, DB, storage, routes, in-process worker
│   └── web/        # Next.js 16 + React 19 + Tailwind 4 (App Router)
├── packages/
│   └── shared/     # @ugc/shared — enums + Zod DTOs shared by web + api (raw TS, no build)
└── docs/           # architecture, agents-and-skills, api-reference, worker-state-machine
```

## Documentation

- [docs/architecture.md](docs/architecture.md) — system overview, pipeline, components, **known pre-prod gaps**
- [docs/agents-and-skills.md](docs/agents-and-skills.md) — the skill contract + every agent skill
- [docs/api-reference.md](docs/api-reference.md) — endpoints, request/response, shared DTOs
- [docs/worker-state-machine.md](docs/worker-state-machine.md) — run statuses, worker, gating, resumability
- [apps/api/docs/video-editor.md](apps/api/docs/video-editor.md) — post-completion video editor (flow, storage, data sources)
- `apps/api/docs/` — pipeline, DB schema, RLS, BytePlus face-asset deep dives · `SPEC.md` — authoritative design + progress

## Requirements

- Node `>=20`, pnpm `>=11` (`corepack enable` recommended)
- A Postgres database and a Supabase project (Storage). **For local dev, use a LOCAL database** —
  see below (sharing the prod DB makes the prod worker process your local runs).
- API keys: OpenAI, BytePlus (Seedance 2.0).

## Getting started

```bash
pnpm install
```

**1. Environment.** Copy the templates and fill them in:

```bash
cp apps/api/.env.example apps/api/.env       # OPENAI_API_KEY, BYTEPLUS_*, SUPABASE_*, DATABASE_URL
cp apps/web/.env.example apps/web/.env.local # NEXT_PUBLIC_API_URL + NEXT_PUBLIC_CESDK_LICENSE (img.ly editor; empty = watermark)
```

**2. Local database.** Bring up a local Postgres and point `apps/api/.env` `DATABASE_URL` at it:

```bash
# Option A — Docker:
docker compose up -d            # Postgres on localhost:5432 (db "ugc")
# Option B — native cluster (no Docker): initdb a data dir and start it on :5432.

# In apps/api/.env:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ugc
```

Keep `SUPABASE_*` pointed at your Supabase project (Storage is still used for files).

**3. Migrate, then run:**

```bash
pnpm --filter api db:migrate    # apply schema to the local DB
pnpm --filter api db:seed       # optional sample data
pnpm dev                        # web :3000 + api :3001
```

## Scripts (run from repo root)

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `pnpm dev`       | Run web + api in parallel       |
| `pnpm dev:web`   | Run only the web app            |
| `pnpm dev:api`   | Run only the api                |
| `pnpm build`     | Build all packages              |
| `pnpm lint`      | Lint (web — Biome)              |
| `pnpm format`    | Format (web — Biome)            |
| `pnpm typecheck` | Type-check all packages         |
| `pnpm clean`     | Remove build artifacts & caches |

API-only helpers: `pnpm --filter api db:migrate | db:seed | db:reset | db:studio | storage:setup`.
Live agent runners (paid APIs): `agents:verify | critic:verify | video:verify | cda:verify`
(see [docs/agents-and-skills.md](docs/agents-and-skills.md)).

Web runs on `http://localhost:3000`, api on `http://localhost:3001` (override with `PORT`).
