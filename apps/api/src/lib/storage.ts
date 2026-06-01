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
};

function extFor(contentType: string): string {
  return EXT_BY_MIME[contentType] ?? "bin";
}

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
  const storagePath = `runs/${runId}/${kind}-${crypto.randomUUID()}.${extFor(contentType)}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: false });

  if (error) {
    throw internal(
      `Storage upload failed (bucket "${BUCKET}" — does it exist?): ${error.message}`,
    );
  }

  return { storagePath, url: getPublicUrl(storagePath) };
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
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
}
