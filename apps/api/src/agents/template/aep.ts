// Read the two things Nexrender's introspection cannot tell us, straight out of
// the uploaded After Effects project: a layer's REAL name, and its stacking
// index inside its composition.
//
// WHY THIS EXISTS. Nexrender's v3 `/layers` reports, for every layer, the name
// of the layer's SOURCE — a footage filename, or a nested composition's name —
// not the layer's own name. A designer almost never renames a footage layer, so
// its stored name is the empty string, and After Effects merely DISPLAYS the
// source's name in its place. Nexrender's renderer matches the stored name, so a
// media asset aimed at the name v3 gave us dies:
//
//   nexrender: Couldn't find any layers by provided name (PH_1) inside a
//   composition: Scene_1
//
// …even though `/layers` plainly lists `PH_1` inside `Scene_1`. Text layers are
// the exception: After Effects names them after their own words, so it stores a
// name, which is why text injection worked while every media asset failed.
//
// The remaining way to address an unnamed layer is `layerIndex`, and v3's layer
// ORDER is ascending `aeid` — creation order, not stacking order. (In a real
// project v3 puts the full-frame `BG` solid third of sixteen; the project file
// puts it last, at the bottom, which is the only place a background can be.)
//
// FORMAT. An `.aep` is RIFX: big-endian RIFF. `LIST/Item` wraps a project item,
// whose first `Utf8` chunk is its name. `LIST/Layr` children of a composition
// item appear in STACKING ORDER, top layer first — exactly After Effects'
// `comp.layer(i)` indexing. Each layer's `ldta` chunk opens with a big-endian
// u32 that is precisely the `aeid` Nexrender reports. That is the join key.

import { readFile, stat } from "node:fs/promises";

import { unzipSync } from "fflate";

import { createLogger } from "../../lib/log.js";
import { readZipEntry } from "../../lib/zip-entry.js";

const log = createLogger("aep");

export interface AepLayer {
  /** 1-based stacking index — what Nexrender's `layerIndex` addresses. */
  index: number;
  /**
   * The layer's OWN name, as stored in the project. Empty when the designer
   * never renamed it, in which case After Effects displays the source's name
   * and the layer cannot be addressed by name at all.
   */
  name: string;
  /** The composition the layer lives in. */
  composition: string;
}

/** `aeid` → what the project file says about that layer. */
export type AepLayerIndex = Record<string, AepLayer>;

const RIFX = 0x52494658; // "RIFX"

interface Chunk {
  id: string;
  listType?: string;
  children?: Chunk[];
  body?: { start: number; end: number };
}

/** Walk a RIFF chunk sequence. Sizes are big-endian; every chunk pads to even. */
function parseChunks(buf: Buffer, start: number, end: number, depth = 0): Chunk[] {
  const out: Chunk[] = [];
  let i = start;
  // A malformed file must not blow the stack or spin.
  if (depth > 32) return out;

  while (i + 8 <= end) {
    const id = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32BE(i + 4);
    i += 8;
    const bodyEnd = i + size;
    if (bodyEnd > end) break;

    if (id === "LIST") {
      out.push({
        id,
        listType: buf.toString("latin1", i, i + 4),
        children: parseChunks(buf, i + 4, bodyEnd, depth + 1),
      });
    } else {
      out.push({ id, body: { start: i, end: bodyEnd } });
    }

    i = bodyEnd + (size % 2); // pad byte
  }
  return out;
}

function firstUtf8(buf: Buffer, children: Chunk[]): string | undefined {
  for (const c of children) {
    if (c.id === "Utf8" && c.body) {
      return buf.toString("utf8", c.body.start, c.body.end);
    }
  }
  return undefined;
}

/** Every `LIST` of a given type, at any depth. */
function* lists(children: Chunk[], type: string): Generator<Chunk> {
  for (const c of children) {
    if (c.id !== "LIST" || !c.children) continue;
    if (c.listType === type) yield c;
    yield* lists(c.children, type);
  }
}

/**
 * A composition's own layers, in stacking order.
 *
 * Stops at a nested `Item`: a folder item contains other items, and descending
 * into them would fold their layers into this composition's index.
 */
function* ownLayers(children: Chunk[]): Generator<Chunk> {
  for (const c of children) {
    if (c.id !== "LIST" || !c.children) continue;
    if (c.listType === "Item") continue;
    if (c.listType === "Layr") yield c;
    else yield* ownLayers(c.children);
  }
}

/** The `.aep` inside a Collect-Files zip, or the buffer itself. */
function extractProject(bytes: Uint8Array, filename: string): Buffer | null {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length >= 4 && buf.readUInt32BE(0) === RIFX) return buf;

  if (!/\.zip$/i.test(filename)) return null;
  const entries = unzipSync(bytes, {
    // Skip the footage, which is most of a 200MB Collect Files archive.
    filter: (f) => /\.aep$/i.test(f.name) && !f.name.startsWith("__MACOSX/"),
  });
  const first = Object.values(entries)[0];
  if (!first) return null;
  const inner = Buffer.from(first.buffer, first.byteOffset, first.byteLength);
  return inner.length >= 4 && inner.readUInt32BE(0) === RIFX ? inner : null;
}

/** A `.aep` we will read into memory. Anything larger is not a real project. */
const MAX_PROJECT_BYTES = 256 * 1024 * 1024;

const isRifx = (buf: Buffer): boolean =>
  buf.length >= 4 && buf.readUInt32BE(0) === RIFX;

/**
 * Map every layer's `aeid` to its stacking index and its real name, reading the
 * project straight off disk.
 *
 * This is the production entry point. A Collect Files archive is hundreds of
 * megabytes; `readZipEntry` inflates only the `.aep` inside it, so nothing else
 * is ever resident.
 *
 * Best-effort by design: a project we cannot parse must not block an upload. The
 * caller falls back to targeting by the name Nexrender reported, which works for
 * text layers and for any layer a designer bothered to rename.
 */
export async function parseAepLayersFromFile(
  path: string,
  filename: string,
): Promise<AepLayerIndex | null> {
  let buf: Buffer;

  if (/\.zip$/i.test(filename)) {
    const entry = await readZipEntry(
      path,
      (name) => /\.aep$/i.test(name) && !name.startsWith("__MACOSX/"),
    );
    if (!entry) {
      log.warn("no .aep inside the archive", { filename });
      return null;
    }
    log.info("extracted the project from the archive", {
      entry: entry.name,
      bytes: entry.bytes.length,
    });
    buf = entry.bytes;
  } else {
    const { size } = await stat(path);
    if (size > MAX_PROJECT_BYTES) {
      log.warn("project file too large to parse", { filename, size });
      return null;
    }
    buf = await readFile(path);
  }

  if (!isRifx(buf)) {
    log.warn("not an After Effects project (no RIFX header)", { filename });
    return null;
  }
  return parseProject(buf);
}

/**
 * The in-memory form. Retained for the unit tests, which build synthetic RIFX
 * and zip fixtures rather than touching the filesystem.
 */
export function parseAepLayers(
  bytes: Uint8Array,
  filename: string,
): AepLayerIndex | null {
  let buf: Buffer | null;
  try {
    buf = extractProject(bytes, filename);
  } catch (err) {
    log.warn("could not open the project archive", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!buf) {
    log.warn("not an After Effects project (no RIFX header)", { filename });
    return null;
  }
  return parseProject(buf);
}

/** Walk a RIFX project buffer into the `aeid` → layer index. */
function parseProject(buf: Buffer): AepLayerIndex | null {
  try {
    // Skip "RIFX" + the u32 size + the "Egg!" form type.
    const tree = parseChunks(buf, 12, buf.length);
    const out: AepLayerIndex = {};

    for (const item of lists(tree, "Item")) {
      const compName = firstUtf8(buf, item.children ?? []);
      if (!compName) continue;

      let index = 0;
      for (const layer of ownLayers(item.children ?? [])) {
        index += 1;
        const ldta = (layer.children ?? []).find((c) => c.id === "ldta");
        if (!ldta?.body || ldta.body.end - ldta.body.start < 4) continue;
        const aeid = buf.readUInt32BE(ldta.body.start);
        out[String(aeid)] = {
          index,
          name: firstUtf8(buf, layer.children ?? []) ?? "",
          composition: compName,
        };
      }
    }

    const named = Object.values(out).filter((l) => l.name).length;
    log.info("parsed the project file", {
      layers: Object.keys(out).length,
      named,
      unnamed: Object.keys(out).length - named,
    });
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    log.warn("could not parse the project file", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
