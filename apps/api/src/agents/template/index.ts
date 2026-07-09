// Template Agent — the `pipeline: "template"` run's `template_render` step.
//
// Feeds the run's finished 15s clip into the After Effects template the user
// uploaded BEFORE the run was created (registered + introspected up front —
// see `POST /templates/register` — so a bad template file never wastes AI
// cost), via Nexrender, and persists the rendered result as a `templated_video`
// asset ALONGSIDE the original `final_video` (never replacing it).
//
// Async, like the Video Builder: submit a render → poll the job id → download
// the output mp4 → re-host to Supabase (Nexrender Cloud retains outputs ~14d).

import { and, eq } from "drizzle-orm";
import { runTemplateSchema, type TemplateTextFillEntry } from "@ugc/shared";
import { db, schema } from "../../db/index.js";
import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import {
  classifyRunError,
  RunFailure,
  truncateDetail,
} from "../../lib/run-failure.js";
import { createTemplateRenderProvider } from "../../providers/index.js";
import type {
  TemplateRenderResult,
  TemplateRenderTask,
} from "../../providers/template-render.js";
import { latestFinalVideoUrl } from "../creative-direction/inputs.js";
import { writeStepEvent } from "../events.js";
import { persistAsset, persistSheet } from "../persist.js";
import type { SkillContext } from "../types.js";
import { fillTemplateText } from "./fill-text/index.js";
import { generateTemplateImages } from "./images/index.js";
import { planTemplate } from "./plan/index.js";
import { buildRenderInput } from "./render-input.js";

type Video = typeof schema.videos.$inferSelect;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The stills `template_images` generated, keyed by the slot they belong to.
 * A slot with no entry keeps the template's own artwork.
 */
async function generatedImageUrls(runId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ url: schema.assets.url, meta: schema.assets.meta })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.runId, runId),
        eq(schema.assets.kind, "template_image"),
      ),
    );
  const out = new Map<string, string>();
  for (const r of rows) {
    const name = (r.meta as { jobLayerName?: string } | null)?.jobLayerName;
    if (name && r.url) out.set(name, r.url);
  }
  return out;
}

/**
 * Composite everything the pipeline generated — the clip, the written copy and
 * the generated stills — into the template picked at run creation. Idempotent on
 * resume: if a Nexrender job id is already persisted (crash mid-render) we poll
 * THAT job instead of submitting a second paid render.
 */
export async function applyTemplate(ctx: SkillContext): Promise<void> {
  const runId = ctx.runId;
  const log = createLogger("template", { run: runId });

  await writeStepEvent({ runId, step: "template_render", status: "started" });
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, runId),
    });
    if (!run) throw new Error(`template_render: run ${runId} not found`);

    const clipUrl = await latestFinalVideoUrl(runId);
    if (!clipUrl) {
      throw new Error("template_render: no final_video to feed the template");
    }

    const template = runTemplateSchema.parse(run.template);
    const imageUrls = await generatedImageUrls(runId);
    const input = buildRenderInput({
      runId,
      template,
      textFill: (run.templateTextFill as TemplateTextFillEntry[] | null) ?? [],
      imageUrls,
      clipUrl,
    });
    const { mainComposition: composition, nexrenderTemplateId } = template;
    log.info("render job assembled", {
      assets: input.assets.length,
      images: imageUrls.size,
      trimComp: template.metadata.trimComp,
      clipSeconds: template.metadata.clipSeconds,
    });

    const provider = createTemplateRenderProvider();

    // Idempotent resume: reuse a persisted job id rather than re-submitting.
    let task: TemplateRenderTask;
    if (run.nexrenderJobId) {
      log.info("resuming existing render job", { jobId: run.nexrenderJobId });
      task = { jobId: run.nexrenderJobId };
    } else {
      task = await provider.submitRender(input);
      await db
        .update(schema.runs)
        .set({ nexrenderJobId: task.jobId })
        .where(eq(schema.runs.id, runId));
    }

    // Poll until terminal or the dead-man's-switch timeout fires.
    const deadline = Date.now() + env.NEXRENDER_POLL_TIMEOUT_MS;
    let result: TemplateRenderResult = { state: "processing" };
    while (Date.now() < deadline) {
      result = await provider.pollRender(task);
      if (result.state === "completed" || result.state === "failed") break;
      await sleep(env.NEXRENDER_POLL_INTERVAL_MS);
    }

    if (result.state === "failed") {
      throw new RunFailure(
        "TEMPLATE_RENDER_FAILED",
        "The template render failed.",
        result.error ?? `Nexrender job ${task.jobId} failed`,
      );
    }
    if (result.state !== "completed" || !result.videoUrl) {
      throw new RunFailure(
        "TEMPLATE_RENDER_FAILED",
        "The template render timed out.",
        `Nexrender job ${task.jobId} did not finish within ${env.NEXRENDER_POLL_TIMEOUT_MS}ms (last status: ${result.status ?? "unknown"})`,
      );
    }

    // Download the Nexrender output and re-host to Supabase — the Cloud URL
    // expires (~14d), so persist our own copy immediately.
    log.info("▶ downloading render output", { jobId: task.jobId });
    const res = await fetchWithRetry(result.videoUrl, undefined, {
      label: "template-render-download",
    });
    if (!res.ok) {
      throw new Error(
        `template_render: download failed ${res.status} for job ${task.jobId}`,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());

    const persisted = await persistSheet<Video>({
      runId,
      kind: "templated_video",
      bytes,
      mime: "video/mp4",
      meta: { source: "nexrender", nexrenderTemplateId },
      artifactInsert: async (tx, assetId) => {
        const [row] = await tx
          .insert(schema.videos)
          .values({
            runId,
            assetId,
            segmentIndex: null,
            hasAudio: true,
            providerMeta: {
              provider: "nexrender",
              nexrenderTemplateId,
              nexrenderJobId: task.jobId,
              composition,
            },
            status: "completed",
          })
          .returning();
        return row;
      },
    });

    // Best-effort: capture the MODIFIED .aep Nexrender returned (the editable
    // project), re-hosted to Supabase alongside the mp4. Non-fatal — not every
    // job/plan emits one, and a missing project must never fail the render.
    if (result.projectUrl) {
      try {
        const aepRes = await fetchWithRetry(result.projectUrl, undefined, {
          label: "template-render-aep-download",
        });
        if (aepRes.ok) {
          await persistAsset({
            runId,
            kind: "template_aep",
            bytes: new Uint8Array(await aepRes.arrayBuffer()),
            mime: "application/x-aep",
            meta: { source: "nexrender", jobId: task.jobId },
          });
          log.info("✓ modified .aep persisted", { jobId: task.jobId });
        } else {
          log.warn("modified .aep download failed (non-fatal)", {
            jobId: task.jobId,
            status: aepRes.status,
          });
        }
      } catch (err) {
        log.warn("modified .aep capture failed (non-fatal)", {
          jobId: task.jobId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await writeStepEvent({
      runId,
      step: "template_render",
      status: "passed",
      payload: { nexrenderTemplateId, jobId: task.jobId },
    });
    log.info("✓ templated video persisted", { assetId: persisted.assetId });
  } catch (err) {
    const failure = classifyRunError(err, "TEMPLATE_RENDER_FAILED");
    const raw = err instanceof Error ? err.message : String(err);
    const detail = failure.detail ?? raw;
    log.error("✗ template_render failed", { code: failure.code, err: detail });
    await writeStepEvent({
      runId,
      step: "template_render",
      status: "failed",
      payload: {
        error: failure.userMessage,
        code: failure.code,
        detail: truncateDetail(detail),
      },
    });
    throw new RunFailure(failure.code, failure.userMessage, detail, {
      cause: err,
    });
  }
}

/** Template Agent barrel. */
export const templateAgent = {
  planTemplate,
  applyTemplate,
  fillTemplateText,
  generateTemplateImages,
};
