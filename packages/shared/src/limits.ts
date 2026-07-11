// Upload ceilings shared by the browser and the API, so the two can never
// disagree about what is accepted.

/**
 * The largest template project we accept.
 *
 * A POLICY number, not a memory ceiling. The API streams the request body
 * straight to a temp file and PUTs it to Nexrender from disk, so its heap does
 * not grow with the upload and this can be raised freely.
 *
 * Real After Effects "Collect Files" archives are big: a single linked
 * Illustrator layer can be 90MB, and 250-500MB projects are ordinary.
 *
 * DECIMAL, not 2^30. `formatBytes` reports decimal units because that is what a
 * file manager shows, and a limit that renders as "1.1 GB" while rejecting a
 * 1.05 GB file is a support ticket.
 */
export const MAX_TEMPLATE_BYTES = 1_000_000_000; // 1.0 GB

/** A hand-supplied preview clip: a short demo video, not a deliverable. */
export const MAX_PREVIEW_BYTES = 50_000_000; // 50.0 MB

/**
 * Human-readable byte count for an error the admin has to act on.
 * Decimal units, because that is what a file manager shows them.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
