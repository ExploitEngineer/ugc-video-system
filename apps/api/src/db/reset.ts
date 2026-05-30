// Destructive DB + storage wipe — TRUNCATEs every table (keeps the schema,
// enums and tables intact) and empties the `ugc-assets` bucket. Run via
// `pnpm --filter api db:reset`. Irreversible; there is no confirmation prompt,
// so only run it deliberately. Schema is left in place — no db:push needed.

import { sql } from "drizzle-orm";
import { db } from "./index.js";
import { BUCKET, supabase } from "../lib/storage.js";

// Order is irrelevant — RESTART IDENTITY CASCADE clears FK-linked rows in one
// atomic statement.
const TABLES = [
  "projects",
  "runs",
  "assets",
  "step_events",
  "product_reference_sheets",
  "person_reference_sheets",
  "storyboard_sheets",
  "videos",
];

async function truncateTables(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`));
  console.log(`✓ truncated ${TABLES.length} tables`);
}

// Supabase list() is not recursive: files live at `runs/{runId}/{file}`, so
// walk one level of run folders and delete their objects in batches.
async function emptyBucket(): Promise<void> {
  const { data: folders, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list("runs", { limit: 1000 });

  if (listErr) {
    // Bucket may not exist yet — nothing to wipe.
    console.log(`• storage: skipped (${listErr.message})`);
    return;
  }
  if (!folders || folders.length === 0) {
    console.log("• storage: already empty");
    return;
  }

  const paths: string[] = [];
  for (const folder of folders) {
    const { data: files } = await supabase.storage
      .from(BUCKET)
      .list(`runs/${folder.name}`, { limit: 1000 });
    for (const f of files ?? []) paths.push(`runs/${folder.name}/${f.name}`);
  }

  if (paths.length === 0) {
    console.log("• storage: no files under runs/");
    return;
  }

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (rmErr) throw new Error(`storage remove failed: ${rmErr.message}`);
  console.log(`✓ removed ${paths.length} storage objects`);
}

await truncateTables();
await emptyBucket();
console.log("✓ reset complete");
process.exit(0);
