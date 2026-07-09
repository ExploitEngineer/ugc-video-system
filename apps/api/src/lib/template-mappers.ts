// DB row → API DTO for the template library.
//
// Two shapes, deliberately: the PUBLIC one never exposes `nexrenderTemplateId`,
// the storage object paths, or the raw introspected structure. Only the admin
// view carries those.

import type { TemplateAdmin, TemplateStatus, TemplateSummary } from "@ugc/shared";
import { templateStatusSchema } from "@ugc/shared";

import {
  parseMetadata,
  parseStructure,
  type TemplateRow,
} from "../agents/template/library.js";

/** `status` is text + CHECK in the DB, so validate on the way out. */
const toStatus = (v: string): TemplateStatus =>
  templateStatusSchema.safeParse(v).data ?? "failed";

const toPreviewSource = (v: string | null): "auto" | "admin" | null =>
  v === "auto" || v === "admin" ? v : null;

/** What the picker renders. Safe to serve unauthenticated. */
export function toTemplateSummaryDto(row: TemplateRow): TemplateSummary {
  const metadata = parseMetadata(row.metadata);
  return {
    id: row.id,
    displayName: row.displayName,
    description: row.description,
    tags: row.tags ?? [],
    status: toStatus(row.status),
    durationSec: metadata?.durationSec ?? null,
    aspectRatio: metadata?.aspectRatio ?? null,
    slotCounts: metadata?.slotCounts ?? null,
    previewVideoUrl: row.previewVideoUrl,
    previewPosterUrl: row.previewPosterUrl,
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The admin console's view: adds the Nexrender id, the slots and the error. */
export function toTemplateAdminDto(row: TemplateRow): TemplateAdmin {
  const structure = parseStructure(row.structure);
  return {
    ...toTemplateSummaryDto(row),
    nexrenderTemplateId: row.nexrenderTemplateId ?? "",
    slots: structure?.slots ?? [],
    metadata: parseMetadata(row.metadata),
    previewSource: toPreviewSource(row.previewSource),
    error: row.error,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
