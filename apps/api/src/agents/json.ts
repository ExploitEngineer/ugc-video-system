// Parse a JSON object out of an LLM text response.
//
// Skills ask the model for strict JSON, but models still occasionally wrap it
// in ```json fences or add prose. Strip fences, grab the outermost object,
// and fail loudly with the raw text so a bad response is debuggable.

import { internal } from "../lib/errors.js";

export function parseJsonObject<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw internal(`LLM did not return JSON. Got: ${raw.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    throw internal(`Failed to parse LLM JSON. Got: ${raw.slice(0, 300)}`);
  }
}
