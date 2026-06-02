// Parse a JSON object out of an LLM text response.
//
// Skills ask the model for strict JSON, but models still occasionally wrap it
// in ```json fences or add prose. Strip fences, grab the outermost object,
// and fail loudly with the raw text so a bad response is debuggable.
//
// Pass an optional Zod `schema` to validate/normalize the parsed object before
// it flows into the pipeline — turns a structurally-wrong LLM reply into a
// clear error instead of `undefined` fields surfacing far downstream. Sites
// that already guard with whitelist + fallback (interpret-style/feedback,
// video prompt) can keep calling without a schema.

import type { ZodType } from "zod";
import { internal } from "../lib/errors.js";

/** Replace raw control bytes (code < 0x20: real newline/tab/CR/…) with spaces. */
function stripControlBytes(s: string): string {
  let out = "";
  for (const ch of s) out += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return out;
}

export function parseJsonObject<T>(raw: string, schema?: ZodType): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw internal(`LLM did not return JSON. Got: ${raw.slice(0, 300)}`);
  }
  const candidate = body.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Models sometimes emit raw control bytes (actual newlines/tabs) INSIDE a
    // string value, which JSON.parse rejects. Sanitize and retry. A literal
    // `\n` escape sequence (backslash + "n") is two normal chars and survives —
    // only real control bytes are replaced.
    try {
      parsed = JSON.parse(stripControlBytes(candidate));
    } catch {
      throw internal(`Failed to parse LLM JSON. Got: ${raw.slice(0, 300)}`);
    }
  }
  if (schema) {
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw internal(
        `LLM JSON failed schema validation: ${result.error.message}. Got: ${raw.slice(0, 300)}`,
      );
    }
    return result.data as T;
  }
  return parsed as T;
}
