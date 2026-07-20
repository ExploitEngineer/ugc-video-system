// Pull ONE entry out of a zip on disk, by random access.
//
// WHY NOT `unzipSync`. A Collect Files archive is 250-500MB and `fflate`'s
// synchronous API needs the whole thing resident. We want exactly one member of
// it — the `.aep` — which is typically 15MB. Reading the End of Central
// Directory, walking the central directory, and inflating the single matching
// entry touches a few kilobytes plus that member.
//
// WHY NOT `fflate`'s streaming `Unzip`. After Effects writes its archives with
// data descriptors (general-purpose bit 3): the LOCAL header of every entry
// carries `compressedSize = 0`, and the real length only appears after the data.
// A streaming reader cannot size the entry up front. The central directory
// always has the true lengths, so that is what we read.
//
// zip64 is detected and refused rather than mis-parsed. Nothing we accept comes
// close to the 4GB / 65535-entry thresholds that require it.

import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

import { createLogger } from "./log.js";

const log = createLogger("zip-entry");

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** EOCD is 22 bytes plus a comment of at most 65535. */
const EOCD_MAX_SEARCH = 22 + 0xffff;

/** A zip64 sentinel in any 32-bit size/offset field. */
const U32_MAX = 0xffffffff;

/** Refuse to allocate more than this for a single entry. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  bytes: Buffer;
}

/**
 * Return the first entry whose name satisfies `match`, or `null` when the
 * archive holds none, is zip64, is corrupt, or the entry is implausibly large.
 *
 * Best-effort by design: the caller falls back to a coarser code path rather
 * than failing an upload over a project file it could not introspect.
 */
export async function readZipEntry(
  path: string,
  match: (name: string) => boolean,
): Promise<ZipEntry | null> {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    if (size < 22) return null;

    const cd = await readCentralDirectory(fh, size);
    if (!cd) return null;

    for (const entry of iterateCentralDirectory(cd.buf)) {
      if (!match(entry.name)) continue;

      if (
        entry.compressedSize === U32_MAX ||
        entry.uncompressedSize === U32_MAX ||
        entry.localOffset === U32_MAX
      ) {
        log.warn("zip64 entry, skipping", { path, name: entry.name });
        return null;
      }
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        log.warn("entry too large to parse", {
          name: entry.name,
          size: entry.uncompressedSize,
        });
        return null;
      }
      if (entry.method !== 0 && entry.method !== 8) {
        log.warn("unsupported compression method", {
          name: entry.name,
          method: entry.method,
        });
        return null;
      }

      // The LOCAL header, not the central one, sizes the variable-length fields
      // that sit between it and the entry's data. The two routinely disagree.
      const local = Buffer.allocUnsafe(30);
      await fh.read(local, 0, 30, entry.localOffset);
      if (local.readUInt32LE(0) !== LOCAL_SIG) {
        log.warn("bad local header", { name: entry.name });
        return null;
      }
      const dataStart =
        entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

      const raw = Buffer.allocUnsafe(entry.compressedSize);
      const { bytesRead } = await fh.read(raw, 0, entry.compressedSize, dataStart);
      if (bytesRead !== entry.compressedSize) {
        log.warn("short read", { name: entry.name, bytesRead });
        return null;
      }

      const bytes = entry.method === 0 ? raw : inflateRawSync(raw);
      return { name: entry.name, bytes };
    }
    return null;
  } catch (err) {
    log.warn("zip read failed (non-fatal)", {
      path,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await fh.close();
  }
}

interface CentralDirectory {
  buf: Buffer;
}

async function readCentralDirectory(
  fh: Awaited<ReturnType<typeof open>>,
  size: number,
): Promise<CentralDirectory | null> {
  const tailLen = Math.min(size, EOCD_MAX_SEARCH);
  const tail = Buffer.allocUnsafe(tailLen);
  await fh.read(tail, 0, tailLen, size - tailLen);

  // Scan backwards: the signature may also appear inside a trailing comment,
  // and the LAST valid one is the real record.
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const entries = tail.readUInt16LE(eocd + 10);
  if (cdSize === U32_MAX || cdOffset === U32_MAX || entries === 0xffff) {
    log.warn("zip64 archive, not parsing");
    return null;
  }
  if (cdOffset + cdSize > size) return null;

  const buf = Buffer.allocUnsafe(cdSize);
  await fh.read(buf, 0, cdSize, cdOffset);
  return { buf };
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function* iterateCentralDirectory(buf: Buffer): Generator<CentralEntry> {
  let p = 0;
  while (p + 46 <= buf.length) {
    if (buf.readUInt32LE(p) !== CD_SIG) return;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    // Bit 11 of the general-purpose flags promises UTF-8. Everything else is
    // nominally CP437, whose ASCII range — all we match on — is identical.
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    yield {
      name,
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      uncompressedSize: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
}
