// The admin-curated template library — the lifecycle of a `templates` row.
//
//   registering → introspecting → previewing → ready
//                      ↓              ↓
//                    failed         failed
//
// Every stage is driven by BOTH the admin routes and the preview worker
// (`preview-worker.ts`), so each is idempotent and safe to re-enter after a
// crash. `previewTemplate` lives in `preview.ts`.
//
// The render provider is INJECTED rather than constructed, so the validation
// branches here (no video slot / more than one) are unit-testable without a
// network or a Nexrender account.

import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

import {
  type TemplateMetadata,
  type TemplateStructure,
  templateMetadataSchema,
  templateStructureSchema,
} from "@ugc/shared";

import { db, schema } from "../../db/index.js";
import { unprocessable } from "../../lib/errors.js";
import { createLogger } from "../../lib/log.js";
import { createTemplateRenderProvider } from "../../providers/index.js";
import type { TemplateRenderProvider } from "../../providers/template-render.js";
import { type AepLayerIndex, parseAepLayersFromFile } from "./aep.js";
import { MAX_TEMPLATE_SEC, MIN_TEMPLATE_SEC } from "./geometry.js";
import { buildMetadata, buildStructure } from "./introspect.js";

const log = createLogger("template-library");

export type TemplateRow = typeof schema.templates.$inferSelect;

/** Only the project types our render path can actually fill. */
export type TemplateSourceType = "aep" | "zip";

/**
 * `.mogrt` is deliberately NOT accepted. Our render job injects content by
 * `layerName` (and `nx:text-params-set`), which is the .aep composition model.
 * A Motion Graphics Template exposes Essential Graphics properties instead,
 * filled with Nexrender's `essential` asset type — so a .mogrt would register,
 * introspect thinly, and then render with NONE of our content in it. Better a
 * clear rejection at upload than a silently empty video.
 */
export function templateTypeFromName(
  filename: string,
): TemplateSourceType | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".zip")) return "zip";
  if (name.endsWith(".aep")) return "aep";
  return null;
}

/** Parse the jsonb columns back into their schemas, tolerating a null/legacy shape. */
export function parseStructure(v: unknown): TemplateStructure | null {
  const r = templateStructureSchema.safeParse(v);
  return r.success ? r.data : null;
}
export function parseMetadata(v: unknown): TemplateMetadata | null {
  const r = templateMetadataSchema.safeParse(v);
  return r.success ? r.data : null;
}

export async function setTemplate(
  id: string,
  patch: Partial<typeof schema.templates.$inferInsert>,
): Promise<void> {
  await db
    .update(schema.templates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.templates.id, id));
}

export async function failTemplate(id: string, reason: string): Promise<void> {
  log.error("template failed", { id, reason });
  await setTemplate(id, { status: "failed", error: reason });
}

// ── discarding a template's upload ───────────────────────────────────────────

/**
 * A run still holding this template mid-pipeline.
 *
 * `routes/runs.ts` copies `nexrenderTemplateId` into `runs.template` when the
 * run is created, and `applyTemplate` renders from that snapshot. So a run that
 * started before the template was archived still needs the remote project to
 * exist. Nexrender's own 409 only protects a job it has already accepted, not
 * one of ours still waiting in the worker queue.
 */
const RUN_TERMINAL = ["completed", "failed"] as const;

async function hasRunInFlight(templateId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.templateId, templateId),
        notInArray(schema.runs.status, [...RUN_TERMINAL]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Hand a template's bytes back to Nexrender, then forget its id.
 *
 * Best-effort, and deliberately so. A failure here must never mask the real
 * reason the template was thrown away, and `nexrenderTemplateId` is cleared ONLY
 * when the remote delete actually succeeded — an upload we could not remove
 * stays discoverable, so `reapArchivedTemplates` can try again, rather than
 * becoming a silent orphan nobody can name.
 */
async function discardRemoteTemplate(
  row: Pick<TemplateRow, "id" | "nexrenderTemplateId">,
  provider: TemplateRenderProvider,
  why: string,
): Promise<boolean> {
  if (!row.nexrenderTemplateId) return true;
  try {
    await provider.deleteTemplate(row.nexrenderTemplateId);
  } catch (err) {
    log.warn("could not delete the remote template; leaving it registered", {
      id: row.id,
      nexrenderTemplateId: row.nexrenderTemplateId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  await setTemplate(row.id, { nexrenderTemplateId: null });
  log.info("discarded the remote template", { id: row.id, why });
  return true;
}

// ── create ───────────────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  filename: string;
  displayName: string;
  description?: string;
  tags?: string[];
  /** The spooled upload on local disk. The CALLER deletes it. */
  path: string;
  size: number;
  /** sha256 of the file, computed while it was being spooled. The dedupe key. */
  contentHash: string;
}

/**
 * Register a template with Nexrender and insert its library row.
 *
 * Deduped by content hash: re-uploading a byte-identical file returns the
 * EXISTING row rather than paying for a second Nexrender registration. Archiving
 * frees the hash (the unique index is partial on `archived_at is null`), so the
 * same file can be re-added later.
 *
 * The bytes stream through this process straight to Nexrender's presigned
 * target. They never touch Supabase.
 */
export async function createTemplate(
  input: CreateTemplateInput,
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<{ row: TemplateRow; deduped: boolean }> {
  const sourceType = templateTypeFromName(input.filename);
  if (!sourceType) {
    throw unprocessable(
      "Template must be a .aep or .zip file. (.mogrt is not supported: its Essential Graphics fields cannot be filled by layer name.)",
    );
  }

  // The project file is the only place a layer's real name and stacking index
  // exist, and this upload is the only time we hold it. Best-effort: an
  // unparseable project still uploads, and its media slots fall back to the name
  // Nexrender reports.
  const aepLayers = await parseAepLayersFromFile(input.path, input.filename);

  const contentHash = input.contentHash;
  const existing = await db.query.templates.findFirst({
    where: and(
      eq(schema.templates.contentHash, contentHash),
      isNull(schema.templates.archivedAt),
    ),
  });
  if (existing) {
    log.info("template deduped by content hash", { id: existing.id });
    // Re-uploading the identical file is how a template registered before this
    // parser existed gets its layer indices. Cheap, and it costs no render.
    if (aepLayers && !existing.aepLayers) {
      await setTemplate(existing.id, { aepLayers });
      return { row: (await getTemplate(existing.id)) ?? existing, deduped: true };
    }
    return { row: existing, deduped: true };
  }

  const [row] = await db
    .insert(schema.templates)
    .values({
      contentHash,
      sourceType,
      sourceFilename: input.filename,
      displayName: input.displayName,
      description: input.description ?? null,
      tags: input.tags ?? [],
      aepLayers,
      status: "registering",
    })
    .returning();
  if (!row) throw new Error("template insert returned no row");

  // Register + upload synchronously: it is fast, and the admin should learn
  // immediately that their file was rejected rather than discovering it in a
  // background status three seconds later.
  //
  // `templateId` lives outside the try so the catch can clean up after itself:
  // if `registerTemplate` succeeded and the byte upload then failed, Nexrender
  // is holding a template that can never be rendered.
  let templateId: string | undefined;
  try {
    const registered = await provider.registerTemplate({
      filename: input.filename,
      displayName: input.displayName,
      type: sourceType,
    });
    templateId = registered.templateId;
    if (registered.upload) {
      await provider.uploadTemplateFile(registered.upload, {
        path: input.path,
        size: input.size,
        contentType:
          sourceType === "zip" ? "application/zip" : "application/octet-stream",
      });
    }

    await setTemplate(row.id, {
      nexrenderTemplateId: templateId,
      status: "introspecting",
    });
    log.info("template registered", { id: row.id, templateId, sourceType });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (templateId) {
      await discardRemoteTemplate(
        { id: row.id, nexrenderTemplateId: templateId },
        provider,
        "the byte upload failed after registration",
      );
    }
    await failTemplate(row.id, `Registration failed: ${reason}`);
    const failed = await getTemplate(row.id);
    return { row: failed ?? row, deduped: false };
  }

  const fresh = await getTemplate(row.id);
  return { row: fresh ?? row, deduped: false };
}

// ── introspect ───────────────────────────────────────────────────────────────

/**
 * The most video slots we will fill. The footage master is sliced across all of
 * them (`clips.ts`), so a slideshow template with many short slots is fine — but
 * past this the slices are too short to read as anything (a 60s master / 60 slots
 * ≈ 1s each), and the template is probably not an ad.
 */
export const MAX_VIDEO_SLOTS = 60;

/**
 * Why a template cannot join the library, and whether that verdict is damning
 * enough to hand the uploaded bytes back.
 *
 * `discard` exists because the two are NOT the same question. Nexrender failing
 * to parse a project is a fact about the project. Every rule below is a fact
 * about OUR classifier — and a classifier is a thing we change. Discarding on one
 * of those means a regression in `introspect.ts` silently destroys an upload that
 * `POST /:id/reintrospect` (free, GETs only) would otherwise rescue. Bytes left
 * in Nexrender's store are cheap and an admin's `DELETE /:id` still reaps them.
 */
export interface TemplateRejection {
  /** Shown to the admin, so it must say what to DO, not just what is wrong. */
  reason: string;
  /** Hand the upload back to Nexrender. Only for verdicts we cannot be wrong about. */
  discard: boolean;
}

/**
 * Why a template cannot join the library, or null when it can. Pure, so the
 * rejection rules are unit-testable without a Nexrender account.
 *
 * SEVERAL video slots are fine. The footage master is cut into a slice per slot,
 * each of that slot's own length, so a 7s/2s/2s template is fully covered. Only a
 * template with NOWHERE to put the footage is unusable.
 */
export function validateForLibrary(
  structure: TemplateStructure,
  metadata: TemplateMetadata,
): TemplateRejection | null {
  const unfillable = validateReplaceableFootage(structure);
  if (unfillable) return unfillable;

  const videoSlots = metadata.slotCounts.video;
  // NOT discardable: this count is what OUR classifier could reach and place
  // (`buildStructure` drops slots the main comp never places), so a bug here
  // reads as "no spot for a video" on a template that has plenty.
  if (videoSlots === 0) {
    return {
      reason: "This template has no spot for a video that the main composition actually places.",
      discard: false,
    };
  }
  if (videoSlots > MAX_VIDEO_SLOTS) {
    return {
      reason: `This template has ${videoSlots} video slots; at most ${MAX_VIDEO_SLOTS} are supported.`,
      discard: false,
    };
  }
  if (!structure.mainComposition) {
    return {
      reason: "Could not determine which composition to render.",
      discard: false,
    };
  }
  // The 8–60s LENGTH gate does NOT live here — it needs a length we can trust, and
  // at this point we only have the composition's `duration` property, which lies
  // (see `durationSec`). Judging an upload on it was actively harmful: a rejection
  // DISCARDS the uploaded bytes (`discardRemoteTemplate` below), so a comp that
  // under-reports lost the file over a number that was never true. The real gate is
  // `validateMeasuredDuration`, run in `preview.ts` against the measured render.
  //
  // All that survives here is a cost fuse: a comp declaring longer than this is not
  // an ad template, it is a mistake, and we are about to pay to render it.
  const dur = metadata.durationSec;
  if (typeof dur === "number" && Number.isFinite(dur) && dur > MAX_COMP_PREFILTER_SEC) {
    return {
      reason: `This composition declares ${dur.toFixed(0)}s, which is far past any ad length — check the project file.`,
      discard: false,
    };
  }
  return null;
}

/**
 * Reject a project whose footage is mostly NOT ours to replace — a finished ad
 * wearing a template's clothes.
 *
 * Nexrender mutates only the layers our job body names, so every media layer we
 * could not classify renders exactly as authored, forever. Feed the pipeline a
 * completed ad and the output is a frankenstein: our clip in whatever holes we
 * recognised, the original's footage, logo and copy everywhere else. That is not
 * a degraded result, it is an unusable one — and it is someone else's ad.
 *
 * THE TEST IS COVERAGE, NOT INTENT. "Is this a template?" cannot be answered by
 * naming, and trying was wrong twice over: real stock templates ship their demo
 * footage under its own filename (`wedding`'s only slot is
 * `mixkit-bride-...-18206.mp4`), so they look exactly like a finished ad's baked
 * footage; and `isPlaceholder` matched a finished ad's `Phone` comp on `/^ph/`.
 * What actually matters is not what the designer meant, it is what we can reach:
 * a project whose every footage layer is replaceable WORKS as a template, whoever
 * made it and whatever they called it.
 *
 * So we count the media that renders and that we can never touch. `av/file(no-ext)`
 * is a file-backed layer whose name carries no extension — which means the designer
 * RENAMED it ("Scene 2 - cafe wide"), which a hand-finished project does and a
 * stock template does not. Measured across the whole library, the separation is
 * total: the one finished ad has 35 such layers against 12 replaceable slots;
 * every real template has ZERO. (`nested-comp` looks tempting and is NOT a signal —
 * healthy templates carry 50 of them.)
 *
 * Non-discarding: a false reject costs a re-read, a false discard costs the upload.
 */
export function validateReplaceableFootage(
  structure: TemplateStructure,
): TemplateRejection | null {
  const slots = structure.slots ?? [];
  // Nothing to judge — `validateForLibrary`'s own rules cover an empty project.
  if (slots.length === 0) return null;

  // Media that will render and that no job asset can ever address.
  const untouchable = structure.ignored?.["av/file(no-ext)"] ?? 0;
  // Media we can actually fill. Orphans are already gone (`buildStructure`).
  const replaceable = slots.filter(
    (s) => s.asset === "VIDEO" || s.asset === "IMAGE",
  ).length;
  if (untouchable <= replaceable) return null;

  return {
    reason:
      `This project has ${untouchable} footage/image layers we cannot replace against only ` +
      `${replaceable} we can, which is what a finished ad looks like rather than a template: ` +
      `its own footage is baked into renamed layers, so a render would keep them and splice ` +
      `our clip in around them. Build the template with EMPTY placeholders — leave each one's ` +
      `source under its own filename rather than renaming the layer — per ` +
      `docs/after-effects-template-spec.md.`,
    discard: false,
  };
}

/**
 * A comp declaring longer than this is a mistake, not a template — and rendering
 * a preview of it costs money. Deliberately generous: this is a fuse, NOT the
 * length gate (`comp.duration` is arbitrary; the 8–60s rule is enforced on the
 * MEASURED length in `preview.ts`).
 */
export const MAX_COMP_PREFILTER_SEC = 600;

/**
 * Why a MEASURED template length is unusable, or null when it is fine.
 *
 * The real 8–60s gate: under 8s there is not enough footage for a coherent ad,
 * over 60s is past the footage cap (four ≤15s Seedance clips merged). Runs at
 * preview time, against the length the template actually rendered.
 */
export function validateMeasuredDuration(sec: number): string | null {
  if (sec < MIN_TEMPLATE_SEC) {
    return `This template renders ${sec.toFixed(1)}s; templates must be at least ${MIN_TEMPLATE_SEC}s.`;
  }
  if (sec > MAX_TEMPLATE_SEC) {
    return `This template renders ${sec.toFixed(1)}s; templates must be at most ${MAX_TEMPLATE_SEC}s.`;
  }
  return null;
}

/**
 * Carry a MEASURED duration across a re-introspection.
 *
 * `buildMetadata` re-derives `durationSec` from the composition — the number we do
 * not trust — so without this, one click of `POST /:id/reintrospect` silently
 * reverts a measured 21.0s back to the comp's 30.97s, and the next run quietly
 * over-generates again. Nothing about the project file changed, so the
 * measurement is still true.
 */
export function withMeasuredDuration(
  fresh: TemplateMetadata,
  prior: TemplateMetadata | null,
): TemplateMetadata {
  const measured = prior?.measuredDurationSec;
  if (typeof measured !== "number" || !(measured > 0)) return fresh;
  return {
    ...fresh,
    durationSec: measured,
    measuredDurationSec: measured,
    durationSource: "measured",
  };
}

/**
 * Poll Nexrender's introspection ONCE and advance the row if it is done.
 * Idempotent and cheap, so the admin console (and later the preview worker) can
 * call it on a timer.
 *
 * Returns the row's status after the attempt: still `introspecting` means
 * Nexrender is still parsing the project.
 */
export async function introspectTemplate(
  id: string,
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw unprocessable("Template not found.");
  // `failed` is terminal, and a rejected template no longer has a remote id
  // (we gave its bytes back). Without this, a stray poll would fall into the
  // branch below and overwrite the real rejection reason with "never registered".
  if (row.status === "failed") return row;
  if (!row.nexrenderTemplateId) {
    await failTemplate(id, "Template was never registered with Nexrender.");
    return (await getTemplate(id)) ?? row;
  }

  const raw = await provider.getTemplateStructure(row.nexrenderTemplateId);

  if (raw.status === "error" || raw.status === "failed") {
    await discardRemoteTemplate(row, provider, "Nexrender could not parse it");
    await failTemplate(id, `Nexrender could not parse this project (${raw.status}).`);
    return (await getTemplate(id)) ?? row;
  }
  if (raw.status !== "uploaded") {
    // awaiting_upload | downloading | processing — still working.
    return row;
  }

  const structure = buildStructure(
    raw.compositions,
    raw.layers,
    row.aepLayers as AepLayerIndex | null,
  );
  // Never let a re-derived composition duration clobber a measurement we already
  // trust (`buildMetadata` re-reads the comp's arbitrary `duration`).
  const metadata = withMeasuredDuration(buildMetadata(structure), parseMetadata(row.metadata));

  const rejection = validateForLibrary(structure, metadata);
  if (rejection) {
    // Only hand the bytes back when the verdict is one we cannot be wrong about
    // (see `TemplateRejection.discard`). Every current rule reads OUR classifier,
    // so they all keep the upload: fixing the classifier and re-reading rescues
    // the template, and an admin's `DELETE /:id` still reaps the store.
    if (rejection.discard) {
      await discardRemoteTemplate(row, provider, rejection.reason);
    }
    await failTemplate(id, rejection.reason);
    return (await getTemplate(id)) ?? row;
  }

  await setTemplate(id, {
    structure,
    metadata,
    error: null,
    // Hand off to the preview stage. A template is not pickable until a user can
    // SEE it: `previewTemplate` renders the template's own placeholder content
    // and re-hosts the clip + a poster frame, then flips this to `ready`.
    status: "previewing",
  });
  const { video, image, text, audio } = metadata.slotCounts;
  log.info("template introspected", {
    id,
    durationSec: metadata.durationSec ?? "unknown",
    slots: `${video}v ${image}i ${text}t ${audio}a`,
  });
  return (await getTemplate(id)) ?? row;
}

/**
 * Re-derive a template's structure from Nexrender, in place.
 *
 * The project bytes never change; our reading of them does. When introspection
 * learns something new — that a placeholder comp is empty and must be targeted
 * through its outer layer, that a slot's real length lives in the layer chain
 * rather than the child comp's `duration` — every template in the library is
 * carrying a stale structure, and re-uploading a 200MB `.aep` to fix that is
 * absurd. This is GETs only: no upload, no render, no cost.
 *
 * The existing preview is kept. It shows the template's own placeholder content,
 * which no change to our classifier can affect.
 */
export async function reintrospectTemplate(
  id: string,
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<TemplateRow> {
  const row = await getTemplate(id);
  if (!row) throw unprocessable("Template not found.");
  if (!row.nexrenderTemplateId) {
    throw unprocessable("Template was never registered with Nexrender.");
  }

  const raw = await provider.getTemplateStructure(row.nexrenderTemplateId);
  if (raw.status !== "uploaded") {
    throw unprocessable(
      `Nexrender has not finished parsing this project (${raw.status}).`,
    );
  }

  const structure = buildStructure(
    raw.compositions,
    raw.layers,
    row.aepLayers as AepLayerIndex | null,
  );
  // Never let a re-derived composition duration clobber a measurement we already
  // trust (`buildMetadata` re-reads the comp's arbitrary `duration`).
  const metadata = withMeasuredDuration(buildMetadata(structure), parseMetadata(row.metadata));

  const rejection = validateForLibrary(structure, metadata);
  if (rejection) {
    // NEVER discard here, whatever the verdict says. This template was accepted
    // once; what changed is OUR classifier. Deleting the upload would mean a
    // regression in our own code could wipe every project in the library in one
    // sweep, recoverable only by re-uploading each file by hand. The row goes
    // `failed`; the bytes stay, so fixing the classifier and re-reading rescues it.
    await failTemplate(id, rejection.reason);
    return (await getTemplate(id)) ?? row;
  }

  await setTemplate(id, {
    structure,
    metadata,
    error: null,
    // A template that already has a preview goes straight back to pickable.
    status: row.previewVideoUrl ? "ready" : "previewing",
  });
  const { video, image, text, audio } = metadata.slotCounts;
  log.info("template re-introspected", {
    id,
    durationSec: metadata.durationSec ?? "unknown",
    slots: `${video}v ${image}i ${text}t ${audio}a`,
  });
  return (await getTemplate(id)) ?? row;
}

// ── read / update / archive ──────────────────────────────────────────────────

export async function getTemplate(id: string): Promise<TemplateRow | undefined> {
  return db.query.templates.findFirst({ where: eq(schema.templates.id, id) });
}

/**
 * The admin console's list: every LIVE row, any status, newest first.
 *
 * Archived rows are excluded. `archiveTemplate` is a soft delete — runs made
 * with a template keep their snapshot — but to the admin who pressed the button
 * it has to LOOK deleted, and an archived row that keeps coming back reads as a
 * broken button.
 */
export async function listAllTemplates(): Promise<TemplateRow[]> {
  return db.query.templates.findMany({
    where: isNull(schema.templates.archivedAt),
    orderBy: [desc(schema.templates.createdAt)],
  });
}

/** What the picker sees: ready and not archived. */
export async function listPublicTemplates(
  sort: "popular" | "newest" | "name" = "popular",
): Promise<TemplateRow[]> {
  const rows = await db.query.templates.findMany({
    where: and(
      eq(schema.templates.status, "ready"),
      isNull(schema.templates.archivedAt),
    ),
    orderBy: [desc(schema.templates.createdAt)],
  });
  // Small table; sort in memory rather than branching the query builder.
  if (sort === "popular") {
    return rows.sort(
      (a, b) =>
        b.useCount - a.useCount ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  if (sort === "name") {
    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return rows;
}

export async function updateTemplate(
  id: string,
  patch: { displayName?: string; description?: string | null; tags?: string[] },
): Promise<TemplateRow | undefined> {
  await setTemplate(id, patch);
  return getTemplate(id);
}

/**
 * Soft delete. Hides the template from the picker and frees its content hash
 * for re-upload. Runs that used it keep their `template` snapshot and their
 * `template_id` FK is ON DELETE SET NULL, so an archived template can never
 * take finished ads down with it.
 *
 * The row is soft; the UPLOAD is not. A template the admin removed from the
 * library will never be rendered again, so its bytes go back to Nexrender —
 * unless a run is still mid-pipeline with it, in which case the delete is left
 * to `reapArchivedTemplates` once that run finishes. Archiving ALWAYS succeeds:
 * a provider that will not delete must not be able to keep a template visible.
 */
export async function archiveTemplate(
  id: string,
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<void> {
  await setTemplate(id, { archivedAt: new Date() });
  log.info("template archived", { id });

  const row = await getTemplate(id);
  if (!row?.nexrenderTemplateId) return;

  if (await hasRunInFlight(id)) {
    log.info("remote delete deferred: a run is still using this template", {
      id,
    });
    return;
  }
  await discardRemoteTemplate(row, provider, "archived by an admin");
}

/**
 * Delete the Nexrender upload of every archived template that still has one.
 *
 * The safety net for the two cases `archiveTemplate` cannot handle inline: a run
 * was in flight when the admin pressed Delete, or the remote delete failed. Also
 * cleans up everything archived before this code existed.
 *
 * Returns how many uploads it reclaimed. Never throws: it runs on the worker's
 * tick, and one stubborn template must not stop the next one being swept.
 */
export async function reapArchivedTemplates(
  provider: TemplateRenderProvider = createTemplateRenderProvider(),
): Promise<number> {
  const rows = await db.query.templates.findMany({
    where: and(
      isNotNull(schema.templates.archivedAt),
      isNotNull(schema.templates.nexrenderTemplateId),
    ),
    limit: 20, // a sweep, not a migration
  });
  if (rows.length === 0) return 0;

  let reaped = 0;
  for (const row of rows) {
    if (await hasRunInFlight(row.id)) continue;
    if (await discardRemoteTemplate(row, provider, "archived")) reaped += 1;
  }
  if (reaped > 0) log.info("reaped archived template uploads", { reaped });
  return reaped;
}

/**
 * Bump `use_count` when a run picks this template. Powers the "popular" sort.
 * Done as a raw `use_count = use_count + 1` so concurrent runs cannot lose an
 * increment to a read-modify-write race.
 */
export async function incrementTemplateUse(id: string): Promise<void> {
  await db
    .update(schema.templates)
    .set({ useCount: sql`${schema.templates.useCount} + 1` })
    .where(eq(schema.templates.id, id));
}
