// Brand-guidelines file → a concise, prompt-ready brand brief.
//
// Accepts a PDF or a plain-text/markdown file, extracts its text, and asks the
// reasoning model to condense it into a short brief (palette, type, tone, voice,
// words to use/avoid, do/don'ts). The result is capped to BRAND_MAX so it drops
// straight into the same `brand_text` channel a user would type by hand.

import { BRAND_MAX } from "@ugc/shared";

import { createOpenAIProvider } from "../providers/index.js";

/** Raw extracted text over this is truncated before the LLM sees it — brand
 *  guides can be long, and the condense only needs the substance. */
const MAX_RAW_CHARS = 24_000;

export type BrandFileKind = "pdf" | "text";

/** Sniff the bytes: a `%PDF` magic → PDF; otherwise treat as UTF-8 text. Returns
 *  null when the bytes are neither a PDF nor decodable text. */
export function sniffBrandFile(bytes: Uint8Array): BrandFileKind | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  ) {
    return "pdf";
  }
  // Text/markdown has no magic number. Decode a prefix strictly (fatal) so
  // binary junk is rejected rather than silently mangled.
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 2048));
    return "text";
  } catch {
    return null;
  }
}

/** Extract raw text from the uploaded brand file. */
export async function extractBrandText(
  bytes: Uint8Array,
  kind: BrandFileKind,
): Promise<string> {
  if (kind === "text") {
    return new TextDecoder("utf-8").decode(bytes).trim();
  }
  // PDF — unpdf is pure-JS (no native deps), safe under tsx in dev + prod.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  // mergePages:true → `text` is a single string across all pages.
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

/** Condense raw brand-guidelines text into a short, prompt-ready brief. */
export async function condenseBrandBrief(rawText: string): Promise<string> {
  const trimmed = rawText.slice(0, MAX_RAW_CHARS);
  const openai = createOpenAIProvider();
  const reply = await openai.chat(
    [
      {
        role: "system",
        content:
          "You condense brand guidelines into a tight brief for an ad-video generator. " +
          "Output PLAIN TEXT only (no markdown headings, no preamble). Capture, when present: " +
          "brand name; colour palette (hex if given); typography; tone & voice; words/phrases to " +
          "use and to avoid; visual do's and don'ts; tagline. Omit anything not in the source — " +
          "never invent. Be specific and tight; aim for under 180 words.",
      },
      {
        role: "user",
        content: `Brand guidelines source:\n\n${trimmed}`,
      },
    ],
    { backend: "claude", maxTokens: 900 },
  );
  return reply.trim().slice(0, BRAND_MAX);
}
