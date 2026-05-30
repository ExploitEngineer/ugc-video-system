// Shared persist step for image skills: upload bytes → insert the `assets`
// row → insert the skill's artifact-table row, the last two atomically.
//
// Upload happens BEFORE the transaction (matching the create-run route's
// recoverable stance): an upload failure leaves no DB rows, and a DB failure
// leaves an orphan storage object but never an asset row without its artifact.

import type { AssetKind } from "@ugc/shared";
import { db, schema } from "../../db/index.js";
import { internal } from "../../lib/errors.js";
import { uploadAsset } from "../../lib/storage.js";

/** Drizzle transaction handle (same query builder as `db`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface PersistSheetInput<TArtifact> {
  runId: string;
  kind: AssetKind;
  bytes: Uint8Array;
  mime: string;
  /** Insert the artifact-table row for the freshly-created asset; return it. */
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
      .values({ runId, kind, storagePath, url, mime })
      .returning({ id: schema.assets.id, url: schema.assets.url });

    if (!asset) throw internal("Failed to insert asset row.");

    const artifact = await artifactInsert(tx, asset.id);
    return { assetId: asset.id, assetUrl: asset.url ?? url, artifact };
  });
}
