// Server-side base URL for the Hono api. Server actions and route handlers run
// in Node (not the browser), so they call apps/api directly — no CORS. Reuses
// the public NEXT_PUBLIC_API_URL; falls back to the dev port.

import type { Run, RunDetail } from "@ugc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const apiUrl = (path: string) => `${API_URL}${path}`;

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
