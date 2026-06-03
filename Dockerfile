# syntax=docker/dockerfile:1
##
## Single-image deploy for the Next.js web app + Hono API (pnpm workspace).
##
## Unlike a Vite SPA (static files servable by Hono), Next.js is a server
## (SSR + server actions + route-handler proxies), so it can't be served as
## static assets. This image therefore runs TWO processes:
##   - Hono API on a fixed internal port (3001)
##   - Next.js on the platform's public $PORT
## The browser only ever talks to Next; Next's server-side code proxies to the
## API at http://localhost:3001 (the apiUrl() fallback), so no NEXT_PUBLIC_*
## build args are needed.
##
## The API runs via tsx (no compile): @ugc/shared ships raw TypeScript and is
## consumed from source.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable

# --- deps: install the whole workspace (cached unless a manifest changes) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# --- build: compile the Next.js app (the API needs no build step) ---
FROM deps AS builder
COPY . .
RUN pnpm --filter web build

# --- runner: the built workspace + both servers ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app /app

# API listens here internally; Next serves the public traffic on $PORT.
ENV API_PORT=3001
EXPOSE 3000

# Apply DB migrations FIRST (idempotent — Drizzle tracks applied ones), then
# start both servers. A failed migration fails the deploy loudly instead of
# booting into a schema-less DB where every query 500s. `wait -n` exits
# (→ container restart) if EITHER server dies, so a crash never leaves a
# half-up container.
CMD ["bash", "-c", "pnpm --filter api db:migrate && (PORT=$API_PORT pnpm --filter api start & pnpm --filter web start & wait -n)"]
