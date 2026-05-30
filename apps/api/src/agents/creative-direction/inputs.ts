// Run-input loaders for the orchestrator — consolidates the latest-sheet /
// upload queries that the per-agent verify.ts scripts each copy-pasted.
//
// Every step reloads from the DB (never threads state through memory) so a
// crash/restart resumes purely from persisted rows.

import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { ImageRef } from "../../providers/openai/index.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;
type StoryboardSheet = typeof schema.storyboardSheets.$inferSelect;

export interface SheetHandle {
  artifactId: string;
  assetId: string;
  assetUrl: string;
}

/** The two uploaded images, as `ImageRef`s when present. */
export async function loadUploads(
  runId: string,
): Promise<{ productUpload?: ImageRef; personUpload?: ImageRef }> {
  const assets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.runId, runId));
  const find = (kind: "product_upload" | "person_upload"): ImageRef | undefined => {
    const a = assets.find((row) => row.kind === kind);
    return a?.url ? { source: a.url, mime: a.mime ?? undefined } : undefined;
  };
  return { productUpload: find("product_upload"), personUpload: find("person_upload") };
}

/** Newest product sheet for the run + its asset URL and view notes. */
export async function latestProductSheet(runId: string): Promise<
  (SheetHandle & { views: ProductReferenceSheet["views"] }) | undefined
> {
  const [row] = await db
    .select({ sheet: schema.productReferenceSheets, url: schema.assets.url })
    .from(schema.productReferenceSheets)
    .innerJoin(
      schema.assets,
      eq(schema.productReferenceSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.productReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  if (!row?.url) return undefined;
  return {
    artifactId: row.sheet.id,
    assetId: row.sheet.assetId,
    assetUrl: row.url,
    views: row.sheet.views,
  };
}

/** Newest storyboard sheet for the run + its asset URL and scenes. */
export async function latestStoryboardSheet(runId: string): Promise<
  (SheetHandle & { scenes: StoryboardSheet["scenes"] }) | undefined
> {
  const [row] = await db
    .select({ sheet: schema.storyboardSheets, url: schema.assets.url })
    .from(schema.storyboardSheets)
    .innerJoin(
      schema.assets,
      eq(schema.storyboardSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.storyboardSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  if (!row?.url) return undefined;
  return {
    artifactId: row.sheet.id,
    assetId: row.sheet.assetId,
    assetUrl: row.url,
    scenes: row.sheet.scenes,
  };
}

/** Newest generated person sheet URL for the run (none when person uploaded). */
export async function latestPersonSheetUrl(
  runId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ url: schema.assets.url })
    .from(schema.personReferenceSheets)
    .innerJoin(
      schema.assets,
      eq(schema.personReferenceSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.personReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row?.url ?? undefined;
}

/**
 * Resolve the person reference for the storyboard steps: the uploaded image
 * when present, else the latest generated person sheet, else undefined.
 */
export async function resolvePersonRef(
  runId: string,
  personUpload?: ImageRef,
): Promise<ImageRef | undefined> {
  if (personUpload) return personUpload;
  const url = await latestPersonSheetUrl(runId);
  return url ? { source: url, mime: "image/png" } : undefined;
}
