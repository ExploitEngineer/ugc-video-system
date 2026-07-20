import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readZipEntry } from "../zip-entry.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "zip-entry-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const enc = (s: string) => new TextEncoder().encode(s);

/** Write a zip to disk and return its path. */
async function writeZip(
  files: Record<string, Uint8Array>,
  opts?: Parameters<typeof zipSync>[1],
): Promise<string> {
  const path = join(dir, "archive.zip");
  await writeFile(path, zipSync(files, opts));
  return path;
}

describe("readZipEntry", () => {
  it("inflates only the matching entry, ignoring the rest of the archive", async () => {
    const project = enc("RIFX-pretend-project-bytes");
    const path = await writeZip({
      "Collect/Output/render.mp4": new Uint8Array(50_000).fill(9),
      "Collect/Source/Project.aep": project,
      "Collect/Fonts/Inter.ttf": new Uint8Array(20_000).fill(3),
    });

    const entry = await readZipEntry(path, (n) => /\.aep$/i.test(n));
    expect(entry?.name).toBe("Collect/Source/Project.aep");
    expect(Buffer.from(project).equals(entry?.bytes ?? Buffer.alloc(0))).toBe(
      true,
    );
  });

  it("reads a STORED entry (compression method 0) verbatim", async () => {
    // Level 0 stores rather than deflates. Both paths must return identical
    // bytes: an .aep is already poorly compressible, so zip tools pick either.
    const project = enc("stored-not-deflated");
    const path = await writeZip(
      { "a/Project.aep": project },
      { level: 0 },
    );

    const entry = await readZipEntry(path, (n) => n.endsWith(".aep"));
    expect(entry?.bytes.toString("utf8")).toBe("stored-not-deflated");
  });

  it("returns the FIRST match when several entries qualify", async () => {
    const path = await writeZip({
      "a/One.aep": enc("first"),
      "b/Two.aep": enc("second"),
    });
    const entry = await readZipEntry(path, (n) => n.endsWith(".aep"));
    expect(entry?.bytes.toString("utf8")).toBe("first");
  });

  it("lets the caller skip macOS resource forks by name", async () => {
    const path = await writeZip({
      "__MACOSX/._Project.aep": enc("resource fork junk"),
      "Real/Project.aep": enc("the real project"),
    });
    const entry = await readZipEntry(
      path,
      (n) => /\.aep$/i.test(n) && !n.startsWith("__MACOSX/"),
    );
    expect(entry?.name).toBe("Real/Project.aep");
  });

  it("returns null when the archive holds no match", async () => {
    const path = await writeZip({ "notes.txt": enc("nothing to see") });
    expect(await readZipEntry(path, (n) => n.endsWith(".aep"))).toBeNull();
  });

  it("survives a zip comment, which can contain a false EOCD signature", async () => {
    // The End of Central Directory is found by scanning BACKWARDS, because its
    // 4-byte signature may also occur inside a trailing comment.
    const path = await writeZip({ "x/Project.aep": enc("payload") });
    const buf = await import("node:fs/promises").then((fs) =>
      fs.readFile(path),
    );
    const comment = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]);
    // Re-write with a comment: bump the EOCD's comment-length field, append it.
    const withComment = Buffer.concat([buf, comment]);
    withComment.writeUInt16LE(comment.length, withComment.length - comment.length - 2);
    const commented = join(dir, "commented.zip");
    await writeFile(commented, withComment);

    const entry = await readZipEntry(commented, (n) => n.endsWith(".aep"));
    expect(entry?.bytes.toString("utf8")).toBe("payload");
  });

  it("returns null (never throws) for a file that is not a zip at all", async () => {
    const path = join(dir, "garbage.zip");
    await writeFile(path, Buffer.from("this is not a zip archive"));
    expect(await readZipEntry(path, () => true)).toBeNull();
  });

  it("returns null for a truncated archive rather than mis-parsing it", async () => {
    const path = await writeZip({ "x/Project.aep": enc("payload") });
    const buf = await import("node:fs/promises").then((fs) => fs.readFile(path));
    const truncated = join(dir, "truncated.zip");
    await writeFile(truncated, buf.subarray(0, buf.length - 40));
    expect(await readZipEntry(truncated, () => true)).toBeNull();
  });

  it("refuses a zip64 archive instead of reading a bogus offset", async () => {
    // Forge the zip64 sentinel into the EOCD's central-directory offset.
    const path = await writeZip({ "x/Project.aep": enc("payload") });
    const buf = await import("node:fs/promises").then((fs) => fs.readFile(path));
    // EOCD is the last 22 bytes here (no comment); cdOffset lives at +16.
    buf.writeUInt32LE(0xffffffff, buf.length - 22 + 16);
    const forged = join(dir, "zip64.zip");
    await writeFile(forged, buf);
    expect(await readZipEntry(forged, () => true)).toBeNull();
  });
});
