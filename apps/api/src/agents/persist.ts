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
      })
      .returning();

    const artifact = await artifactInsert(tx, asset.id);
    return { assetId: asset.id, assetUrl: url, artifact };
  });
}
