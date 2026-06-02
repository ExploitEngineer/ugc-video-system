// Consistent error model for the API.
//
// Every handler throws an `ApiError` (or lets an unexpected error bubble);
// the single `onError` handler turns it into one JSON shape so the
// frontend always sees `{ error, code?, details? }`. 404 bodies carry a
// JSON `error` string because the web layer keys on it.

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createLogger } from "./log.js";

const log = createLogger("api");

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const notFound = (message: string) =>
  new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string) =>
  new ApiError(409, "CONFLICT", message);

export const unprocessable = (message: string) =>
  new ApiError(422, "UNPROCESSABLE", message);

export const internal = (message: string) =>
  new ApiError(500, "INTERNAL", message);

/** Single error sink registered via `app.onError`. */
export function onError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      err.status,
    );
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  log.error("unhandled error", {
    err: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
  return c.json({ error: "Internal server error" }, 500);
}
