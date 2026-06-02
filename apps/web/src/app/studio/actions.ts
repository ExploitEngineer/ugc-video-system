"use server";

// Run mutations as Next.js server actions. These run server-side (Node), so
// they call the Hono API directly — no browser CORS. Create forwards the
// multipart form to POST /runs and returns the new run id so the client can
// record it in the sidebar history and navigate. Confirm/feedback/cancel POST
// to the gating routes and return the fresh RunDetail to prime the query cache.

import { createRunInputSchema, type RunDetail } from "@ugc/shared";
import { apiUrl } from "@/lib/api";

export type ActionResult =
  | { ok: true; runId: string }
  | { ok: false; error: string };

function hasFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function createRunAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createRunInputSchema.safeParse({
    prompt: formData.get("prompt"),
    mode: formData.get("mode"),
    criticEnabled: formData.get("criticEnabled") !== "false",
    hasPersonImage: hasFile(formData.get("personImage")),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (!hasFile(formData.get("productImage"))) {
    return { ok: false, error: "A product image is required." };
  }

  try {
    // Forward the FormData verbatim — fetch sets the multipart boundary, and
    // the field names already match the api (productImage/personImage/…).
    const res = await fetch(apiUrl("/runs"), {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { ok: false, error: body?.error ?? "Failed to start run." };
    }
    const detail = (await res.json()) as RunDetail;
    return { ok: true, runId: detail.id };
  } catch (err) {
    // Server-side log (Next server stdout) — the user still sees a generic message.
    console.error("[createRunAction] request to API failed:", err);
    return {
      ok: false,
      error: "Could not reach the server. Is the API running?",
    };
  }
}

async function mutateRun(
  runId: string,
  action: "confirm" | "cancel",
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

export async function confirmStepAction(
  runId: string,
): Promise<RunDetail | null> {
  return mutateRun(runId, "confirm");
}

/** Submit free-text feedback at a step-by-step gate (approve or revise). */
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
