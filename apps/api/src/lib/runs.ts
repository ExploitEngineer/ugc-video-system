// Shared run query helpers used across the /runs routes.

import type { RunDetail, RunStatus } from "@ugc/shared";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { conflict, notFound } from "./errors.js";
import { toRunDetailDto } from "./mappers.js";

const uuidSchema = z.string().uuid();

type RunRow = typeof schema.runs.$inferSelect;

/** Fetch a run row or throw 404. Malformed ids are treated as not-found. */
export async function getRunOr404(runId: string): Promise<RunRow> {
  if (!uuidSchema.safeParse(runId).success) {
    throw notFound("Run not found");
  }
  const run = await db.query.runs.findFirst({
    where: eq(schema.runs.id, runId),
  });
  if (!run) throw notFound("Run not found");
  return run;
}

/** Compose the full `RunDetail` (run + assets + stepEvents + scenes) for a run. */
export async function loadRunDetail(runId: string): Promise<RunDetail> {
  const run = await getRunOr404(runId);
  const [assetRows, eventRows, storyboard, segmentSheets] = await Promise.all([
    db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.runId, runId))
      .orderBy(asc(schema.assets.createdAt)),
    db
      .select()
      .from(schema.stepEvents)
      .where(eq(schema.stepEvents.runId, runId))
      .orderBy(asc(schema.stepEvents.createdAt)),
    // Newest 15s storyboard sheet — ordered by its asset's createdAt (the table
    // has no timestamp of its own), mirroring `latestStoryboardSheet`. Scoped to
    // `storyboard_sheet` kind so a 60s run's `storyboard_master` row can't be
    // returned here; for 60s this arg is dropped entirely below anyway.
    db
      .select({ sheet: schema.storyboardSheets })
      .from(schema.storyboardSheets)
      .innerJoin(
        schema.assets,
        eq(schema.storyboardSheets.assetId, schema.assets.id),
      )
      .where(
        and(
          eq(schema.storyboardSheets.runId, runId),
          eq(schema.assets.kind, "storyboard_sheet"),
        ),
      )
      .orderBy(desc(schema.assets.createdAt))
      .limit(1),
    // 60s: all segment storyboard sheets (newest-per-index resolved in the
    // mapper), oldest→newest so the mapper's last-write-wins keeps the latest.
    db
      .select({ sheet: schema.storyboardSheets })
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
      .orderBy(asc(schema.assets.createdAt)),
  ]);
  return toRunDetailDto(
    run,
    assetRows,
    eventRows,
    // 60s flattens its scenes from the four crop strips (below); the single-sheet
    // arg is for the 15s path only — never pass a 60s crop here.
    run.duration === "60s" ? undefined : storyboard[0]?.sheet,
    run.duration === "60s" ? segmentSheets.map((s) => s.sheet) : null,
  );
}

/** Guard a state transition; throws 409 when the run is in a bad status. */
export function assertStatus(
  run: RunRow,
  allowed: RunStatus[],
  message: string,
): void {
  if (!allowed.includes(run.status)) {
    throw conflict(message);
  }
}
