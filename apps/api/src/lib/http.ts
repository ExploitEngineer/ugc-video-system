// Resilient HTTP fetch with retry/backoff for transient failures.
//
// Raw `fetch()` throws an opaque "fetch failed" on any network blip (DNS,
// socket reset, connection drop) and returns 429/5xx on overload. Under the 60s
// pipeline's parallel fan-outs many requests hit the same hosts (Supabase
// Storage, providers) at once, so a single transient drop must NOT fail the
// caller — it retries with capped exponential backoff + jitter instead. This is
// the network-layer robustness the pipeline relies on (no timeouts/fallbacks).

import { createReadStream } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { createLogger } from "./log.js";

const log = createLogger("http");

/** HTTP statuses worth retrying — overload + transient gateway/server errors. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Transient network-layer failure codes — the connection failed or dropped, so
 * the request either never landed or was cut off. `fetch` wraps these in a
 * TypeError whose `.cause.code` carries the real code (undici), or a plain error
 * exposes `.code` directly. Includes DNS temporary failures (`EAI_AGAIN`), which
 * a flaky resolver throws while a long provider poll is in flight.
 *
 * Use for IDEMPOTENT retries (a poll GET, a download): re-issuing is always safe.
 * A NON-idempotent POST needs the narrower connect-only check at its own boundary.
 */
const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** True when `err` is a transient network/DNS failure (see `NETWORK_ERROR_CODES`). */
export function isTransientNetworkError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" && NETWORK_ERROR_CODES.has(code);
}

/**
 * Connection-ESTABLISHMENT failure codes: the socket never opened, so the request
 * never reached the server. Deliberately EXCLUDES mid-flight drops (`ECONNRESET` /
 * `UND_ERR_SOCKET`) — those may have landed, so a NON-idempotent POST/DELETE must
 * surface rather than risk a duplicate. Safe to retry for ANY method.
 */
const CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * True only when `err` is a `fetch` failure whose connection never established.
 * Safe to retry even a non-idempotent request — nothing reached the server.
 */
export function isTransientConnectError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  const code = e?.cause?.code ?? e?.code;
  return typeof code === "string" && CONNECT_ERROR_CODES.has(code);
}

export interface FetchRetryOptions {
  /** Total attempts (incl. the first). Default 4. */
  attempts?: number;
  /** Label for logs (e.g. "ref-image", "segment-download"). */
  label?: string;
  /** Base backoff in ms (capped-exponential: base·2^n, max 12s). Default 600. */
  baseDelayMs?: number;
  /**
   * Per-attempt timeout in ms — aborts a socket that connects but then stalls
   * mid-response (undici has NO default response timeout, so without this a
   * hung provider freezes the caller forever). Default 60s. A caller-supplied
   * `init.signal` takes precedence.
   */
  timeoutMs?: number;
  /**
   * Retry a THROWN network error (connection reset, DNS, or the timeout abort).
   * Default true. Set false for a NON-idempotent request (e.g. a task-submit
   * POST): a socket that drops after the request reached the server would
   * otherwise be retried and duplicate the action. Retryable HTTP *statuses*
   * (429/5xx) are still retried regardless — the server told us to.
   */
  retryOnNetworkError?: boolean;
  /**
   * Retry a THROWN error ONLY when the connection never established
   * (`isTransientConnectError`: `EAI_AGAIN`, `UND_ERR_CONNECT_TIMEOUT`, …). SAFE for
   * a non-idempotent request — nothing reached the server, so nothing was created.
   * Use with `retryOnNetworkError: false` to survive connect blips on a flaky
   * DNS/network without risking a duplicate submit. Default false.
   */
  retryConnectErrors?: boolean;
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
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const retryOnNetworkError = opts.retryOnNetworkError ?? true;
  const retryConnectErrors = opts.retryConnectErrors ?? false;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        // Caller signal wins; otherwise enforce a per-attempt timeout so a
        // stalled response can never hang the worker indefinitely.
        signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      });
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
      // Non-idempotent caller: the request may have reached the server before
      // the socket dropped, so retrying could duplicate it — surface instead.
      // EXCEPTION: a connect-phase failure (the socket never opened) created
      // nothing, so it is safe to retry even a non-idempotent request.
      if (!retryOnNetworkError && !(retryConnectErrors && isTransientConnectError(err))) {
        throw err;
      }
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

export interface PutFileResult {
  status: number;
  ok: boolean;
  body: string;
}

/**
 * PUT a file from disk, streamed, with an explicit `Content-Length`.
 *
 * `fetch` cannot do this job. Its body must be a stream to stay off the heap,
 * and undici then sends `Transfer-Encoding: chunked`, which a presigned S3 PUT
 * rejects; a stream is also consumed by the first attempt, so it cannot be
 * retried. `node:http`'s `request()` lets us set the length up front and open a
 * fresh `createReadStream` per attempt.
 *
 * Retries transient failures with the same capped-exponential backoff as
 * `fetchWithRetry`. Safe because the target is one idempotent object: re-sending
 * after a dropped socket overwrites it rather than duplicating anything.
 */
export async function putFile(
  url: string,
  file: { path: string; size: number; contentType: string },
  opts: FetchRetryOptions = {},
): Promise<PutFileResult> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const base = opts.baseDelayMs ?? 600;
  const label = opts.label ?? "putFile";
  const timeoutMs = opts.timeoutMs ?? 300_000;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await putFileOnce(url, file, timeoutMs);
      if (!RETRYABLE_STATUS.has(res.status) || attempt === attempts) return res;
      lastErr = new Error(`HTTP ${res.status}`);
      log.warn("retryable status", { label, attempt, status: res.status });
    } catch (err) {
      lastErr = err;
      log.warn("put error", {
        label,
        attempt,
        err: err instanceof Error ? err.message : String(err),
      });
      if (attempt === attempts) break;
    }
    await sleep(
      Math.min(base * 2 ** (attempt - 1), 12_000) +
        Math.floor(Math.random() * 400),
    );
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`${label} failed after ${attempts} attempts`);
}

function putFileOnce(
  url: string,
  file: { path: string; size: number; contentType: string },
  timeoutMs: number,
): Promise<PutFileResult> {
  const target = new URL(url);
  const request = target.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise<PutFileResult>((resolve, reject) => {
    const req = request(
      target,
      {
        method: "PUT",
        headers: {
          "Content-Type": file.contentType,
          "Content-Length": file.size,
        },
        timeout: timeoutMs,
      },
      (res) => {
        // Read the body: a 4xx from the store explains itself, and an unread
        // response keeps the socket from being released.
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          if (chunks.length < 32) chunks.push(c);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 2000),
          });
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => req.destroy(new Error("PUT timed out")));
    req.on("error", reject);

    const body = createReadStream(file.path);
    body.on("error", (err) => {
      req.destroy(err);
      reject(err);
    });
    body.pipe(req);
  });
}
