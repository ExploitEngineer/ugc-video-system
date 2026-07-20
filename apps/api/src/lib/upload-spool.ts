// Spool a request body to a temp file without ever holding it in the heap.
//
// A template is an After Effects "Collect Files" archive: hundreds of megabytes
// of footage. Buffering one costs a copy per stage (multipart parse, then
// `arrayBuffer()`, then the outbound PUT body), and a retried upload re-sends
// the same buffer, so the process peaks at several times the file size and a
// modest container dies. Streaming to disk keeps the heap flat, and the sha256
// the library dedupes on falls out of the same pass for free.
//
// The caller OWNS the returned file and must `rm` it — see the `finally` in
// routes/admin-templates.ts.

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { formatBytes } from "@ugc/shared";

import { payloadTooLarge } from "./errors.js";
import { createLogger } from "./log.js";

const log = createLogger("upload-spool");

export interface SpooledUpload {
  /** Absolute path to the temp file. The caller must delete it. */
  path: string;
  /** Bytes actually received, counted as they arrived. */
  size: number;
  /** Lowercase hex sha256 of those bytes. */
  sha256: string;
  /** Remove the temp file (and its directory). Safe to call twice. */
  cleanup: () => Promise<void>;
}

export interface SpoolOptions {
  /** Hard ceiling. The stream is torn down the moment it is crossed. */
  maxBytes: number;
  /** Extension for the temp file, e.g. `.zip`. Cosmetic, aids debugging. */
  suffix?: string;
  /** What to call the thing in the 413 message, e.g. "Template". */
  label?: string;
}

/**
 * Write `body` to a temp file, counting and hashing as it flows.
 *
 * Throws `payloadTooLarge` as soon as `maxBytes` is exceeded, rather than after
 * receiving the whole body: an over-sized upload costs us only the bytes that
 * had already arrived, and the partial file is removed before we throw.
 */
export async function spoolToTempFile(
  body: ReadableStream<Uint8Array>,
  opts: SpoolOptions,
): Promise<SpooledUpload> {
  const { maxBytes, suffix = "", label = "Upload" } = opts;

  const dir = await mkdtemp(join(tmpdir(), "ugc-upload-"));
  const path = join(dir, `body${suffix}`);
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };

  const hash = createHash("sha256");
  let size = 0;
  let overflow = false;

  // A generator, not a Transform: `pipeline` propagates a throw from here by
  // destroying every stream in the chain, including the write to disk.
  async function* meter(source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > maxBytes) {
        overflow = true;
        throw payloadTooLarge(tooLarge(label, maxBytes));
      }
      hash.update(chunk);
      yield chunk;
    }
  }

  try {
    // The web `ReadableStream` Hono hands us and the one `node:stream/web`
    // declares are the same object with two type declarations.
    const source = Readable.fromWeb(body as NodeReadableStream<Uint8Array>);
    await pipeline(source, meter, createWriteStream(path));
  } catch (err) {
    await cleanup();
    // `pipeline` may surface the write side's ERR_STREAM_PREMATURE_CLOSE rather
    // than our own error once the chain is torn down, so trust the flag.
    if (overflow) throw payloadTooLarge(tooLarge(label, maxBytes));
    throw err;
  }

  log.info("spooled", { size, path });
  return { path, size, sha256: hash.digest("hex"), cleanup };
}

/** The admin has to act on this, so name the limit rather than just refusing. */
const tooLarge = (label: string, maxBytes: number): string =>
  `${label} exceeds the ${formatBytes(maxBytes)} limit.`;
