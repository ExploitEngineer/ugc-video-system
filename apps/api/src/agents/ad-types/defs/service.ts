// ── Service Ad type — the DEFAULT for a bare prompt with no uploads. ─────────
// A scripted, multi-scene live-action skit that sells a SERVICE or software.
// No product/person upload: the `creative_brief` (creative director) step plans
// the synthesized cast + scenes BEFORE the storyboard (a distinct service path
// that skips product_sheet/person_sheet). NET-NEW type; TYPE-driven seams are
// authored in the skill, LOOK-driven seams defer to cinematic_polished.
//
// Companion skill doc (kept 1:1 by defs-skills-sync.test.ts):
//   apps/api/src/agents/ad-types/skills/service.skill.md

import type { AdTypeDef } from "../types.js";
import { buildFragments } from "../skill-loader.js";

export const service: AdTypeDef = {
  id: "service",
  displayName: "Service Ad",
  description:
    "A short, scripted narrative/skit ad for a SERVICE or software (SaaS, agency, local service, coaching) with NO product or person to show — synthesized characters act out a relatable problem and the service resolving it. The default when nothing is uploaded; the creative-director step plans the cast + scenes dynamically from the prompt.",
  whenToUse: "consideration|conversion",
  assetPolicy: {
    product: "optional",
    person: "optional",
    rationale:
      "Service ads upload neither a product nor a person; the cast is synthesized from the creative brief and the story carries the ad.",
  },
  lookFamily: "cinematic_polished",
  defaultHooks: ["problem-solution", "striking-visual"],
  allowedHooks: [
    "problem-solution",
    "striking-visual",
    "pattern-interrupt",
    "curiosity-gap",
    "relatable-scenario",
    "confession",
    "before-after",
  ],
  fragments: buildFragments("service", "cinematic_polished"),
};
