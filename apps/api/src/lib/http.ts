// Resilient HTTP fetch with retry/backoff for transient failures.
//
// Raw `fetch()` throws an opaque "fetch failed" on any network blip (DNS,
// socket reset, connection drop) and returns 429/5xx on overload. Under the 60s
// pipeline's parallel fan-outs many requests hit the same hosts (Supabase
// Storage, providers) at once, so a single transient drop must NOT fail the
// caller — it retries with capped exponential backoff + jitter instead. This is
// the network-layer robustness the pipeline relies on (no timeouts/fallbacks).

import { createLogger } from "./log.js";

const log = createLogger("http");

/** HTTP statuses worth retrying — overload + transient gateway/server errors. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchRetryOptions {
  /** Total attempts (incl. the first). Default 4. */
  attempts?: number;
  /** Label for logs (e.g. "ref-image", "segment-download"). */
  label?: string;
  /** Base backoff in ms (capped-exponential: base·2^n, max 12s). Default 600. */
  baseDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch` with retry on network errors and retryable HTTP statuses. Resolves to
 * the `Response` (which may still be a non-retryable 4xx — callers check
 * `res.ok`). Throws only after exhausting attempts on a transient failure.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const base = opts.baseDelayMs ?? 600;
  const label = opts.label ?? "fetch";
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRYABLE_STATUS.has(res.status) || attempt === attempts) return res;
      lastErr = new Error(`HTTP ${res.status}`);
      log.warn("retryable status", { label, attempt, status: res.status });
    } catch (err) {
      lastErr = err;
      const cause = (err as { cause?: { code?: string; message?: string } })
        .cause;
      log.warn("fetch error", {
        label,
        attempt,
        err: cause?.code ?? cause?.message ?? (err as Error).message,
      });
      if (attempt === attempts) break;
    }
    // Capped exponential backoff + jitter, so parallel fan-out retries don't
    // thunder in lockstep against the same host.
    await sleep(
      Math.min(base * 2 ** (attempt - 1), 12_000) +
        Math.floor(Math.random() * 400),
    );
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after ${attempts} attempts`);
}
