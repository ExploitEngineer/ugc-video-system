// Base URL for the Hono api, used ONLY server-side (route handlers + server
// actions run in Node — no CORS). The browser never calls the API directly; it
// hits same-origin Next proxies under /api/runs. So NEXT_PUBLIC_API_URL is
// optional, and the localhost:3001 fallback is correct for the co-located API
// in the single-image deploy. (Override it only if the API is a separate host.)

import type {
  AdTypeMenuItem,
  Run,
  RunDetail,
  TemplateSummary,
} from "@ugc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const apiUrl = (path: string) => `${API_URL}${path}`;

/**
 * Create a run by POSTing the multipart form to the same-origin Next proxy
 * (`/api/runs`), which streams it through to the API server-side. Going through
 * a Route Handler (not a Server Action, whose 1 MB body cap rejects real
 * product/person images) keeps the browser same-origin — no CORS, no Private
 * Network Access prompt, no public API URL needed. Returns the new `RunDetail`;
 * throws a readable error on failure.
 */
export async function createRun(formData: FormData): Promise<RunDetail> {
  const res = await fetch("/api/runs", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to start run.");
  }
  return res.json() as Promise<RunDetail>;
}

/**
 * The ad-type menu for the create-form dropdown (Chunk J), via the Next proxy
 * (`/api/ad-types`). Registry-driven on the API, so it grows as new types land.
 * Returns `[]` on failure so the form falls back to Auto-detect only.
 */
export async function fetchAdTypes(): Promise<AdTypeMenuItem[]> {
  try {
    const res = await fetch("/api/ad-types", { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as AdTypeMenuItem[];
  } catch {
    return [];
  }
}

/**
 * Client-side run list through the Next proxy (`/api/runs`). Powers the studio
 * sidebar so every run already in the database shows up, not just locally
 * created ones. Newest first (the API orders by createdAt desc).
 */
export async function fetchRuns(): Promise<Run[]> {
  const res = await fetch("/api/runs", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load runs");
  return res.json();
}

/**
 * Client-side run fetch through the Next polling proxy (`/api/runs/:id`).
 * Shared by the run view and the studio sidebar's per-run status dots.
 * Throws "not-found" on 404 so callers can short-circuit retries.
 */
export async function fetchRun(runId: string): Promise<RunDetail> {
  const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("not-found");
  if (!res.ok) throw new Error("Failed to load run");
  return res.json();
}

/**
 * Save a CE.SDK edit of the run's final video. POSTs the exported MP4 (and,
 * when present, the serialized editor scene) as multipart form data to the
 * same-origin Next proxy (`/api/runs/:id/edited-video`), which streams it to
 * the API. Returns the updated `RunDetail` — now carrying the new
 * `edited_video` (and `editor_scene`) assets. Throws a readable error on failure.
 */
export async function uploadEditedVideo(
  runId: string,
  video: Blob,
  scene?: Blob,
): Promise<RunDetail> {
  const form = new FormData();
  form.append("video", video, "edited-video.mp4");
  if (scene) form.append("scene", scene, "scene.json");

  const res = await fetch(`/api/runs/${runId}/edited-video`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to save the edited video.");
  }
  return res.json() as Promise<RunDetail>;
}

// ── Template library ────────────────────────────────────────────────────────
// End users no longer upload templates: an admin curates the library and users
// pick from it. The admin routes are gated by an `x-admin-key` header, which the
// browser holds in localStorage and the proxies below forward verbatim.

/** The header the API's admin middleware checks. */
export const ADMIN_KEY_HEADER = "x-admin-key";

/** The uploader's own claim about the body size. A hint, never trusted. */
export const TEMPLATE_BYTES_HEADER = "x-template-bytes";

/**
 * Forward a request to an `/admin/*` API route, carrying the admin key through.
 *
 * Unlike `proxyJson`, this preserves an empty body: `DELETE` answers 204, and
 * `Response.json(…, { status: 204 })` is invalid — a 204 may not carry one.
 */
export async function proxyAdmin(
  path: string,
  req: Request,
  opts: { body?: BodyInit | null; stream?: boolean } = {},
): Promise<Response> {
  const key = req.headers.get(ADMIN_KEY_HEADER) ?? "";
  const contentType = req.headers.get("content-type");
  // `content-length` does not survive a streamed `fetch` (undici sends the body
  // chunked), so the browser also states the size in `x-template-bytes`. It lets
  // the API answer 413 before reading a gigabyte it is going to throw away.
  const declaredBytes = req.headers.get(TEMPLATE_BYTES_HEADER);
  try {
    const res = await fetch(apiUrl(path), {
      method: req.method,
      headers: {
        [ADMIN_KEY_HEADER]: key,
        ...(contentType ? { "content-type": contentType } : {}),
        ...(declaredBytes ? { [TEMPLATE_BYTES_HEADER]: declaredBytes } : {}),
      },
      ...(opts.stream
        ? { body: req.body, duplex: "half" }
        : opts.body !== undefined
          ? { body: opts.body }
          : {}),
      cache: "no-store",
    } as RequestInit);

    if (res.status === 204) return new Response(null, { status: 204 });
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}

/** Browser-side: hit an admin route through the same-origin proxy. */
export async function adminFetch(
  path: string,
  key: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), [ADMIN_KEY_HEADER]: key },
    cache: "no-store",
  });
}

/** Browser-side: the public picker list. */
export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch("/api/templates", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load templates.");
  return res.json() as Promise<TemplateSummary[]>;
}

/**
 * Ensure the run's audio track exists as a standalone file and return its URL.
 * The editor can't detach a video's baked-in audio, so the API extracts it into
 * a separate `final_audio` asset (lazily, idempotently) — the editor then loads
 * it as its own timeline lane. Hits the same-origin Next proxy
 * (`/api/runs/:id/audio-track`). Throws a readable error on failure so the
 * editor can fall back to the baked-in audio.
 */
export async function ensureAudioTrack(
  runId: string,
): Promise<{ url: string }> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/audio-track`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to prepare the audio track.");
  }
  return res.json() as Promise<{ url: string }>;
}

// ── Server-side proxy helpers (used by the Next Route Handlers under
// app/api/runs/**). They keep the browser same-origin and the API internal.
// IMPORTANT: any path segment taken from the request URL (e.g. a runId) MUST be
// `encodeURIComponent`'d by the caller before being passed here, so a crafted
// value can't alter the upstream path or inject a query string. ──

/** Forward a JSON request to the API, mirroring its status; 502 if unreachable. */
export async function proxyJson(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    const res = await fetch(apiUrl(path), { cache: "no-store", ...init });
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}

/** Stream a multipart upload (`req.body`) to the API and mirror its JSON status.
 *  Streaming (not buffering) keeps large product/person/video uploads off this
 *  server's heap. */
export async function proxyUpload(
  path: string,
  req: Request,
): Promise<Response> {
  try {
    const res = await fetch(apiUrl(path), {
      method: req.method,
      body: req.body,
      headers: { "content-type": req.headers.get("content-type") ?? "" },
      duplex: "half", // stream the request body instead of buffering it
      cache: "no-store",
    } as RequestInit);
    const body = await res
      .json()
      .catch(() => ({ error: "Bad response from API" }));
    return Response.json(body, { status: res.status });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
}

/** Unbuffered SSE passthrough; forwards `req.signal` so a browser disconnect
 *  aborts upstream and the API detaches its bus listener. */
export async function proxyStream(
  path: string,
  req: Request,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(apiUrl(path), {
      headers: { accept: "text/event-stream" },
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return Response.json({ error: "API unreachable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const body = await upstream
      .json()
      .catch(() => ({ error: "Stream unavailable" }));
    return Response.json(body, { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
