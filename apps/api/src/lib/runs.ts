// Shared run query helpers used across the /runs routes.

import type { RunDetail, RunStatus } from "@ugc/shared";
import { asc, desc, eq } from "drizzle-orm";
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
  const [assetRows, eventRows, storyboard] = await Promise.all([
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
    // Newest storyboard sheet — ordered by its asset's createdAt (the table
    // has no timestamp of its own), mirroring `latestStoryboardSheet`.
    db
      .select({ sheet: schema.storyboardSheets })
      .from(schema.storyboardSheets)
      .innerJoin(
        schema.assets,
        eq(schema.storyboardSheets.assetId, schema.assets.id),
      )
      .where(eq(schema.storyboardSheets.runId, runId))
      .orderBy(desc(schema.assets.createdAt))
      .limit(1),
  ]);
  return toRunDetailDto(run, assetRows, eventRows, storyboard[0]?.sheet);
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
