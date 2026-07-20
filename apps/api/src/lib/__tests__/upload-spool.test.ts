import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { ApiError } from "../errors.js";
import { spoolToTempFile } from "../upload-spool.js";

/** A web ReadableStream over the given chunks, as Hono hands us. */
function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("spoolToTempFile", () => {
  it("writes the body to disk and hashes it in the same pass", async () => {
    const a = bytes(1000, 1);
    const b = bytes(500, 2);
    const spooled = await spoolToTempFile(streamOf(a, b), {
      maxBytes: 1_000_000,
      suffix: ".zip",
    });

    try {
      expect(spooled.size).toBe(1500);
      expect(spooled.path.endsWith(".zip")).toBe(true);

      const onDisk = await readFile(spooled.path);
      expect(onDisk.length).toBe(1500);
      // The hash the library dedupes on must be the hash of the whole body,
      // not of any single chunk.
      expect(spooled.sha256).toBe(sha(new Uint8Array([...a, ...b])));
    } finally {
      await spooled.cleanup();
    }
  });

  it("cleanup removes the file AND its directory, and is safe to repeat", async () => {
    const spooled = await spoolToTempFile(streamOf(bytes(10)), {
      maxBytes: 100,
    });
    const dir = dirname(spooled.path);

    await spooled.cleanup();
    await expect(stat(spooled.path)).rejects.toThrow();
    await expect(stat(dir)).rejects.toThrow();
    await expect(spooled.cleanup()).resolves.toBeUndefined();
  });

  it("rejects an over-sized body with 413 and leaves nothing behind", async () => {
    // Two chunks: the ceiling is crossed by the SECOND, so the stream is torn
    // down mid-flight rather than after the whole body has been received.
    let path: string | undefined;
    const err = await spoolToTempFile(streamOf(bytes(60), bytes(60)), {
      maxBytes: 100,
      label: "Template",
    })
      .then((s) => {
        path = s.path;
        return null;
      })
      .catch((e: unknown) => e);

    expect(path).toBeUndefined();
    expect(err).toBeInstanceOf(ApiError);
    const api = err as ApiError;
    expect(api.status).toBe(413);
    expect(api.code).toBe("PAYLOAD_TOO_LARGE");
    // The admin has to act on this, so it must name the limit.
    expect(api.message).toContain("Template");
    expect(api.message).toMatch(/limit/i);
  });

  it("accepts a body exactly at the ceiling", async () => {
    const spooled = await spoolToTempFile(streamOf(bytes(100)), {
      maxBytes: 100,
    });
    try {
      expect(spooled.size).toBe(100);
    } finally {
      await spooled.cleanup();
    }
  });

  it("handles an empty body without inventing bytes", async () => {
    const spooled = await spoolToTempFile(streamOf(), { maxBytes: 100 });
    try {
      expect(spooled.size).toBe(0);
      expect(spooled.sha256).toBe(createHash("sha256").digest("hex"));
    } finally {
      await spooled.cleanup();
    }
  });
});
