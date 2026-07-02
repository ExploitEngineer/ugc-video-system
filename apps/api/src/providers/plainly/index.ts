// Plainly Videos provider adapter — cloud After Effects rendering.
//
// Distinct from the VideoProvider (Seedance) boundary: Plainly is an ASSEMBLY
// job, not a generation one. It renders an AE template whose placeholder layers
// are filled by a `parameters` map (text / hex color / media URLs incl. video),
// and returns a finished MP4. We use it for the optional interactive pre-merge
// stage: the user picks a template, fills its controls, and Plainly assembles +
// brands the Seedance clips into the final video. See
// apps/api/docs/plainly-integration.md.
//
// REST only (no SDK). HTTP Basic auth: the API key is the username, password
// EMPTY ("KEY:"). Renders are async — submit → poll the render id → output URL
// (which expires, so callers must re-host the accepted output immediately).

import { Buffer } from "node:buffer";
import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { redactUrls } from "../../lib/run-failure.js";
import {
  isDesignId,
  MEDIA_DESIGN_PARAMS,
  type PlainlyDesign,
  PLAINLY_DESIGNS,
} from "./designs.js";

export * from "./designs.js";

const log = createLogger("plainly");

/** Coarse render state — Plainly's many raw states collapse to these three. */
export type PlainlyRenderState = "processing" | "completed" | "failed";

export interface PlainlySubmitInput {
  projectId: string;
  templateId: string;
  /** Layer-name → value. Values are text, hex color, or a media URL (image/audio/video). */
  parameters: Record<string, string>;
  /** Optional async callback (P7 webhook mode); v1 polls instead. */
  webhook?: { url: string; passthrough?: string };
}

export interface PlainlyRender {
  renderId: string;
  state: PlainlyRenderState;
  /** Raw provider state string (PENDING | QUEUED | IN_PROGRESS | DONE | ERROR | …) for logs/UI. */
  rawState: string;
  /** Public MP4 URL — present only when `state === "completed"`. Expires (24h–7d). */
  output?: string;
  /** When the output URL stops working — re-host before this. */
  expirationDate?: string;
  /** Provider failure message — present only when `state === "failed"`. */
  error?: string;
  /** Untouched payload — escape hatch for fields still being verified live. */
  raw: unknown;
}

export interface PlainlyTemplateParam {
  /** The key to put in `parameters`. */
  name: string;
  /** DATA | MEDIA | COMPOSITION. */
  layerType?: string;
  /** For MEDIA layers: image | audio | video. */
  mediaType?: string;
  mandatory?: boolean;
  defaultValue?: string;
}

export interface PlainlyTemplate {
  templateId: string;
  /** One entry per parametrized layer — call before rendering to learn the param names. */
  params: PlainlyTemplateParam[];
  raw: unknown;
}

export interface PlainlyProvider {
  /** The curated public designs offered as single-clip branded wraps (pinned,
   *  no network). Offline fallback for `listDesignsEnriched`. */
  listDesigns(): PlainlyDesign[];
  /** The curated designs CONFIRMED against the live Plainly catalog
   *  (`GET /api/v2/designs`): each is proven to still exist and is enriched with a
   *  preview MP4 + category + the live duration. Curated ids missing from the
   *  live catalog are dropped (so the picker never offers a dead template). Falls
   *  back to the pinned list when the catalog can't be reached. */
  listDesignsEnriched(): Promise<PlainlyDesign[]>;
  /** Discover a template's parameter names/types. For a curated design this
   *  returns the pinned schema (designs aren't projects → the templates endpoint
   *  404s); for any other id it reads the custom project's template live. */
  getTemplate(projectId: string, templateId: string): Promise<PlainlyTemplate>;
  /** Trigger a render (POST /renders). Returns the render id + initial state. */
  submitRender(input: PlainlySubmitInput): Promise<PlainlyRender>;
  /** Poll one render (GET /renders/{id}). */
  pollRender(renderId: string): Promise<PlainlyRender>;
  /** Download a finished render's output for re-hosting. */
  downloadOutput(url: string): Promise<{ bytes: Uint8Array; mime: string }>;
}

/** True when the Plainly feature is configured (API key present). */
export function isPlainlyConfigured(): boolean {
  return Boolean(env.PLAINLY_API_KEY);
}

/** Raw states that mean "still working — keep polling". THROTTLED auto-starts later. */
const PROCESSING_STATES = new Set([
  "PENDING",
  "THROTTLED",
  "QUEUED",
  "IN_PROGRESS",
]);

/** Map a raw Plainly render state → our coarse state. INVALID (bad param/URL) and
 *  ERROR are terminal failures. An unmapped state is treated as STILL PROCESSING
 *  (a new intermediate stage is likelier than a new terminal one; the poll
 *  timeout bounds the risk) and logged. */
function mapState(raw: string): PlainlyRenderState {
  const s = raw.toUpperCase().replace(/-/g, "_");
  if (s === "DONE") return "completed";
  if (s === "ERROR" || s === "INVALID") return "failed";
  if (PROCESSING_STATES.has(s)) return "processing";
  log.warn("unmapped Plainly render state — treating as processing", {
    state: raw,
  });
  return "processing";
}

function authHeader(): string {
  // Basic auth, key as username + EMPTY password → base64("KEY:").
  return `Basic ${Buffer.from(`${env.PLAINLY_API_KEY ?? ""}:`).toString("base64")}`;
}

async function plainlyFetch(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!env.PLAINLY_API_KEY) {
    throw new Error("PLAINLY_API_KEY not set — Plainly feature is disabled");
  }
  const url = `${env.PLAINLY_API_BASE_URL}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
    ...init?.headers,
  };
  // GET (poll/discover) is idempotent → retry transient network drops. POST
  // /renders is NOT — a socket drop after it reached Plainly could create a
  // duplicate (paid) render, so surface the error instead of retrying.
  const res = await fetchWithRetry(
    url,
    { ...init, headers },
    { label: `plainly ${path}`, retryOnNetworkError: method === "GET" },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Plainly ${path} failed: ${res.status} ${redactUrls(text).slice(0, 500)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

type RawRender = {
  id?: string;
  state?: string;
  output?: string | null;
  expirationDate?: string;
  error?: string | { message?: string };
};

function toRender(json: RawRender): PlainlyRender {
  const rawState = String(json.state ?? "PENDING");
  const state = mapState(rawState);
  const output =
    state === "completed" && typeof json.output === "string"
      ? json.output
      : undefined;
  const error =
    state === "failed"
      ? typeof json.error === "string"
        ? json.error
        : (json.error?.message ?? rawState)
      : undefined;
  return {
    renderId: String(json.id ?? ""),
    state,
    rawState,
    output,
    expirationDate: json.expirationDate,
    error,
    raw: json,
  };
}

// A layer from GET /projects/{id}/templates/{tid} (verified live 2026-06-29 on a
// custom project): `layerType`/`mediaType` are TOP-LEVEL; the parameter key is
// `parametrization.value` and carries a leading `#` (the AE expression ref) which
// the render `parameters` key drops (a public-design render confirmed the bare key
// works). `layerType` is DATA | MEDIA | SOLID_COLOR | COMPOSITION.
type RawLayer = {
  layerName?: string;
  layerType?: string;
  mediaType?: string;
  parametrization?: {
    value?: string;
    mandatory?: boolean;
    defaultValue?: string | null;
  };
};

/** Apply the blank-value rules before submitting a render (verified live, see
 *  the plainly-optional-fields memory):
 *   - DATA params (text / color): keep the value, including "" — an empty string
 *     CLEARS the layer (no text shown), which is what we want for blank optionals.
 *   - Everything else (MEDIA image/video/audio, SOLID_COLOR, …): omit when blank.
 *     A blank media slot would just pull the template's default, and a blank color
 *     is invalid — so we don't send empties for non-text params.
 *   - COLOR / SOLID_COLOR values: Plainly expects 6-digit hex WITHOUT a leading
 *     '#' (the docs example is `"colorPrimary": "242423"`). A '#'-prefixed value
 *     is silently ignored → the template default shows instead. We strip it here
 *     so the UI can accept either form.
 *  Unknown keys (custom params we don't model) pass through untouched. */
export function normalizeRenderParameters(
  params: PlainlyTemplateParam[],
  values: Record<string, string>,
): Record<string, string> {
  const typeByName = new Map(params.map((p) => [p.name, p.layerType ?? ""]));
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    const layerType = (typeByName.get(name) ?? "").toUpperCase();
    // Only DATA (text) keeps a blank value (an empty string clears the text).
    if (layerType !== "DATA" && value.trim() === "") continue;
    out[name] =
      layerType === "COLOR" || layerType === "SOLID_COLOR"
        ? value.trim().replace(/^#/, "")
        : value;
  }
  return out;
}

function toParam(layer: RawLayer): PlainlyTemplateParam | null {
  const p = layer.parametrization;
  const raw = p?.value;
  if (!raw) return null;
  return {
    name: raw.replace(/^#/, ""), // the render parameters key drops the leading '#'
    layerType: layer.layerType,
    mediaType: layer.mediaType,
    mandatory: p?.mandatory,
    defaultValue: p?.defaultValue ?? undefined,
  };
}

// A design from GET /api/v2/designs (separate namespace from /projects — designs
// are pre-made Plainly projects). The `id` is the render `projectId`; each
// `variant.id` is the `templateId`. `examples[].videoUrl` is a RENDERED preview of
// the variant (not an input slot). Verified against Plainly's live v2 catalog +
// their official MCP server.
type RawDesignExample = { videoUrl?: string; thumbnailUrl?: string };
type RawDesignVariant = {
  id?: string;
  name?: string;
  aspectRatio?: string;
  duration?: number;
  /** Verified live: an OBJECT keyed by palette (BLACK/BLUE/GREEN/…), each a
   *  rendered preview of the variant — NOT an array. */
  examples?: Record<string, RawDesignExample>;
};
type RawDesign = {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  /** A single representative preview for the whole design (verified live). */
  defaultExample?: RawDesignExample;
  variants?: RawDesignVariant[];
};

/** First preview out of a variant's palette-keyed `examples` map. */
function firstExample(
  examples?: Record<string, RawDesignExample>,
): RawDesignExample | undefined {
  for (const v of Object.values(examples ?? {})) return v;
  return undefined;
}

/** GET /api/v2/designs → the live ready-made-design catalog. Tolerates both a bare
 *  array and a `{ designs: [...] }` envelope. */
async function fetchLiveDesigns(): Promise<RawDesign[]> {
  const json = (await plainlyFetch("/designs")) as
    | RawDesign[]
    | { designs?: RawDesign[] };
  return Array.isArray(json) ? json : (json.designs ?? []);
}

/** Confirm + enrich the pinned curated designs against the live catalog. */
async function enrichDesigns(): Promise<PlainlyDesign[]> {
  // No key → offline: pinned list, no previews.
  if (!env.PLAINLY_API_KEY) return PLAINLY_DESIGNS;
  let live: RawDesign[];
  try {
    live = await fetchLiveDesigns();
  } catch (err) {
    log.warn("live design catalog unavailable — using pinned designs", {
      err: String(err),
    });
    return PLAINLY_DESIGNS;
  }
  const liveById = new Map(
    live.filter((d): d is RawDesign & { id: string } => Boolean(d.id)).map(
      (d) => [d.id, d],
    ),
  );
  const enriched: PlainlyDesign[] = [];
  for (const d of PLAINLY_DESIGNS) {
    const lv = liveById.get(d.projectId);
    if (!lv) continue; // curated id no longer in the catalog → drop (availability proof)
    const lvByVariant = new Map(
      (lv.variants ?? [])
        .filter((v): v is RawDesignVariant & { id: string } => Boolean(v.id))
        .map((v) => [v.id, v]),
    );
    const variants = d.variants.map((v) => {
      const lvar = lvByVariant.get(v.templateId);
      const ex = firstExample(lvar?.examples) ?? lv.defaultExample;
      return {
        ...v,
        durationSec:
          typeof lvar?.duration === "number" ? lvar.duration : v.durationSec,
        previewUrl: ex?.videoUrl ?? null,
        thumbnailUrl: ex?.thumbnailUrl ?? null,
      };
    });
    enriched.push({ ...d, category: lv.category ?? d.category, variants });
  }
  // Empty intersection (catalog renamed everything) → don't strand the user.
  return enriched.length ? enriched : PLAINLY_DESIGNS;
}

export function createPlainlyProvider(): PlainlyProvider {
  return {
    listDesigns(): PlainlyDesign[] {
      return PLAINLY_DESIGNS;
    },

    listDesignsEnriched(): Promise<PlainlyDesign[]> {
      return enrichDesigns();
    },

    async getTemplate(projectId, templateId): Promise<PlainlyTemplate> {
      // Curated public design → pinned schema (no live templates endpoint).
      if (isDesignId(projectId)) {
        return {
          templateId,
          params: MEDIA_DESIGN_PARAMS,
          raw: { design: projectId, templateId },
        };
      }
      const json = (await plainlyFetch(
        `/projects/${encodeURIComponent(projectId)}/templates/${encodeURIComponent(templateId)}`,
      )) as { id?: string; layers?: RawLayer[] };
      // One param can drive multiple layers (same name appears N times) — dedupe
      // by name so the UI shows one control each + keys stay unique.
      const byName = new Map<string, PlainlyTemplateParam>();
      for (const layer of Array.isArray(json.layers) ? json.layers : []) {
        const param = toParam(layer);
        if (param && !byName.has(param.name)) byName.set(param.name, param);
      }
      const params = [...byName.values()];
      return { templateId: String(json.id ?? templateId), params, raw: json };
    },

    async submitRender(input): Promise<PlainlyRender> {
      const body = {
        projectId: input.projectId,
        templateId: input.templateId,
        parameters: input.parameters,
        ...(input.webhook ? { webhook: input.webhook } : {}),
      };
      log.info("submit render", {
        projectId: input.projectId,
        templateId: input.templateId,
        params: Object.keys(input.parameters).join(","),
      });
      const json = (await plainlyFetch("/renders", {
        method: "POST",
        body: JSON.stringify(body),
      })) as RawRender;
      if (!json.id) {
        throw new Error(
          `Plainly submit returned no render id: ${JSON.stringify(json).slice(0, 300)}`,
        );
      }
      log.info("render created", { renderId: json.id, state: json.state });
      return toRender(json);
    },

    async pollRender(renderId): Promise<PlainlyRender> {
      const json = (await plainlyFetch(
        `/renders/${encodeURIComponent(renderId)}`,
      )) as RawRender;
      const r = toRender(json);
      log.debug("poll render", { renderId, state: r.rawState });
      return r;
    },

    async downloadOutput(url): Promise<{ bytes: Uint8Array; mime: string }> {
      const res = await fetchWithRetry(url, {}, { label: "plainly output" });
      if (!res.ok) {
        throw new Error(`Plainly output download failed: ${res.status}`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = res.headers.get("content-type") ?? "video/mp4";
      return { bytes, mime };
    },
  };
}
