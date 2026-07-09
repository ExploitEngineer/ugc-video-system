// Supabase Storage helper — uploads + public URLs.
//
// Uses the SERVICE-ROLE key so storage RLS is bypassed (auth lands in F8;
// for now the API/worker is the only writer). Bucket `ugc-assets` is a
// PUBLIC bucket: `getPublicUrl` returns a stable URL we store once on the
// asset row (no signed-URL re-signing). The bucket must pre-exist — run
// `pnpm --filter api storage:setup` once, or create it in the dashboard
// (public read). Uploads fail loudly with a clear message otherwise.

import type { AssetKind } from "@ugc/shared";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/index.js";
import { internal } from "./errors.js";

export const BUCKET = "ugc-assets";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a", // audio track extracted from the final video (AAC in MP4)
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/json": "json", // serialized CE.SDK editor scene
  // User-uploaded template projects (kept for retention; registered to Nexrender
  // from the raw bytes). Custom mimes set by the template-register/asset routes.
  "application/zip": "zip",
  "application/x-aep": "aep",
  "application/x-mogrt": "mogrt",
};

function extFor(contentType: string): string {
  return EXT_BY_MIME[contentType] ?? "bin";
}

/** Upload retry tuning — mirrors the BytePlus provider's transient-failure policy. */
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = 800;
/**
 * Hard ceiling per upload attempt. The Supabase client has no upload timeout, so
 * a silently-stalled connection (opens, never responds) would hang the caller
 * forever. On timeout we surface a synthetic transient error so the attempt is
 * retried, then fails cleanly — never an eternal hang.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * A bare undici/network failure (the `fetch failed` / connection-reset / timeout
 * family) that never reached Supabase, so retrying is safe. A real error (missing
 * bucket, bad key) does NOT match — we fail fast on those instead of retrying.
 */
const TRANSIENT_UPLOAD_ERROR =
  /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network|timed? ?out/i;

const isTransientUpload = (message: string): boolean =>
  TRANSIENT_UPLOAD_ERROR.test(message);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface UploadAssetInput {
  runId: string;
  kind: AssetKind;
  bytes: Uint8Array;
  contentType: string;
}

export interface UploadAssetResult {
  storagePath: string;
  url: string;
}

/** Upload bytes under `runs/{runId}/{kind}-{uuid}.{ext}` → path + public URL. */
export async function uploadAsset({
  runId,
  kind,
  bytes,
  contentType,
}: UploadAssetInput): Promise<UploadAssetResult> {
  // The random UUID keeps `storagePath` stable across retries, so re-uploading
  // after a transient failure can never collide with a prior attempt.
  const storagePath = `runs/${runId}/${kind}-${crypto.randomUUID()}.${extFor(contentType)}`;
  return uploadBytes(storagePath, bytes, contentType);
}

/**
 * A template's preview video / poster frame, under `templates/{templateId}/…`.
 *
 * These are NOT `assets` rows: `assets.run_id` is NOT NULL with an FK to `runs`,
 * and a template preview belongs to no run. Their URLs live as columns on the
 * `templates` row instead, and this prefix is deliberately outside `runs/` so
 * `deleteRunObjects` and `db:reset` never touch them — rebuilding the library
 * means re-uploading .aep files and paying for a preview render each.
 */
export async function uploadTemplateObject({
  templateId,
  kind,
  bytes,
  contentType,
}: {
  templateId: string;
  kind: "preview" | "poster";
  bytes: Uint8Array;
  contentType: string;
}): Promise<UploadAssetResult> {
  const storagePath = `templates/${templateId}/${kind}-${crypto.randomUUID()}.${extFor(contentType)}`;
  return uploadBytes(storagePath, bytes, contentType);
}

/**
 * The retrying upload core, shared by run assets and template objects. Races
 * each attempt against a timeout (the Supabase client has none, so a stalled
 * connection would hang forever) and retries only network blips.
 */
async function uploadBytes(
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<UploadAssetResult> {
  let lastMessage = "";
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    // A timeout resolves to a synthetic transient error (matches
    // TRANSIENT_UPLOAD_ERROR → retried).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { error } = await Promise.race([
      supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType, upsert: false }),
      new Promise<{ error: { message: string } }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              error: {
                message: `storage upload timed out after ${UPLOAD_TIMEOUT_MS}ms (network)`,
              },
            }),
          UPLOAD_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    if (!error) return { storagePath, url: getPublicUrl(storagePath) };

    lastMessage = error.message;
    // Fail fast on real errors (missing bucket, bad key) — only retry network blips.
    if (!isTransientUpload(error.message) || attempt === UPLOAD_MAX_ATTEMPTS) break;
    await sleep(UPLOAD_BACKOFF_MS * attempt);
  }

  throw internal(
    isTransientUpload(lastMessage)
      ? `Storage upload failed after ${UPLOAD_MAX_ATTEMPTS} attempts (network error): ${lastMessage}`
      : `Storage upload failed (bucket "${BUCKET}" — does it exist?): ${lastMessage}`,
  );
}

/** Stable public URL for an object in the public bucket. */
export function getPublicUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Delete every stored object for a run — all uploads + generated sheets +
 * the final video live under the flat `runs/{runId}/` prefix. Best-effort:
 * lists the folder and removes what's there (a run has only a handful of
 * objects, well under the list page size).
 */
export async function deleteRunObjects(runId: string): Promise<void> {
  return deletePrefix(`runs/${runId}`, `run ${runId}`);
}

/** Delete a template's preview objects (`templates/{templateId}/…`). */
export async function deleteTemplateObjects(templateId: string): Promise<void> {
  return deletePrefix(`templates/${templateId}`, `template ${templateId}`);
}

async function deletePrefix(prefix: string, label: string): Promise<void> {
  const PAGE = 100;
  // Page through the flat prefix until a short/empty page. We always list from
  // offset 0 because each iteration REMOVES what it listed, so the next "first
  // page" is the previously-unseen objects — an offset would skip items.
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE });
    if (error) {
      throw internal(`Storage list failed for ${label}: ${error.message}`);
    }
    if (!data || data.length === 0) return;

    const paths = data.map((obj) => `${prefix}/${obj.name}`);
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) {
      throw internal(
        `Storage delete failed for ${label}: ${removeError.message}`,
      );
    }
    if (data.length < PAGE) return; // last page — nothing more to remove
  }
}
