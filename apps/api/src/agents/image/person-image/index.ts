// Generate Person Image — Image Agent skill.
//
// Two paths, chosen by whether a base image is supplied:
//  - baseRef present → IMAGE-TO-IMAGE edit (`images.edit`): a targeted revise of
//    the prior sheet, or building the sheet from an uploaded person photo. Uses a
//    SHORT imperative instruction so the change/identity actually takes — a
//    verbose from-scratch prompt makes the edit model reproduce the input.
//  - baseRef absent → TEXT-TO-IMAGE: the planning LLM invents a person (or a
//    deliberately different one on a "regenerate" revise) and authors the full
//    sheet prompt + view/personDetails metadata.
// Then persist: storage → assets(person_sheet) → person_reference_sheets.

import { schema } from "../../../db/index.js";
import { latestPersonSheetMeta } from "../../creative-direction/inputs.js";
import { createLogger } from "../../../lib/log.js";
import { parseJsonObject } from "../../json.js";
import type { ImageRef } from "../../../providers/openai/index.js";
import type { RevisionDirective } from "../../creative-direction/plan-revision/index.js";
import type { SkillContext, SkillResult } from "../../types.js";
import { persistSheet } from "../../persist.js";
import {
  buildPersonEditInstruction,
  buildPersonImagePrompt,
  buildPersonSheetFromPhotoInstruction,
  type PersonImagePlan,
} from "./prompt.js";

type PersonReferenceSheet = typeof schema.personReferenceSheets.$inferSelect;

export interface PersonImageInput {
  /** Product-derived brief (demographics/wardrobe/palette) — TEXT, not an image. */
  personBrief: string;
  userPrompt: string;
  /** Broken-down revision directive from a rejected prior person sheet. */
  directive?: RevisionDirective;
  /**
   * Base image for an image-to-image edit: the prior person sheet (targeted
   * revise) or the uploaded person photo (first generation). Absent → invent.
   */
  baseRef?: ImageRef;
}

interface ResolvedPlan {
  imagePrompt: string;
  views: PersonImagePlan["views"] | null;
  personDetails: PersonImagePlan["personDetails"] | null;
}

/**
 * Decide the image prompt + metadata. With a base image we use a short,
 * edit-focused instruction (no planning LLM); without one we let the LLM author
 * the full sheet from the brief.
 */
async function resolvePlan(
  ctx: SkillContext,
  input: PersonImageInput,
): Promise<ResolvedPlan> {
  if (input.baseRef) {
    if (input.directive) {
      // Targeted revise — carry the prior sheet's metadata forward.
      const prior = await latestPersonSheetMeta(ctx.runId);
      return {
        imagePrompt: buildPersonEditInstruction(input.directive),
        views: (prior?.views as PersonImagePlan["views"] | undefined) ?? null,
        personDetails:
          (prior?.personDetails as PersonImagePlan["personDetails"] | undefined) ??
          null,
      };
    }
    // Uploaded person, first generation — identity comes from the photo.
    return {
      imagePrompt: buildPersonSheetFromPhotoInstruction(),
      views: null,
      personDetails: null,
    };
  }

  // No base image — invent (or, with a "regenerate" directive, a different person).
  const reply = await ctx.openai.chat(
    buildPersonImagePrompt({
      adStyle: ctx.adStyle,
      userPrompt: input.userPrompt,
      personBrief: input.personBrief,
      directive: input.directive,
    }),
  );
  const plan = parseJsonObject<PersonImagePlan>(reply);
  return {
    imagePrompt: plan.imagePrompt,
    views: plan.views,
    personDetails: plan.personDetails,
  };
}

export async function generatePersonImage(
  ctx: SkillContext,
  input: PersonImageInput,
): Promise<SkillResult<PersonReferenceSheet>> {
  const log = createLogger("image", { run: ctx.runId, skill: "person_sheet" });
  const mode = input.baseRef
    ? input.directive
      ? "edit"
      : "from_upload"
    : "invent";
  log.info("▶ planning person sheet", { mode, scope: input.directive?.scope });

  const plan = await resolvePlan(ctx, input);

  log.debug("✓ plan ready — generating image", { mode });
  // A base image routes to images.edit (image-to-image); otherwise text-to-image.
  const { bytes, mime } = await ctx.openai.generateImage({
    prompt: plan.imagePrompt,
    refs: input.baseRef ? [input.baseRef] : undefined,
  });
  log.debug("✓ image generated", { bytes: bytes.length, mime });

  const { assetId, assetUrl, artifact } = await persistSheet({
    runId: ctx.runId,
    kind: "person_sheet",
    bytes,
    mime,
    artifactInsert: async (tx, newAssetId) => {
      const [row] = await tx
        .insert(schema.personReferenceSheets)
        .values({
          runId: ctx.runId,
          assetId: newAssetId,
          views: plan.views,
          personDetails: plan.personDetails,
          promptUsed: plan.imagePrompt,
          status: "draft",
        })
        .returning();
      return row as PersonReferenceSheet;
    },
  });

  log.info("✓ person sheet persisted", { assetId, mode });
  return { assetId, assetUrl, artifact, promptUsed: plan.imagePrompt };
}
