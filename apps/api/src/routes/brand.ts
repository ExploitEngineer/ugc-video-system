// /brand routes — turn an uploaded brand-guidelines file into a prompt-ready
// brief. The browser posts a PDF/.txt/.md; we extract its text, condense it with
// the reasoning model, and return `{ brandText }` for the composer to drop into
// the (editable) brand-guidelines field. No persistence here — the string rides
// the normal create-run path once the user submits.

import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";

import {
  condenseBrandBrief,
  extractBrandText,
  sniffBrandFile,
} from "../lib/brand-parse.js";
import { badRequest, unprocessable } from "../lib/errors.js";
import { createLogger } from "../lib/log.js";

const MAX_BRAND_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const tooLarge = (c: Context) =>
  c.json(
    { error: "Brand file exceeds the 10MB limit.", code: "PAYLOAD_TOO_LARGE" },
    413,
  );

const log = createLogger("brand");

export const brand = new Hono();

brand.post(
  "/parse",
  bodyLimit({ maxSize: MAX_BRAND_FILE_BYTES, onError: tooLarge }),
  async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw badRequest("No brand file uploaded (multipart field 'file').");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) throw badRequest("Brand file is empty.");

    const kind = sniffBrandFile(bytes);
    if (!kind) {
      throw unprocessable(
        "Unsupported file — upload a PDF, .txt, or .md brand guide.",
      );
    }

    let rawText: string;
    try {
      rawText = await extractBrandText(bytes, kind);
    } catch (err) {
      log.warn("brand text extraction failed", { kind, err: String(err) });
      throw unprocessable(
        "Couldn't read text from that file. Try a text-based PDF or a .txt/.md.",
      );
    }
    if (rawText.trim().length < 20) {
      throw unprocessable(
        "That file had no readable text (a scanned/image-only PDF?). Paste the guidelines instead.",
      );
    }

    const brandText = await condenseBrandBrief(rawText);
    log.info("brand file condensed", {
      kind,
      rawChars: rawText.length,
      briefChars: brandText.length,
    });
    return c.json({ brandText });
  },
);
