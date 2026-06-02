// Shared plumbing for agent skills.
//
// A skill = a prompt module + a function `(ctx, input) => SkillResult`.
// The OpenAI provider is injected on `ctx` (dependency injection) so skills
// never import the adapter directly and stay unit-testable with a fake.

import type { AdType } from "@ugc/shared";
import type { OpenAIProvider } from "../providers/openai/index.js";
import type { VideoProvider } from "../providers/video.js";

/** Everything a skill needs that isn't skill-specific. Built once per step. */
export interface SkillContext {
  runId: string;
  /** Opaque in F4 (caller supplies it); F7's Creative Direction Agent sets it. */
  adStyle: string;
  /** Ad treatment (ugc | inspirational), inferred from the prompt. */
  adType: AdType;
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
