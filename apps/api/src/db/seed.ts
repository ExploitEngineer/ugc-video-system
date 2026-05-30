// Seed/test helper — inserts one sample run end-to-end (project → run →
// asset → step_event) and reads it back to prove the schema + FKs work.
// Run via `pnpm db:seed`. Safe to re-run: each call makes fresh rows.

import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { assets, projects, runs, stepEvents } from "./schema.js";

const [project] = await db
  .insert(projects)
  .values({ title: "Sample project" })
  .returning();

const [run] = await db
  .insert(runs)
  .values({
    projectId: project.id,
    prompt: "A sleek 15s ad for a stainless steel water bottle",
    adStyle: "premium minimalist",
    mode: "automatic",
    status: "queued",
  })
  .returning();

await db.insert(assets).values({
  runId: run.id,
  kind: "product_upload",
  storagePath: `runs/${run.id}/product_upload.png`,
  mime: "image/png",
});

await db.insert(stepEvents).values({
  runId: run.id,
  step: "product_sheet",
  status: "started",
});

const [back] = await db.select().from(runs).where(eq(runs.id, run.id));

console.log("✓ seeded sample run:", run.id);
console.log("  project:", project.id);
console.log("  run.status / mode:", run.status, "/", run.mode);
console.log("  read-back ok:", back?.id === run.id);

process.exit(0);
