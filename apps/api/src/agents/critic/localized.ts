// Localized partial regen — PRODUCT SHEET ONLY.
//
// When the critic finds defects confined to specific view cell(s), we re-edit
// the EXISTING sheet (passed as the single reference image, so the provider
// takes the `images.edit` branch) with a targeted prompt that fixes only the
// flagged cells and keeps the rest identical. No new provider capability — it
// reuses `generateImage` + `persistSheet`, and lands a fresh `draft` row (we
// never mutate persisted bytes in place).

import { schema } from "../../db/index.js";
import type { ImageRef } from "../../providers/openai/index.js";
import type { SkillContext, SkillResult } from "../types.js";
import { persistSheet } from "../persist.js";
import type { CriticIssue } from "./types.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;

export interface LocalizedRegenInput {
  /** The existing product sheet to edit (its public URL). */
  existingSheetRef: ImageRef;
  /** Carried onto the new row (the product itself is unchanged). */
  views: ProductReferenceSheet["views"];
  /** The localized defects to fix; only cell-scoped issues are actioned. */
  issues: CriticIssue[];
}

/** Human cell labels matching the 2×2 layout the Product Sheet Builder draws. */
const CELL_LABEL: Record<string, string> = {
  front: "top-left FRONT",
  threeQuarter: "top-right THREE-QUARTER",
  side: "bottom-left SIDE (profile)",
  rear: "bottom-right REAR",
};

function buildLocalizedFixPrompt(issues: CriticIssue[]): string {
  const fixes = issues
    .filter((i) => i.region && CELL_LABEL[i.region])
    .map((i) => {
      const fix = i.fixHint ? ` ${i.fixHint}` : "";
      return `- ${CELL_LABEL[i.region as string]} cell: ${i.problem}.${fix}`;
    });

  return [
    "The attached image is an existing 2×2 product reference sheet: four views",
    "of ONE product on a plain seamless studio backdrop.",
    "",
    "Redraw ONLY the cell(s) listed below to fix the noted problems. Keep every",
    "OTHER cell pixel-identical — same product, colors, materials, finish,",
    "proportions, framing, scale, backdrop, and lighting. Preserve the exact",
    "2×2 layout and cell positions.",
    "",
    "IMAGES ONLY: do not bake in any text, labels, captions, view names,",
    "numbers, arrows, callouts, or watermarks (text physically printed on the",
    "product is fine).",
    "",
    "Cells to fix:",
    ...fixes,
  ].join("\n");
}

export async function regenerateProductViewsLocalized(
  ctx: SkillContext,
  input: LocalizedRegenInput,
): Promise<SkillResult<ProductReferenceSheet>> {
  const imagePrompt = buildLocalizedFixPrompt(input.issues);

  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: imagePrompt,
    refs: [input.existingSheetRef],
  });

  const { assetId, assetUrl, artifact } = await persistSheet({
    runId: ctx.runId,
    kind: "product_sheet",
    bytes,
    mime,
    artifactInsert: async (tx, newAssetId) => {
      const [row] = await tx
        .insert(schema.productReferenceSheets)
        .values({
          runId: ctx.runId,
          assetId: newAssetId,
          views: input.views,
          promptUsed: imagePrompt,
          status: "draft",
        })
        .returning();
      return row as ProductReferenceSheet;
    },
  });

  return { assetId, assetUrl, artifact, promptUsed: imagePrompt };
}
