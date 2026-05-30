// Critic tuning knobs, isolated so F7 / cost reviews can tune them in one place.
//
// SPEC §8 lists the regeneration retry cap as an open question. Decision:
// regeneration happens ONLY when an inspection finds an issue, and the budget is
// shared ACROSS the whole run, not per step. A passing inspection regenerates
// nothing. Once the run-level budget is spent, the next rejection fails the run.

/** Max Critic-driven regenerations for the WHOLE run (shared across steps). */
export const MAX_REGEN_PER_RUN = 2;
