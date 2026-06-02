// Standalone driver for the Creative Direction Agent — runs ONE run through the
// orchestrator without the polling worker.
//
//   pnpm --filter api cda:verify <runId>
//
// <runId> must be a real run created via POST /runs (so a product_upload asset
// exists). Drives it from its current status to the next stop
// (awaiting_confirmation | completed | failed), then prints the run row +
// step_events. Re-run after confirm/reject to advance further.
//
// WARNING: hits live OpenAI + the video provider — costs money and is slow.

import { asc, eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.js";
import { driveRun } from "../src/agents/creative-direction/orchestrator.js";

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: cda:verify <runId>");
    process.exit(1);
  }

  const [before] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId));
  if (!before) {
    console.error(`Run ${runId} not found.`);
    process.exit(1);
  }
  console.log(`\n▶ Driving run ${runId} (status: ${before.status})`);

  await driveRun(runId);

  const [after] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.id, runId));
  console.log(
    `\n■ Run now: status=${after?.status} currentStep=${after?.currentStep ?? "—"} adStyle="${after?.adStyle ?? ""}"`,
  );
  if (after?.error) console.log(`  error: ${after.error}`);

  const events = await db
    .select()
    .from(schema.stepEvents)
    .where(eq(schema.stepEvents.runId, runId))
    .orderBy(asc(schema.stepEvents.createdAt));
  console.log("\n step_events:");
  for (const e of events) {
    console.log(`  ${e.createdAt.toISOString()} ${e.step}/${e.status}`);
  }

  console.log("\n✅ Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Drive failed:", err);
  process.exit(1);
});
