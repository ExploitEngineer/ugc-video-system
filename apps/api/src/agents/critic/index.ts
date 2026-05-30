// Critic Agent (OpenAI vision) — exposes its two inspect-and-remediate skills.
// Each is `(ctx: SkillContext, input) => Promise<CriticVerdict>`. Person sheets
// are out of F5 scope; only the product sheet and storyboard are inspected.

import { inspectAndRemediateProductSheet } from "./product-inspection/index.js";
import { inspectAndRemediateStoryboard } from "./storyboard-inspection/index.js";

export const criticAgent = {
  inspectAndRemediateProductSheet,
  inspectAndRemediateStoryboard,
};

export type CriticAgent = typeof criticAgent;

export {
  inspectProductSheet,
  inspectAndRemediateProductSheet,
} from "./product-inspection/index.js";
export {
  inspectStoryboard,
  inspectAndRemediateStoryboard,
} from "./storyboard-inspection/index.js";
export type { ProductRemediateInput } from "./product-inspection/index.js";
export type { StoryboardRemediateInput } from "./storyboard-inspection/index.js";
export type { SheetRef } from "./remediate.js";
export type {
  CriticIssue,
  CriticOutcome,
  CriticVerdict,
  InspectionVerdict,
} from "./types.js";
