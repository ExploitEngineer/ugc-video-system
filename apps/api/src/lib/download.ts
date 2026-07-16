// Resilient MEDIA download — wall-clock stall watchdog, suspend-aware, on a
// connection that is never shared with a previous attempt.
//
// The pipeline's big files (a 100MB+ AE render, Seedance clips, storyboard
// masters) must NOT be governed by a total-duration timeout: a healthy large
// download legitimately runs past any fixed wall-clock cap, so `AbortSignal.
// timeout(60s)` aborts a perfectly good transfer (this discarded a completed,
// paid render). Nor should they be buffered into the heap via `arrayBuffer()`
// — with the parallel segment fan-out that peaks at several × the file size.
//
// So: stream the body straight to disk and bound it by a STALL watchdog — a
// deadline reset on every received chunk that fires only when the socket goes
// SILENT for `idleTimeoutMs`. A truly hung connection still dies fast; a slow-
// but-progressing one is left alone. A generous absolute ceiling (`maxMs`) is a
// last-resort backstop. Bounded API/JSON calls keep their total-duration caps
// (see `fetchWithRetry`) — this is for media only.
//
// Two hard-won properties, both learned from one suspended laptop that threw
// away a finished 36s master (run 2b6ffa00, template_render):
//
//  1. The watchdog runs on the WALL CLOCK, not on a `setTimeout`. `setTimeout`
//     is monotonic, and CLOCK_MONOTONIC does not advance while a machine is
//     suspended — so a download whose socket died at suspend kept "waiting" for
//     its idle budget in AWAKE seconds only, burning 2 more minutes after
//     resume before it noticed. A suspend (detected as a large jump between
//     ticks) is treated as a dead connection immediately, and does not count
//     against the retry budget: it is our machine that went away, not the host.
//
//  2. Every attempt gets a FRESH `Agent`, so a retry can never inherit the
//     poisoned connection pool of the one before it. undici keep-alives can be
//     held for minutes (the server's `keep-alive` hint, up to
//     `keepAliveMaxTimeout`), and its expiry timers are monotonic too — so
//     after a resume the pool still offers sockets it believes are fresh and
//     are in fact long dead. A request handed such a socket is ESTABLISHED and
//     silent: it never errors, it just never answers, and every retry picks the
//     same corpse. That is exactly how three attempts in a row reported
//     `received=0`, while a plain curl to the same URL finished in 14s.
//
// `streamDownload` writes to a path (ffmpeg reads files); `downloadToBuffer`
// streams to a temp file then returns the bytes, for callers that need them in
// memory (persist/transcode) without ever hanging on a stalled socket.

import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { Agent, fetch as undiciFetch } from "undici";

import { env } from "../config/index.js";
import { createLogger } from "./log.js";

const log = createLogger("download");

/** HTTP statuses worth retrying — overload + transient gateway/server errors. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * A gap between watchdog ticks longer than this means the PROCESS lost time it
 * cannot account for — the machine suspended (a laptop lid, `systemctl
 * suspend`), or the clock stepped. A blocked event loop cannot plausibly reach
 * this; a suspend clears it by minutes.
 */
const SUSPEND_JUMP_MS = 30_000;

/**
 * Attempts aborted because WE went away (suspend) rather than because the host
 * went silent don't consume the retry budget — but they are still bounded, so a
 * machine suspending in a loop can't retry forever.
 */
const MAX_SUSPEND_GRACE_ATTEMPTS = 3;

/** Settle time after a resume before retrying — the NIC needs its DHCP lease back. */
const POST_SUSPEND_GRACE_MS = 5_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A response status we should NOT retry (404 expired URL, 403 bad auth, …). */
class NonRetryableDownloadError extends Error {}

/** Aborted because the machine suspended mid-transfer — our fault, so retried for free. */
class SuspendedDownloadError extends Error {}

export interface StreamDownloadOptions {
  /** Log label, e.g. "template-render-download". */
  label?: string;
  /** Abort after this much WALL-CLOCK time with no received bytes. Default env MEDIA_DOWNLOAD_IDLE_TIMEOUT_MS. */
  idleTimeoutMs?: number;
  /** Absolute backstop for the whole transfer. Default env MEDIA_DOWNLOAD_MAX_MS. */
  maxMs?: number;
  /** Whole-download attempts (idempotent GET). Default env MEDIA_DOWNLOAD_ATTEMPTS. */
  attempts?: number;
  /** Extra request headers (e.g. a provider download token). */
  headers?: Record<string, string>;
}

/**
 * One attempt, on its own connection pool. Resolves when the body is fully on
 * disk; throws `SuspendedDownloadError` if the machine slept mid-transfer.
 */
async function attemptDownload(
  url: string,
  dest: string,
  label: string,
  idleMs: number,
  maxMs: number,
  headers: Record<string, string> | undefined,
): Promise<void> {
  const controller = new AbortController();
  // A pool of ONE attempt's own making. `keepAliveTimeout` is capped hard so a
  // socket this attempt opens can't be offered to anything else long after the
  // peer has forgotten it, and `destroy()` below closes the pool either way.
  const agent = new Agent({
    connect: { timeout: 15_000 },
    keepAliveTimeout: 10_000,
    keepAliveMaxTimeout: 10_000,
    // Second line of defence behind the wall-clock watchdog. Monotonic (so
    // useless across a suspend), but it catches a plain silent socket even if
    // the watchdog interval is starved.
    headersTimeout: idleMs,
    bodyTimeout: idleMs,
  });

  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastTickAt = startedAt;
  let suspended = false;

  // Poll the wall clock rather than arming a timer: `setTimeout` sleeps through
  // a machine suspend (monotonic), which is precisely the case that must abort
  // FASTEST — the socket did not survive it.
  const checkMs = Math.min(1000, Math.max(50, Math.floor(idleMs / 4)));
  const watchdog = setInterval(() => {
    const now = Date.now();
    const sinceTick = now - lastTickAt;
    lastTickAt = now;

    if (sinceTick > SUSPEND_JUMP_MS) {
      suspended = true;
      log.warn(
        "machine suspended mid-download — the connection did not survive it, retrying on a fresh one",
        { label, asleepMs: sinceTick },
      );
      controller.abort(new SuspendedDownloadError(`suspended for ${sinceTick}ms mid-download`));
      return;
    }
    if (now - lastProgressAt >= idleMs) {
      controller.abort(new Error(`idle ${idleMs}ms with no data`));
      return;
    }
    if (now - startedAt >= maxMs) {
      controller.abort(new Error(`exceeded ${maxMs}ms ceiling`));
    }
  }, checkMs);
  // Never hold the process open for a watchdog alone.
  watchdog.unref?.();

  let received = 0;
  // A generator (not a raw `data` listener, which would race `pipeline` and
  // drop bytes): resets the stall deadline as each chunk flows through to disk.
  async function* progress(source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      received += chunk.length;
      lastProgressAt = Date.now();
      yield chunk;
    }
  }

  try {
    const res = await undiciFetch(url, {
      signal: controller.signal,
      dispatcher: agent,
      ...(headers ? { headers } : {}),
    });
    if (!res.ok) {
      if (!RETRYABLE_STATUS.has(res.status)) {
        throw new NonRetryableDownloadError(
          `download failed: HTTP ${res.status} (${label})`,
        );
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.body) throw new Error(`download failed: no body (${label})`);
    const source = Readable.fromWeb(res.body as NodeReadableStream<Uint8Array>);
    await pipeline(source, progress, createWriteStream(dest));
  } catch (err) {
    // When WE aborted (suspend / idle stall / absolute ceiling), surface our own
    // reason rather than the opaque generic AbortError — a clearer signal for
    // logs, the caller, and the user-facing error.
    const actual =
      controller.signal.aborted && controller.signal.reason instanceof Error
        ? controller.signal.reason
        : err;
    if (!(actual instanceof NonRetryableDownloadError)) {
      log.warn("download attempt failed", {
        label,
        received,
        suspended,
        err: actual instanceof Error ? actual.message : String(actual),
      });
    }
    throw actual;
  } finally {
    clearInterval(watchdog);
    // Closes every socket this attempt opened, so the NEXT attempt cannot be
    // handed one of them.
    await agent.destroy().catch(() => {});
  }
}

/**
 * Stream `url` to `dest`, bounded by a wall-clock idle timeout. Retries the whole
 * download on a stall/network/5xx (bounded, on a fresh connection each time);
 * fails fast on a 4xx. The partial file is removed before each retry and before
 * the final throw.
 */
export async function streamDownload(
  url: string,
  dest: string,
  opts: StreamDownloadOptions = {},
): Promise<void> {
  const label = opts.label ?? "download";
  const idleMs = opts.idleTimeoutMs ?? env.MEDIA_DOWNLOAD_IDLE_TIMEOUT_MS;
  const maxMs = opts.maxMs ?? env.MEDIA_DOWNLOAD_MAX_MS;
  const attempts = Math.max(1, opts.attempts ?? env.MEDIA_DOWNLOAD_ATTEMPTS);

  let lastErr: unknown;
  let suspendGrace = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await attemptDownload(url, dest, label, idleMs, maxMs, opts.headers);
      return;
    } catch (err) {
      await rm(dest, { force: true }).catch(() => {});
      lastErr = err;
      if (err instanceof NonRetryableDownloadError) {
        log.warn("download failed (non-retryable)", { label, err: err.message });
        throw err;
      }
      // A suspend is OUR outage, not the host's: give the attempt back (bounded)
      // so a laptop that slept through a run resumes it instead of failing it.
      if (err instanceof SuspendedDownloadError && suspendGrace < MAX_SUSPEND_GRACE_ATTEMPTS) {
        suspendGrace++;
        attempt--;
        await sleep(POST_SUSPEND_GRACE_MS);
        continue;
      }
      if (attempt < attempts) {
        // Seconds, not milliseconds: the stall this backs off from is usually a
        // network transition (a resume's DHCP lease, a reconnect), which takes
        // whole seconds to settle. The old 800ms first retry just re-hit it.
        await sleep(Math.min(2000 * 2 ** (attempt - 1), 30_000));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * The size of a remote file (bytes) via a HEAD request's `Content-Length`, or
 * null when the host doesn't report it. Lets a caller decide whether a file is
 * too big to re-host BEFORE downloading it — e.g. skip a Nexrender render that
 * exceeds the Storage bucket cap. Best-effort: any error resolves to null.
 */
export async function remoteContentLength(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length"));
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

/**
 * Download `url` into memory via a temp file, bounded by the same idle watchdog
 * — for callers that need the bytes (persist / transcode). Streams to disk so a
 * stalled socket can't hang the run, then reads the completed file once.
 */
export async function downloadToBuffer(
  url: string,
  opts: StreamDownloadOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const dir = await mkdtemp(join(tmpdir(), "ugc-dl-"));
  const dest = join(dir, "download.bin");
  try {
    await streamDownload(url, dest, opts);
    // `new Uint8Array(buffer)` copies onto a fresh ArrayBuffer — a clean, exact
    // view every consumer (Blob, persist) accepts without a cast.
    return new Uint8Array(await readFile(dest)) as Uint8Array<ArrayBuffer>;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
