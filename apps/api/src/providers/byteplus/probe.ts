// Live test for BytePlus face-asset registration — exercises the exact path the
// video adapter uses (ensureFaceAsset) against a run's person reference sheet.
//
// Usage: pnpm --filter api byteplus:probe <runId>
//
// Looks up the run's latest person_sheet asset URL (public Supabase URL),
// registers it as a BytePlus face asset, polls until Active, and prints the
// resulting asset id. Creates real data in your BytePlus account.

import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { isAssetMgmtConfigured, ensureFaceAsset } from "./assets.js";

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("usage: pnpm --filter api byteplus:probe <runId>");
    process.exit(1);
  }
  if (!isAssetMgmtConfigured()) {
    console.error("✗ BYTEPLUS_ACCESS_KEY / BYTEPLUS_SECRET_KEY not set in apps/api/.env");
    process.exit(1);
  }

  const [row] = await db
    .select({ url: schema.assets.url })
    .from(schema.personReferenceSheets)
    .innerJoin(schema.assets, eq(schema.personReferenceSheets.assetId, schema.assets.id))
    .where(eq(schema.personReferenceSheets.runId, runId))
    .orderBy(desc(schema.assets.createdAt))
    .limit(1);

  if (!row?.url) {
    console.error(`✗ no person_sheet for run ${runId}`);
    process.exit(1);
  }

  console.log(`person sheet URL: ${row.url}`);
  console.log("registering as BytePlus face asset (create → poll until Active) …");
  const assetId = await ensureFaceAsset(row.url, `${runId}-person-0`);
  console.log(`\n✓ asset id: ${assetId}`);
  console.log(`  reference it in the task as: asset://${assetId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
