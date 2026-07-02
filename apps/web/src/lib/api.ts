// Base URL for the Hono api, used ONLY server-side (route handlers + server
// actions run in Node — no CORS). The browser never calls the API directly; it
// hits same-origin Next proxies under /api/runs. So NEXT_PUBLIC_API_URL is
// optional, and the localhost:3001 fallback is correct for the co-located API
// in the single-image deploy. (Override it only if the API is a separate host.)

import type { AdTypeMenuItem, Run, RunDetail } from "@ugc/shared";

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

// ── Plainly interactive pre-merge stage ───────────────────────────────────

export interface PlainlyConfig {
  configured: boolean;
  defaultProjectId: string | null;
  defaultTemplateId: string | null;
}

export interface PlainlyTemplateParam {
  name: string;
  layerType?: string;
  mediaType?: string;
  mandatory?: boolean;
  defaultValue?: string;
}

export interface PlainlyClip {
  segmentIndex: number;
  url: string;
}

export interface PlainlyTemplates {
  projectId: string | null;
  templateId: string | null;
  params: PlainlyTemplateParam[];
  clips: PlainlyClip[];
}

export interface PlainlyRenderStatus {
  state: "processing" | "completed" | "failed";
  rawState: string;
  previewUrl: string | null;
  error: string | null;
}

export interface PlainlyDesignVariant {
  templateId: string;
  label: string;
  aspectRatio: string;
  durationSec: number;
  /** Rendered example MP4 of this variant, for the picker preview. */
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface PlainlyDesign {
  projectId: string;
  name: string;
  description: string;
  variants: PlainlyDesignVariant[];
  /** Plainly catalog category, shown as a badge. */
  category?: string;
  /** Ad-type ids this design suits (registry slugs) — drives the "Recommended" hint. */
  suggestedAdTypes?: string[];
}

/** The curated ready-made designs offered as single-clip branded wraps. */
export async function fetchPlainlyDesigns(): Promise<PlainlyDesign[]> {
  try {
    const res = await fetch("/api/plainly/designs", { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { designs?: PlainlyDesign[] };
    return body.designs ?? [];
  } catch {
    return [];
  }
}

/** Whether the server has Plainly configured (+ its default template ids). */
export async function fetchPlainlyConfig(): Promise<PlainlyConfig> {
  const off: PlainlyConfig = {
    configured: false,
    defaultProjectId: null,
    defaultTemplateId: null,
  };
  try {
    const res = await fetch("/api/plainly/config", { cache: "no-store" });
    if (!res.ok) return off;
    return (await res.json()) as PlainlyConfig;
  } catch {
    return off;
  }
}

/** Discover a template's parameters (+ this run's clip URLs to fill them). */
export async function fetchPlainlyTemplates(
  runId: string,
  projectId?: string,
  templateId?: string,
): Promise<PlainlyTemplates> {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  if (templateId) qs.set("templateId", templateId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/templates${suffix}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to load the Plainly template.");
  }
  return res.json() as Promise<PlainlyTemplates>;
}

/** Submit a Plainly render with the assembled parameters. */
export async function submitPlainlyRender(
  runId: string,
  body: {
    projectId: string;
    templateId: string;
    parameters: Record<string, string>;
    /** Strip the clip's original voice before rendering (template audio only). */
    muteClipAudio?: boolean;
  },
): Promise<{ renderId: string; state: string }> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/renders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? "Failed to start the render.");
  }
  return res.json() as Promise<{ renderId: string; state: string }>;
}

/** Poll one render's state (+ preview URL when DONE). */
export async function pollPlainlyRender(
  runId: string,
  renderId: string,
): Promise<PlainlyRenderStatus> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/renders/${encodeURIComponent(renderId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? "Failed to poll the render.");
  }
  return res.json() as Promise<PlainlyRenderStatus>;
}

/** Adopt a finished render as the branded replacement for ONE segment clip. The
 *  run stays `awaiting_edit`; returns the updated RunDetail (clip now branded). */
export async function acceptPlainlyClip(
  runId: string,
  body: {
    renderId: string;
    segmentIndex: number;
    projectId: string;
    templateId: string;
    parameters: Record<string, string>;
    /** Recorded so re-branding restores the voice toggle. */
    muteClipAudio?: boolean;
  },
): Promise<RunDetail> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/clips/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? "Failed to accept the branded clip.");
  }
  return res.json() as Promise<RunDetail>;
}

/** Finish the Plainly stage → merge all clips (branded + raw) into the final. */
export async function finalizePlainly(runId: string): Promise<RunDetail> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/finalize`,
    { method: "POST" },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? "Failed to finalize the Plainly stage.");
  }
  return res.json() as Promise<RunDetail>;
}

/** Skip the Plainly stage → merge the raw clips (no branding). */
export async function skipPlainly(runId: string): Promise<RunDetail> {
  const res = await fetch(
    `/api/runs/${encodeURIComponent(runId)}/plainly/skip`,
    { method: "POST" },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error ?? "Failed to skip the Plainly stage.");
  }
  return res.json() as Promise<RunDetail>;
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
