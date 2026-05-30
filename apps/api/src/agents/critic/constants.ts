// Critic tuning knobs, isolated so F7 / cost reviews can tune them in one place.
//
// SPEC §8 lists the regeneration retry cap as an open question. Decision locked
// for F5: regeneration happens ONLY when an inspection finds an issue, and then
// at most ONCE. A passing first inspection regenerates nothing.

/** Max regenerations per inspection step before signalling run failure. */
export const CRITIC_RETRY_CAP = 1;
