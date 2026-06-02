# syntax=docker/dockerfile:1
# API service: Hono HTTP server + in-process pipeline worker.
#
# Run with tsx (no compile step): @ugc/shared ships raw TypeScript and is
# consumed from source, so there is no dist to build — tsx executes the
# TypeScript entry directly, exactly like local dev.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# pnpm via corepack, version pinned by the repo's "packageManager" field.
RUN corepack enable

# --- deps layer (cached unless a manifest or the lockfile changes) ---
# Copy every workspace manifest so the workspace graph resolves, then install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

# --- source ---
COPY . .

# Railway/host injects PORT; the server reads it (defaults to 3001).
EXPOSE 3001
CMD ["pnpm", "--filter", "api", "start"]
