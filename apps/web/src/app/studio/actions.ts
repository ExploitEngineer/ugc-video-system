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
  action: "cancel" | "regenerate-template",
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

/**
 * Retry a `pipeline: "template"` run that failed on the automatic
 * text-fill/render step (`TEMPLATE_FILL_FAILED`/`TEMPLATE_RENDER_FAILED`).
 * Rewinds to the pre-fill checkpoint and flips back to `running`; the driver
 * re-enters `template_fill` → `template_render` (re-running the LLM fill too —
 * cheap, and self-healing if bad text caused the failure).
 */
export async function regenerateTemplateAction(
  runId: string,
): Promise<RunDetail | null> {
  return mutateRun(runId, "regenerate-template");
}

/**
 * Re-render the video clip(s) of a finished or soft-failed run, reusing the
 * existing storyboard + reference sheets. `segmentIndex` targets one clip of a
 * multi-segment run (omit for the 15s clip / all segments); `note` is an
 * optional one-line steer. Returns the fresh RunDetail (run flips to `running`).
 */
export async function regenerateVideoAction(
  runId: string,
  opts: { segmentIndex?: number; note?: string } = {},
): Promise<RunDetail | null> {
  try {
    const res = await fetch(apiUrl(`/runs/${runId}/regenerate-video`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(opts.segmentIndex != null
          ? { segmentIndex: opts.segmentIndex }
          : {}),
        ...(opts.note?.trim() ? { note: opts.note.trim() } : {}),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as RunDetail;
  } catch (err) {
    console.error("[regenerateVideoAction] request to API failed:", err);
    return null;
  }
}

export type RetemplateResult =
  | { ok: true; run: RunDetail }
  | { ok: false; error: string };

/**
 * Composite this ad's EXISTING video into a different template.
 *
 * The reference sheets, the storyboard and the 15s master clip are reused; only
 * the plan, the on-screen copy, the template's stills and the composite are
 * re-derived for the new slots. The run flips back to `running` and the worker
 * drives the short chain.
 *
 * Unlike the actions above this one surfaces the API's message rather than
 * collapsing to `null`: its refusals ("that is already this ad's template", an
 * aspect-ratio mismatch) are the whole point, and the user has to read them.
 */
export async function retemplateAction(
  runId: string,
  templateId: string,
): Promise<RetemplateResult> {
  try {
    const res = await fetch(apiUrl(`/runs/${runId}/retemplate`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { ok: false, error: body?.error ?? `Failed (${res.status}).` };
    }
    return { ok: true, run: (await res.json()) as RunDetail };
  } catch (err) {
    console.error("[retemplateAction] request to API failed:", err);
    return { ok: false, error: "Could not reach the server." };
  }
}
