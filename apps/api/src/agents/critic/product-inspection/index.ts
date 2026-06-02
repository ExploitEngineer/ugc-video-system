// Product Sheet Inspection — Critic Agent skill.
//
// `inspectProductSheet` is one vision pass → verdict (used by the engine and
// for unit testing). `inspectAndRemediateProductSheet` wires it into the
// retry-cap engine: on issue it regenerates ONCE — localized when the defects
// are cell-scoped, otherwise a full rebuild via the F4 Product Sheet Builder.

import { schema } from "../../../db/index.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import { imageAgent } from "../../image/index.js";
import { parseJsonObject } from "../../json.js";
import type { SkillContext } from "../../types.js";
import { regenerateProductViewsLocalized } from "../localized.js";
import {
  inspectAndRemediate,
  type SheetRef,
  toSheetRef,
} from "../remediate.js";
import {
  type CriticVerdict,
  type InspectionVerdict,
  inspectionVerdictSchema,
} from "../types.js";
import { buildProductInspectionPrompt } from "./prompt.js";

type ProductReferenceSheet = typeof schema.productReferenceSheets.$inferSelect;

export interface ProductInspectionInput {
  /** The product sheet to inspect. */
  sheetRef: ImageRef;
  /** View notes from the artifact row (metadata hint for the rubric). */
  views: ProductReferenceSheet["views"];
  userPrompt: string;
}

/** Single vision inspection → verdict. No side effects. */
export async function inspectProductSheet(
  ctx: SkillContext,
  input: ProductInspectionInput,
): Promise<InspectionVerdict> {
  const reply = await ctx.openai.chat(
    buildProductInspectionPrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      views: input.views,
      sheetRef: input.sheetRef,
    }),
  );
  return parseJsonObject<InspectionVerdict>(reply, inspectionVerdictSchema);
}

export interface ProductRemediateInput {
  /** The product sheet the F4 Product Sheet Builder already produced. */
  initial: SheetRef;
  /** View notes carried into inspection + any localized regen. */
  views: ProductReferenceSheet["views"];
  userPrompt: string;
  /** The original product upload — needed to re-invoke the builder for full regen. */
  productUpload: ImageRef;
}

/** Inspect, and on issue regenerate once (localized or full), bounded by the cap. */
export async function inspectAndRemediateProductSheet(
  ctx: SkillContext,
  input: ProductRemediateInput,
): Promise<CriticVerdict> {
  return inspectAndRemediate(ctx, {
    step: "product_inspection",
    table: schema.productReferenceSheets,
    initial: input.initial,
    inspect: (sheetUrl) =>
      inspectProductSheet(ctx, {
        sheetRef: { source: sheetUrl, mime: "image/png" },
        views: input.views,
        userPrompt: input.userPrompt,
      }),
    regenFull: async (critique) =>
      toSheetRef(
        await imageAgent.productSheetBuilder(ctx, {
          productUpload: input.productUpload,
          userPrompt: input.userPrompt,
          critique,
        }),
      ),
    regenLocalized: async (issues, current) =>
      toSheetRef(
        await regenerateProductViewsLocalized(ctx, {
          existingSheetRef: { source: current.assetUrl, mime: "image/png" },
          views: input.views,
          issues,
        }),
      ),
  });
}
