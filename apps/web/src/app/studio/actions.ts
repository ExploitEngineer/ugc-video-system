"use server";

// Run mutations as Next.js server actions. These run server-side (Node), so
// they call the Hono API directly — no browser CORS. Feedback/cancel POST to the
// gating routes and return the fresh RunDetail to prime the query cache. (Run
// CREATION is NOT here: it uploads the multipart form via `createRun` in
// lib/api.ts → the /api/runs Route Handler, which streams it to the API —
// Server Actions' 1 MB body cap would reject/crash on real images.)

import type { RunDetail } from "@ugc/shared";
import { apiUrl } from "@/lib/api";

async function mutateRun(
  runId: string,
  action: "cancel",
): Promise<RunDetail | null> {
  try {
    const res = await fetch(apiUrl(`/runs/${runId}/${action}`), {
      method: "POST",
    });
    if (!res.ok) return null;
    return (await res.json()) as RunDetail;
  } catch (err) {
    console.error(`[mutateRun:${action}] request to API failed:`, err);
    return null;
  }
}

/** Permanently delete a run + all its files/DB rows. Returns true on success. */
export async function deleteRunAction(runId: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/runs/${runId}`), { method: "DELETE" });
    // 404 = the run is already gone; the goal (it no longer exists) is met, so
    // treat it as success and let the client clear it from local history.
    return res.ok || res.status === 404;
  } catch (err) {
    console.error("[deleteRunAction] request to API failed:", err);
    return false;
  }
}

/**
 * The single step-by-step gate action: submit free text (blank = continue). The
 * API decides approve (advance) vs revise (regenerate the person/storyboard).
 */
export async function submitFeedbackAction(
  runId: string,
  message: string,
): Promise<RunDetail | null> {
  try {
    const res = await fetch(apiUrl(`/runs/${runId}/feedback`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return null;
    return (await res.json()) as RunDetail;
  } catch (err) {
    console.error("[submitFeedbackAction] request to API failed:", err);
    return null;
  }
}

export async function cancelRunAction(
  runId: string,
): Promise<RunDetail | null> {
  return mutateRun(runId, "cancel");
}
