// Shared plumbing for agent skills.
//
// A skill = a prompt module + a function `(ctx, input) => SkillResult`.
// The OpenAI provider is injected on `ctx` (dependency injection) so skills
// never import the adapter directly and stay unit-testable with a fake.

import type { AdType, AspectRatio } from "@ugc/shared";
import type { OpenAIProvider } from "../providers/openai/index.js";
import type { VideoProvider } from "../providers/video.js";

/** Everything a skill needs that isn't skill-specific. Built once per step. */
export interface SkillContext {
  runId: string;
  /** Opaque in F4 (caller supplies it); F7's Creative Direction Agent sets it. */
  adStyle: string;
  /** Ad treatment (ugc | inspirational), inferred from the prompt. */
  adType: AdType;
  /**
   * Factual product identity anchor (category / materials / colors / markings),
   * planned once via vision over the upload and persisted to `runs.product_brief`.
   * Empty string until the reference phase fills it. Keeps the product from
   * silently drifting into a different item downstream (storyboard, critic).
   */
  productBrief: string;
  /**
   * Product-derived description of the on-camera person (demographics / wardrobe
   * / palette) from `runs.person_brief`. Set when the person is INVENTED from the
   * product; empty when a person photo was uploaded (identity then lives in the
   * image only). Lets the storyboard tailor spoken lines to who is on camera.
   */
  personBrief: string;
  /** User-chosen output shape — sizes the image sheets and the final video. */
  aspectRatio: AspectRatio;
  openai: OpenAIProvider;
  /** Video provider (Seedance 2.0 via BytePlus). Used by the Video Builder. */
  video: VideoProvider;
}

/** Uniform skill output: the persisted asset + the inserted artifact row. */
export interface SkillResult<TArtifact> {
  assetId: string;
  assetUrl: string;
  artifact: TArtifact;
  promptUsed: string;
}
