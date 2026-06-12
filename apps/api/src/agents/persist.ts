import { db, schema } from "../db/index.js";
import { type AssetKind } from "@ugc/shared";
import { uploadAsset } from "../lib/storage.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Shared persistence for run artifacts (image sheets + final video):
 * upload bytes → Storage, then in one tx insert the `assets` row + the
 * artifact row (product/person/storyboard sheet, or video). Returns ids + URL.
 */
export interface PersistSheetInput<TArtifact> {
  runId: string;
  kind: AssetKind;
  bytes: Uint8Array;
  mime: string;
  /** Optional asset metadata (e.g. `{ segmentIndex }` so the UI can order segments). */
  meta?: Record<string, unknown>;
  artifactInsert: (tx: Tx, assetId: string) => Promise<TArtifact>;
}

export interface PersistSheetResult<TArtifact> {
  assetId: string;
  assetUrl: string;
  artifact: TArtifact;
}

export async function persistSheet<TArtifact>({
  runId,
  kind,
  bytes,
  mime,
  meta,
  artifactInsert,
}: PersistSheetInput<TArtifact>): Promise<PersistSheetResult<TArtifact>> {
  const { storagePath, url } = await uploadAsset({
    runId,
    kind,
    bytes,
    contentType: mime,
  });

  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(schema.assets)
      .values({
        runId,
        kind,
        storagePath,
        url,
        mime,
        meta: meta ?? null,
      })
      .returning();

    const artifact = await artifactInsert(tx, asset.id);
    return { assetId: asset.id, assetUrl: url, artifact };
  });
}

export interface PersistAssetInput {
  runId: string;
  kind: AssetKind;
  bytes: Uint8Array;
  mime: string;
  /** Optional asset metadata (e.g. `{ source: "cesdk" }`). */
  meta?: Record<string, unknown>;
}

/**
 * Persist a standalone asset that has NO artifact-table row: upload bytes →
 * Storage, then insert the `assets` row. Used for files produced outside the
 * generation pipeline — the user's CE.SDK `edited_video` / `editor_scene` saved
 * on a completed run. (`persistSheet` is for pipeline sheets/videos that also
 * need their structured artifact row inserted in the same transaction.)
 */
export async function persistAsset({
  runId,
  kind,
  bytes,
  mime,
  meta,
}: PersistAssetInput): Promise<{ assetId: string; assetUrl: string }> {
  const { storagePath, url } = await uploadAsset({
    runId,
    kind,
    bytes,
    contentType: mime,
  });

  const [asset] = await db
    .insert(schema.assets)
    .values({ runId, kind, storagePath, url, mime, meta: meta ?? null })
    .returning();

  return { assetId: asset.id, assetUrl: url };
}
