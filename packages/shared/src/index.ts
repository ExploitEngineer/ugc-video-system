// Shared types and utilities consumed by both `web` and `api`.

export const APP_NAME = "ugc-video-system";

// Run state-machine enums (Zod schemas + inferred types).
export * from "./enums";

// API DTO schemas (Run / Asset / StepEvent / RunDetail / CreateRunInput).
export * from "./dto";

// Bracket-placeholder detection ([SHOCK STAT], [PRICE], …) for the ad prompt.
export * from "./placeholders";
