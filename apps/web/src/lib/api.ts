// Base URL for the Hono api, used ONLY server-side (route handlers + server
// actions run in Node — no CORS). The browser never calls the API directly; it
// hits same-origin Next proxies under /api/runs. So NEXT_PUBLIC_API_URL is
// optional, and the localhost:3001 fallback is correct for the co-located API
// in the single-image deploy. (Override it only if the API is a separate host.)

import type { Run, RunDetail } from "@ugc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const apiUrl = (path: string) => `${API_URL}${path}`;

/**
 * Create a run by POSTing the multipart form to the same-origin Next proxy
 * (`/api/runs`), which streams it through to the API server-side. Going through
 * a Route Handler (not a Server Action, whose 1 MB body cap rejects real
 * product/person images) keeps the browser same-origin — no CORS, no Private
 * Network Access prompt, no public API URL needed. Returns the new `RunDetail`;
 * throws a readable error on failure.
 */
export async function createRun(formData: FormData): Promise<RunDetail> {
  const res = await fetch("/api/runs", { method: "POST", body: formData });
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

/**
 * Save a CE.SDK edit of the run's final video. POSTs the exported MP4 (and,
 * when present, the serialized editor scene) as multipart form data to the
 * same-origin Next proxy (`/api/runs/:id/edited-video`), which streams it to
 * the API. Returns the updated `RunDetail` — now carrying the new
 * `edited_video` (and `editor_scene`) assets. Throws a readable error on failure.
 */
export async function uploadEditedVideo(
  runId: string,
  video: Blob,
  scene?: Blob,
): Promise<RunDetail> {
  const form = new FormData();
  form.append("video", video, "edited-video.mp4");
  if (scene) form.append("scene", scene, "scene.json");

  const res = await fetch(`/api/runs/${runId}/edited-video`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to save the edited video.");
  }
  return res.json() as Promise<RunDetail>;
}
