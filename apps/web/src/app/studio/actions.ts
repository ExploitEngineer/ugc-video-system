"use server";

// Run mutations as Next.js server actions. Create redirects into the run
// view; confirm/reject/cancel mutate the mock store and return the fresh
// detail so the client can prime its query cache. In F3 these call the Hono
// API (POST /runs, /runs/:id/confirm, …) with the same external contract.

import { createRunInputSchema, type RunDetail } from "@ugc/shared";
import { redirect } from "next/navigation";
import {
  cancelRun,
  confirmStep,
  createRun,
  rejectStep,
} from "@/lib/mock/store";

export type ActionResult = { ok: true } | { ok: false; error: string };

function hasFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function createRunAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createRunInputSchema.safeParse({
    prompt: formData.get("prompt"),
    mode: formData.get("mode"),
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

  // Mock: we don't persist the uploaded bytes — only whether a person image
  // was provided. F3 uploads both files to Supabase Storage here.
  const id = createRun(parsed.data);
  redirect(`/studio/${id}`);
}

export async function confirmStepAction(
  runId: string,
): Promise<RunDetail | null> {
  return confirmStep(runId);
}

export async function rejectStepAction(
  runId: string,
): Promise<RunDetail | null> {
  return rejectStep(runId);
}

export async function cancelRunAction(
  runId: string,
): Promise<RunDetail | null> {
  return cancelRun(runId);
}
