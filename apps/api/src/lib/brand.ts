// Brand guidelines formatting for injection into the generation prompts.
//
// 5a: the user-typed `brandText` (tone, palette-as-words, do/don'ts).
// 5b (later): a structured `brandGuidelines` kit extracted from an uploaded
// brand file is appended as pretty JSON (the ai-ad-gen pattern).

/** True when any brand guidance is present. */
export function hasBrand(brandText?: string | null): boolean {
  return Boolean(brandText?.trim());
}

/**
 * The injectable brand block — a short directive + the guidance, or "" when none.
 * Spliced into the creative brief, storyboard and video prompts so the output
 * follows the brand's palette, tone, wording and do/don'ts.
 */
export function formatBrand(brandText?: string | null): string {
  const text = (brandText ?? "").trim();
  if (!text) return "";
  return `BRAND GUIDELINES — follow these throughout (palette, tone, wording, do/don'ts): ${text}`;
}
