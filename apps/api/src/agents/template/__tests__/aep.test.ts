import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, it, expect } from "vitest";

import { parseAepLayers, parseAepLayersFromFile } from "../aep.js";

// ── a minimal, valid RIFX project ────────────────────────────────────────────

function chunk(id: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(id, 0, "latin1");
  head.writeUInt32BE(body.length, 4);
  // Every RIFF chunk pads to an even length.
  const pad = body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, body, pad]);
}

function list(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), ...children]);
  const head = Buffer.alloc(8);
  head.write("LIST", 0, "latin1");
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

const utf8 = (s: string) => chunk("Utf8", Buffer.from(s, "utf8"));

/** `ldta` opens with the layer's aeid, big-endian. The rest is opaque. */
function ldta(aeid: number): Buffer {
  const body = Buffer.alloc(160);
  body.writeUInt32BE(aeid, 0);
  return chunk("ldta", body);
}

const layer = (aeid: number, name: string) =>
  list("Layr", ldta(aeid), utf8(name));

/** A composition item: its own name, then its layers in STACKING order. */
const comp = (name: string, ...layers: Buffer[]) =>
  list("Item", utf8(name), ...layers);

function project(...items: Buffer[]): Uint8Array {
  const body = Buffer.concat([Buffer.from("Egg!", "latin1"), ...items]);
  const head = Buffer.alloc(8);
  head.write("RIFX", 0, "latin1");
  head.writeUInt32BE(body.length, 4);
  return new Uint8Array(Buffer.concat([head, body]));
}

// Modelled on the real project: a shape on top, an UNNAMED footage placeholder,
// a named background solid at the bottom.
const SCENE = comp(
  "Scene_1",
  layer(82, "Shape Layer 1"),
  layer(83, ""),
  layer(84, "BG"),
);

describe("parseAepLayers — the layer names Nexrender cannot give us", () => {
  const map = parseAepLayers(project(SCENE), "x.aep");

  it("keys layers by the same aeid Nexrender reports", () => {
    expect(Object.keys(map ?? {}).sort()).toEqual(["82", "83", "84"]);
  });

  it("numbers layers by stacking order, top first", () => {
    expect(map?.["82"]).toEqual({ index: 1, name: "Shape Layer 1", composition: "Scene_1" });
    expect(map?.["84"]).toEqual({ index: 3, name: "BG", composition: "Scene_1" });
  });

  it("reports an UNNAMED layer as unnamed", () => {
    // The whole reason this parser exists. Nexrender calls this layer `PH_1`,
    // which is its SOURCE's name; the project stores no name at all, and its
    // renderer matches the stored one. Only `index: 2` can reach it.
    expect(map?.["83"]).toEqual({ index: 2, name: "", composition: "Scene_1" });
  });
});

describe("parseAepLayers — composition boundaries", () => {
  it("restarts the index in every composition", () => {
    const map = parseAepLayers(
      project(SCENE, comp("Scene_2", layer(90, ""), layer(91, "BG"))),
      "x.aep",
    );
    expect(map?.["90"]?.index).toBe(1);
    expect(map?.["91"]?.index).toBe(2);
  });

  it("does not fold a folder's nested items into the parent's index", () => {
    // A `Fold` item wraps other items. Descending into them would number their
    // layers as though they belonged to the folder.
    const folder = list("Item", utf8("Footage"), comp("Inner", layer(70, "a")));
    const map = parseAepLayers(project(folder, SCENE), "x.aep");
    expect(map?.["70"]).toEqual({ index: 1, name: "a", composition: "Inner" });
    expect(map?.["83"]?.index).toBe(2); // unchanged
  });
});

describe("parseAepLayers — what it is handed", () => {
  it("finds the project inside a Collect Files zip", () => {
    const zip = zipSync({
      "Urban Opener/footage/clip.mp4": new Uint8Array([1, 2, 3]),
      "Urban Opener/Urban_Opener.aep": project(SCENE),
    });
    const map = parseAepLayers(zip, "urban-opener.zip");
    expect(map?.["83"]).toEqual({ index: 2, name: "", composition: "Scene_1" });
  });

  it("returns null rather than throwing on something that is not a project", () => {
    expect(parseAepLayers(new Uint8Array([0, 1, 2, 3, 4]), "x.aep")).toBeNull();
    expect(parseAepLayers(new Uint8Array(0), "x.zip")).toBeNull();
    // A zip with no .aep in it.
    const zip = zipSync({ "readme.txt": new Uint8Array([65]) });
    expect(parseAepLayers(zip, "x.zip")).toBeNull();
  });

  it("survives a truncated chunk instead of running off the end", () => {
    const good = Buffer.from(project(SCENE));
    expect(() => parseAepLayers(new Uint8Array(good.subarray(0, 40)), "x.aep")).not.toThrow();
  });
});

// ── the production entry point: read the project off disk ────────────────────

describe("parseAepLayersFromFile — the path production takes", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aep-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const write = async (name: string, bytes: Uint8Array) => {
    const path = join(dir, name);
    await writeFile(path, bytes);
    return path;
  };

  it("pulls the .aep out of a zip WITHOUT inflating the footage beside it", async () => {
    // The footage dwarfs the project, which is the whole point of reading only
    // the one entry: a real Collect Files archive is hundreds of megabytes.
    const zip = zipSync({
      "Urban Opener/footage/clip.mp4": new Uint8Array(400_000).fill(9),
      "Urban Opener/Output/render.mp4": new Uint8Array(200_000).fill(8),
      "Urban Opener/Urban_Opener.aep": project(SCENE),
    });
    const path = await write("collected.zip", zip);

    const map = await parseAepLayersFromFile(path, "urban-opener.zip");
    expect(map?.["83"]).toEqual({ index: 2, name: "", composition: "Scene_1" });
    expect(map?.["84"]).toEqual({ index: 3, name: "BG", composition: "Scene_1" });
  });

  it("skips a macOS resource fork that also ends in .aep", async () => {
    const zip = zipSync({
      "__MACOSX/._Urban_Opener.aep": new Uint8Array([0, 0, 0, 0]),
      "Urban Opener/Urban_Opener.aep": project(SCENE),
    });
    const path = await write("mac.zip", zip);
    expect(await parseAepLayersFromFile(path, "mac.zip")).not.toBeNull();
  });

  it("reads a bare .aep straight off disk", async () => {
    const path = await write("bare.aep", project(SCENE));
    const map = await parseAepLayersFromFile(path, "bare.aep");
    expect(map?.["82"]).toEqual({
      index: 1,
      name: "Shape Layer 1",
      composition: "Scene_1",
    });
  });

  it("returns null rather than failing the upload when it cannot parse", async () => {
    const noAep = await write("empty.zip", zipSync({ "readme.txt": new Uint8Array([65]) }));
    expect(await parseAepLayersFromFile(noAep, "empty.zip")).toBeNull();

    const notAProject = await write("junk.aep", new Uint8Array([0, 1, 2, 3, 4]));
    expect(await parseAepLayersFromFile(notAProject, "junk.aep")).toBeNull();

    const notAZip = await write("junk.zip", new Uint8Array([0, 1, 2, 3, 4]));
    expect(await parseAepLayersFromFile(notAZip, "junk.zip")).toBeNull();
  });
});
