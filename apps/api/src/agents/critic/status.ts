// Artifact status transitions driven by the critic.
//
// Image skills always insert sheets as `draft`. The critic moves a row to
// `approved` when its inspection passes, or `rejected` when it triggers a
// regeneration (the new sheet starts `draft` again). Artifacts are immutable
// rows — a regen makes a NEW row; we never edit persisted bytes in place.

import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/** The two artifact tables the critic inspects (person sheets are out of F5 scope). */
export type InspectableSheetTable =
  | typeof schema.productReferenceSheets
  | typeof schema.storyboardSheets;

async function setStatus(
  table: InspectableSheetTable,
  artifactId: string,
  status: "approved" | "rejected",
): Promise<void> {
  await db.update(table).set({ status }).where(eq(table.id, artifactId));
}

export const approveArtifact = (
  table: InspectableSheetTable,
  artifactId: string,
) => setStatus(table, artifactId, "approved");

export const rejectArtifact = (
  table: InspectableSheetTable,
  artifactId: string,
) => setStatus(table, artifactId, "rejected");
