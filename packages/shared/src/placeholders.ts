// Bracket-placeholder detection (Fix 8). Users often leave fill-in slots in the
// ad prompt — [SHOCK STAT], [PRODUCT], [PRICE], [URL]. Left unresolved they get
// silently invented (often a fabricated statistic) and burned into the image AND
// the spoken audio. Detect them at create time so the pipeline can record any
// invented value into detector_meta instead of presenting it as fact.

/**
 * Matches an UPPERCASE bracket token: opens with a capital letter, then capitals,
 * digits, spaces or `. _ / -`. Catches [SHOCK STAT], [PRODUCT], [PRICE], [URL],
 * [DISCOUNT_CODE], [WEBSITE.COM] — but not ordinary bracketed lowercase asides.
 */
export const PLACEHOLDER_PATTERN = /\[[A-Z][A-Z0-9 ._/-]*\]/g;

/**
 * Return the unique bracket placeholders found in a prompt, in first-seen order.
 * Empty array when there are none.
 */
export function detectPlaceholders(prompt: string): string[] {
  const matches = prompt.match(PLACEHOLDER_PATTERN);
  if (!matches) return [];
  return [...new Set(matches)];
}
