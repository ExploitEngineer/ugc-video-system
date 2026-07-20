import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { downloadToBuffer } from "../download.js";

// A local HTTP server that exercises the three download behaviors the idle
// watchdog must get right: a slow-but-progressing stream (must complete), a
// stalled stream (must abort on the idle timeout, NOT run forever), and a
// non-retryable status (must fail fast without burning the retries).
describe("streamDownload / downloadToBuffer — idle-timeout watchdog", () => {
  let server: Server;
  let base = "";
  const openResponses = new Set<{ end: () => void }>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/progressing") {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        let n = 0;
        const iv = setInterval(() => {
          if (n >= 6) {
            clearInterval(iv);
            res.end();
            return;
          }
          res.write(Buffer.from([n]));
          n++;
        }, 30); // 30ms gaps — well under the 300ms idle budget
      } else if (req.url === "/stall") {
        res.writeHead(200);
        res.write(Buffer.from([0])); // one byte, then silence forever
        openResponses.add(res);
      } else if (req.url === "/notfound") {
        res.writeHead(404);
        res.end("nope");
      } else {
        res.writeHead(500);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const res of openResponses) res.end();
    openResponses.clear();
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("completes a slow-but-progressing download (never aborts while bytes flow)", async () => {
    const bytes = await downloadToBuffer(`${base}/progressing`, {
      idleTimeoutMs: 300,
      attempts: 1,
    });
    expect([...bytes]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("aborts a stalled download on the idle timeout, with a clear reason", async () => {
    const t0 = Date.now();
    await expect(
      downloadToBuffer(`${base}/stall`, { idleTimeoutMs: 150, attempts: 1 }),
    ).rejects.toThrow(/idle/i);
    // Fired on the idle budget, not hung indefinitely.
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("fails fast on a non-retryable 404 without burning the retries", async () => {
    const t0 = Date.now();
    await expect(
      downloadToBuffer(`${base}/notfound`, { idleTimeoutMs: 5000, attempts: 3 }),
    ).rejects.toThrow(/404/);
    // No 3x retry + backoff — a 4xx is terminal.
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

// The failure this guards against: a laptop suspended one second into
// `template_render`, and every retry of the master download reported
// `received=0` while a plain curl to the same URL finished in 14s. The retries
// were being handed the SAME pooled keep-alive socket the suspend had killed —
// established, silent, and never expired (undici's pool timers are monotonic, so
// they don't age while a machine sleeps). A dead connection must never outlive
// the attempt that owned it.
describe("streamDownload — a retry never inherits the previous attempt's connection", () => {
  let server: Server;
  let base = "";
  let connections = 0;
  let stallNextConnection = false;
  const openResponses = new Set<{ end: () => void }>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url !== "/media") {
        res.writeHead(404).end();
        return;
      }
      // Model the corpse: the first connection is accepted and then answers
      // nothing at all, exactly like a socket whose peer vanished at suspend.
      if (stallNextConnection) {
        stallNextConnection = false;
        openResponses.add(res);
        return;
      }
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from([1, 2, 3, 4]));
    });
    server.on("connection", () => {
      connections++;
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const res of openResponses) res.end();
    openResponses.clear();
    connections = 0;
    stallNextConnection = false;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("opens a fresh connection per download — a pooled socket is never reused", async () => {
    await downloadToBuffer(`${base}/media`, { idleTimeoutMs: 2000, attempts: 1 });
    // Let the first download's socket settle back into a pool, so a shared one
    // would definitely have it on offer for the second. Without this pause the
    // assertion could pass on a race rather than on the property.
    await new Promise((r) => setTimeout(r, 50));
    await downloadToBuffer(`${base}/media`, { idleTimeoutMs: 2000, attempts: 1 });
    // Keep-alive would serve the second download on the first's socket (Node's
    // shared global-fetch pool does exactly that). That is the reuse which made
    // every retry hang on a connection a suspend had already killed.
    expect(connections).toBe(2);
  });

  it("recovers when an attempt's connection is dead-but-established", async () => {
    stallNextConnection = true;
    const bytes = await downloadToBuffer(`${base}/media`, {
      idleTimeoutMs: 200,
      attempts: 2,
    });
    // The stalled attempt died on its own idle budget, and the retry — on a
    // connection of its own — got the file.
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(connections).toBe(2);
  });
});
