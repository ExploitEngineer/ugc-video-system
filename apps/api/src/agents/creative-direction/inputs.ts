// Run-input loaders for the orchestrator — consolidates the latest-sheet /
// upload queries that the per-agent verify.ts scripts each copy-pasted.
//
// Every step reloads from the DB (never threads state through memory) so a
// crash/restart resumes purely from persisted rows.

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { ImageRef } from "../../providers/openai/index.js";
import type { NarrativeOutline } from "../types.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;
type StoryboardSheet = typeof schema.storyboardSheets.$inferSelect;

export interface SheetHandle {
  artifactId: string;
  assetId: string;
  assetUrl: string;
}

/** One 60s segment storyboard, resolved to the NEWEST sheet for its index. */
export interface SegmentSheetHandle extends SheetHandle {
  segmentIndex: number;
  scenes: StoryboardSheet["scenes"];
}

/** One 60s segment video clip + its stored asset URL, for the merge step. */
export interface SegmentVideoHandle {
  segmentIndex: number;
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

// ── 60s pipeline loaders ──────────────────────────────────────────────

/**
 * Newest 60s MASTER storyboard sheet (the single 16-panel 4×4 sheet) + its URL
 * and 16 scenes. Distinguished from the four cropped row strips by its asset
 * `kind = "storyboard_master"` (the crops are `storyboard_sheet`); distinguished
 * from a 15s single sheet by the kind too. Undefined until the master is built.
 */
export async function latestMasterStoryboard(runId: string): Promise<
  (SheetHandle & { scenes: StoryboardSheet["scenes"] }) | undefined
> {
  const [row] = await db
    .select({ sheet: schema.storyboardSheets, url: schema.assets.url })
    .from(schema.storyboardSheets)
    .innerJoin(
      schema.assets,
      eq(schema.storyboardSheets.assetId, schema.assets.id),
    )
    .where(
      and(
        eq(schema.storyboardSheets.runId, runId),
        eq(schema.assets.kind, "storyboard_master"),
      ),
    )
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

/** Whether the 60s master sheet has been persisted (idempotent resume). */
export async function persistedMasterStoryboard(runId: string): Promise<boolean> {
  return Boolean(await latestMasterStoryboard(runId));
}

/** The planned 60s arc (`runs.narrativeOutline`), or undefined if not planned yet. */
export async function latestNarrativeOutline(
  runId: string,
): Promise<NarrativeOutline | undefined> {
  const [row] = await db
    .select({ outline: schema.runs.narrativeOutline })
    .from(schema.runs)
    .where(eq(schema.runs.id, runId))
    .limit(1);
  const outline = row?.outline as NarrativeOutline | null | undefined;
  return outline && Array.isArray(outline.segments) ? outline : undefined;
}

/**
 * The NEWEST storyboard sheet per segment index (0..3), ordered by index.
 * A targeted regen inserts a fresh row for one index; ordering by the asset's
 * createdAt desc and keeping the first seen per index makes the latest win.
 */
export async function segmentStoryboards(
  runId: string,
): Promise<SegmentSheetHandle[]> {
  const rows = await db
    .select({ sheet: schema.storyboardSheets, url: schema.assets.url })
    .from(schema.storyboardSheets)
    .innerJoin(
      schema.assets,
      eq(schema.storyboardSheets.assetId, schema.assets.id),
    )
    .where(
      and(
        eq(schema.storyboardSheets.runId, runId),
        isNotNull(schema.storyboardSheets.segmentIndex),
      ),
    )
    .orderBy(desc(schema.assets.createdAt));

  const byIndex = new Map<number, SegmentSheetHandle>();
  for (const row of rows) {
    const idx = row.sheet.segmentIndex;
    if (idx == null || !row.url || byIndex.has(idx)) continue;
    byIndex.set(idx, {
      segmentIndex: idx,
      artifactId: row.sheet.id,
      assetId: row.sheet.assetId,
      assetUrl: row.url,
      scenes: row.sheet.scenes,
    });
  }
  return [...byIndex.values()].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/** Segment indices that already have a persisted storyboard sheet (idempotent resume). */
export async function persistedSegmentStoryboardIndices(
  runId: string,
): Promise<Set<number>> {
  const sheets = await segmentStoryboards(runId);
  return new Set(sheets.map((s) => s.segmentIndex));
}

/** The NEWEST segment video clip per index (0..3), ordered by index, for merge. */
export async function segmentVideos(
  runId: string,
): Promise<SegmentVideoHandle[]> {
  const rows = await db
    .select({
      segmentIndex: schema.videos.segmentIndex,
      assetId: schema.videos.assetId,
      url: schema.assets.url,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.videos)
    .innerJoin(schema.assets, eq(schema.videos.assetId, schema.assets.id))
    .where(
      and(
        eq(schema.videos.runId, runId),
        isNotNull(schema.videos.segmentIndex),
      ),
    )
    .orderBy(desc(schema.assets.createdAt));

  const byIndex = new Map<number, SegmentVideoHandle>();
  for (const row of rows) {
    const idx = row.segmentIndex;
    if (idx == null || !row.url || byIndex.has(idx)) continue;
    byIndex.set(idx, { segmentIndex: idx, assetId: row.assetId, assetUrl: row.url });
  }
  return [...byIndex.values()].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/** Segment indices that already have a persisted video clip (idempotent resume). */
export async function persistedSegmentVideoIndices(
  runId: string,
): Promise<Set<number>> {
  const vids = await segmentVideos(runId);
  return new Set(vids.map((v) => v.segmentIndex));
}

/**
 * Whether the run's single FINAL video (the 15s clip / merged output, i.e. the
 * `videos` row with `segment_index IS NULL`) is already persisted. The 15s
 * `video` step's idempotent-resume guard, mirroring the segment guards above so
 * a crash before the `completed` write can't trigger a second paid generation.
 */
export async function persistedFinalVideo(runId: string): Promise<boolean> {
  const row = await db.query.videos.findFirst({
    where: and(
      eq(schema.videos.runId, runId),
      isNull(schema.videos.segmentIndex),
    ),
  });
  return Boolean(row);
}

/**
 * Public URL of the run's single FINAL clip — the `final_video` asset (the
 * `videos` row with `segment_index IS NULL`, joined to its asset). This is the
 * clip the `template_render` step feeds into a Nexrender template. Returns the
 * NEWEST such asset; undefined if the final video is not persisted yet.
 */
export async function latestFinalVideoUrl(
  runId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ url: schema.assets.url })
    .from(schema.assets)
    .where(and(eq(schema.assets.runId, runId), eq(schema.assets.kind, "final_video")))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row?.url ?? undefined;
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
 * Newest person sheet's metadata (views/personDetails) — carried forward when an
 * edit revise regenerates the sheet, so the descriptive fields aren't lost.
 */
export async function latestPersonSheetMeta(runId: string): Promise<
  | Pick<
      typeof schema.personReferenceSheets.$inferSelect,
      "views" | "personDetails"
    >
  | undefined
> {
  const [row] = await db
    .select({
      views: schema.personReferenceSheets.views,
      personDetails: schema.personReferenceSheets.personDetails,
    })
    .from(schema.personReferenceSheets)
    .innerJoin(
      schema.assets,
      eq(schema.personReferenceSheets.assetId, schema.assets.id),
    )
    .where(eq(schema.personReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);
  return row ?? undefined;
}

/**
 * Resolve the person reference for the storyboard steps: the latest generated
 * person sheet when one exists, else the uploaded image, else undefined.
 *
 * Generated-sheet-wins precedence lets a step-by-step REVISE of an uploaded
 * person take effect — a revise generates a person sheet that then overrides
 * the upload. Normal uploaded runs (no revise) have no generated sheet, so the
 * upload is used as before.
 */
export async function resolvePersonRef(
  runId: string,
  personUpload?: ImageRef,
): Promise<ImageRef | undefined> {
  const url = await latestPersonSheetUrl(runId);
  if (url) return { source: url, mime: "image/png" };
  return personUpload;
}
