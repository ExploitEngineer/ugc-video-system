# UGC Video System

Monorepo for the UGC video system, managed with [pnpm workspaces](https://pnpm.io/workspaces).

## Structure

```
.
├── apps/
│   ├── api/        # Hono + Node server
│   └── web/        # Next.js 16 + React 19 + Tailwind 4
└── packages/
    └── shared/     # Shared types & utilities (@ugc/shared)
```

## Requirements

- Node `>=20`
- pnpm `>=11` (`corepack enable` recommended)

## Getting started

```bash
pnpm install        # install all workspace deps
pnpm dev            # run web + api in parallel
```

## Scripts (run from repo root)

| Command          | Description                     |
| ---------------- | ------------------------------- |
| `pnpm dev`       | Run all apps in parallel        |
| `pnpm dev:web`   | Run only the web app            |
| `pnpm dev:api`   | Run only the api                |
| `pnpm build`     | Build all packages              |
| `pnpm lint`      | Lint all packages               |
| `pnpm format`    | Format all packages             |
| `pnpm typecheck` | Type-check all packages         |
| `pnpm clean`     | Remove build artifacts & caches |

The web app runs on `http://localhost:3000` and the api on `http://localhost:3001`
(override with `PORT`).
