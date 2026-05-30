// Image Generation Agent (GPT Image 2) — exposes its three skills.
// Each skill is `(ctx: SkillContext, input) => Promise<SkillResult<…>>`.

import { generatePersonImage } from "./person-image/index.js";
import { productSheetBuilder } from "./product-sheet/index.js";
import { storyboardGenerator } from "./storyboard/index.js";

export const imageAgent = {
  productSheetBuilder,
  generatePersonImage,
  storyboardGenerator,
};

export type ImageAgent = typeof imageAgent;

export { productSheetBuilder, generatePersonImage, storyboardGenerator };
export type { ProductSheetInput } from "./product-sheet/index.js";
export type { PersonImageInput } from "./person-image/index.js";
export type { StoryboardInput } from "./storyboard/index.js";
