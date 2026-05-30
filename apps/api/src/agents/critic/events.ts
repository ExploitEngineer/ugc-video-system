// Back-compat re-export. The implementation moved to the neutral
// `agents/events.ts` (mirroring how `persistSheet` moved to `agents/persist.ts`)
// so non-critic code (video, F7 orchestrator) doesn't import from the critic.

export {
  countRegenEvents,
  writeStepEvent,
  type StepEventStatus,
  type WriteStepEventInput,
} from "../events.js";
