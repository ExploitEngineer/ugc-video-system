// Base URL for the Hono api. Server actions and route handlers run in Node (no
// CORS); `createRun` below also calls it straight from the browser to skip the
// Next Server Action 1 MB body limit on image uploads. Reuses the public
// NEXT_PUBLIC_API_URL (must be browser-reachable in prod); falls back to dev.

import type { Run, RunDetail } from "@ugc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const apiUrl = (path: string) => `${API_URL}${path}`;

/**
 * Create a run by POSTing the multipart form straight to the API from the
 * browser — NOT through a Next Server Action, whose 1 MB body cap rejects
 * real product/person images (and crashes the Next server with a 413). The API
 * validates the input and returns the new `RunDetail`. Throws a readable error
 * on failure. Requires the API's `CORS_ORIGIN` to include the frontend origin.
 */
export async function createRun(formData: FormData): Promise<RunDetail> {
  const res = await fetch(apiUrl("/runs"), { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to start run.");
  }
  return res.json() as Promise<RunDetail>;
}

/**
 * Client-side run list through the Next proxy (`/api/runs`). Powers the studio
 * sidebar so every run already in the database shows up, not just locally
 * created ones. Newest first (the API orders by createdAt desc).
 */
export async function fetchRuns(): Promise<Run[]> {
  const res = await fetch("/api/runs", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load runs");
  return res.json();
}

/**
 * Client-side run fetch through the Next polling proxy (`/api/runs/:id`).
 * Shared by the run view and the studio sidebar's per-run status dots.
 * Throws "not-found" on 404 so callers can short-circuit retries.
 */
export async function fetchRun(runId: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error("Failed to load run");
  return res.json();
}
