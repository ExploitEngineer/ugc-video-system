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
  "video/mp4": "mp4",
  "audio/mp4": "m4a", // audio track extracted from the final video (AAC in MP4)
  "application/json": "json", // serialized CE.SDK editor scene
};

function extFor(contentType: string): string {
  return EXT_BY_MIME[contentType] ?? "bin";
}

/** Upload retry tuning — mirrors the BytePlus provider's transient-failure policy. */
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BACKOFF_MS = 800;

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

  let lastMessage = "";
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: false });

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
  const prefix = `runs/${runId}`;
  const PAGE = 100;
  // Page through the flat prefix until a short/empty page. We always list from
  // offset 0 because each iteration REMOVES what it listed, so the next "first
  // page" is the previously-unseen objects — an offset would skip items.
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE });
    if (error) {
      throw internal(`Storage list failed for run ${runId}: ${error.message}`);
    }
    if (!data || data.length === 0) return;

    const paths = data.map((obj) => `${prefix}/${obj.name}`);
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) {
      throw internal(
        `Storage delete failed for run ${runId}: ${removeError.message}`,
      );
    }
    if (data.length < PAGE) return; // last page — nothing more to remove
  }
}
