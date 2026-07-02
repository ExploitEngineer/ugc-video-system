// Live smoke test for the Plainly provider — doubles as the P0 go/no-go gate.
//
// Two modes:
//   1. DISCOVERY — fetch a template and print its parameter names/types so you
//      know exactly which keys to send (Plainly param names come from AE layer
//      names). Run with no param=value pairs.
//   2. RENDER — submit a render with the params you pass, poll to DONE, print the
//      output URL. Pass your real ugc-assets clip URLs as the media params.
//
// Usage:
//   pnpm --filter api plainly:smoke <projectId> <templateId> [param=value ...] [--run=<runId>]
//
// Examples:
//   # discover the param names first
//   pnpm --filter api plainly:smoke media-abstract@v1 square
//   # print a run's segment_video URLs to copy as media params
//   pnpm --filter api plainly:smoke media-abstract@v1 square --run=<runId>
//   # render (clip1/clip2/headline are whatever the template exposes)
//   pnpm --filter api plainly:smoke <pid> <tid> clip1=<url> clip2=<url> headline="Try it"
//
// Creates a real (billable) render in your Plainly account. Verifies the live
// JSON shapes (it dumps the raw template payload) — confirm field names here
// before P3 codes against them.

import { and, asc, eq } from "drizzle-orm";
import { env } from "../src/config/index.js";
import { db, schema } from "../src/db/index.js";
import {
  createPlainlyProvider,
  isPlainlyConfigured,
} from "../src/providers/plainly/index.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv: string[]): {
  positional: string[];
  params: Record<string, string>;
  runId?: string;
} {
  const positional: string[] = [];
  const params: Record<string, string> = {};
  let runId: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--run=")) {
      runId = a.slice("--run=".length);
    } else if (a.includes("=")) {
      const i = a.indexOf("=");
      params[a.slice(0, i)] = a.slice(i + 1);
    } else {
      positional.push(a);
    }
  }
  return { positional, params, runId };
}

async function segmentClipUrls(runId: string): Promise<string[]> {
  const rows = await db
    .select({ url: schema.assets.url })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.runId, runId),
        eq(schema.assets.kind, "segment_video"),
      ),
    )
    .orderBy(asc(schema.assets.createdAt));
  return rows.map((r) => r.url).filter((u): u is string => Boolean(u));
}

async function main(): Promise<void> {
  if (!isPlainlyConfigured()) {
    console.error("✗ PLAINLY_API_KEY not set in apps/api/.env");
    process.exit(1);
  }

  const { positional, params, runId } = parseArgs(process.argv.slice(2));
  const [projectId, templateId] = positional;
  if (!projectId || !templateId) {
    console.error(
      "usage: pnpm --filter api plainly:smoke <projectId> <templateId> [param=value ...] [--run=<runId>]",
    );
    process.exit(1);
  }

  const plainly = createPlainlyProvider();

  if (runId) {
    const urls = await segmentClipUrls(runId);
    if (urls.length === 0) {
      console.log(`\n(no segment_video assets for run ${runId})`);
    } else {
      console.log(`\nsegment_video URLs for run ${runId} (copy as media params):`);
      urls.forEach((u, i) => console.log(`  clip${i + 1} = ${u}`));
    }
  }

  console.log(`\nfetching template ${projectId} / ${templateId} …`);
  const tpl = await plainly.getTemplate(projectId, templateId);
  console.log(`\nparameters (${tpl.params.length}):`);
  for (const p of tpl.params) {
    const type = `${p.layerType ?? "?"}${p.mediaType ? `/${p.mediaType}` : ""}`;
    console.log(`  ${p.name}  [${type}]${p.mandatory ? "  *required" : ""}`);
  }
  console.log("\nraw template payload (verify field names live):");
  console.log(JSON.stringify(tpl.raw, null, 2).slice(0, 4000));

  if (Object.keys(params).length === 0) {
    console.log(
      "\ndiscovery only — no param=value given. Re-run with the media/text params above to render, e.g.:\n  pnpm --filter api plainly:smoke " +
        `${projectId} ${templateId} <param>=<clipUrl> …`,
    );
    process.exit(0);
  }

  console.log("\nsubmitting render with params:", Object.keys(params).join(", "));
  const submitted = await plainly.submitRender({ projectId, templateId, parameters: params });
  console.log(`render ${submitted.renderId} — state=${submitted.rawState}`);

  const deadline = Date.now() + env.PLAINLY_POLL_TIMEOUT_MS;
  let render = submitted;
  while (render.state === "processing") {
    if (Date.now() > deadline) {
      console.error(`✗ render ${submitted.renderId} timed out`);
      process.exit(1);
    }
    await sleep(env.PLAINLY_POLL_INTERVAL_MS);
    render = await plainly.pollRender(submitted.renderId);
    console.log(`  state=${render.rawState}`);
  }

  if (render.state === "failed") {
    console.error(`\n✗ render failed: ${render.error ?? render.rawState}`);
    process.exit(1);
  }

  console.log(`\n✓ DONE — output: ${render.output}`);
  if (render.expirationDate) console.log(`  expires: ${render.expirationDate}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n✗ ${err?.message ?? err}`);
  process.exit(1);
});
