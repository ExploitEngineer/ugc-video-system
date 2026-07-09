// Nexrender provider adapter — After Effects template rendering + v3 introspection.
//
// Adapter boundary: the Template Agent depends on the shared
// TemplateRenderProvider interface only (`../template-render.ts`), never on
// this REST shape, so the renderer is swappable. Nexrender Cloud runs AE
// server-side (the only viable host on a Linux stack) and is async: register a
// template → introspect (v2 register/render, v3 inspection) → submit a render
// job → poll the job id → outputUrl mp4.
//
// A STUB implementation lets the whole editor/render state machine run locally
// without a Nexrender account: it returns a canned structure and echoes the
// input clip as the render. The factory picks the stub when no API key is set
// or NEXRENDER_STUB=true.

import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";
import { createLogger } from "../../lib/log.js";
import { redactUrls } from "../../lib/run-failure.js";
import { STUB_PREVIEW_MP4_DATA_URL } from "./stub-preview.js";
import type {
  NexComposition,
  NexLayer,
  TemplateRegisterInput,
  TemplateRegisterResult,
  TemplateRenderInput,
  TemplateRenderProvider,
  TemplateRenderResult,
  TemplateRenderState,
  TemplateRenderTask,
  TemplateStructureRaw,
  TemplateUploadTarget,
} from "../template-render.js";

const log = createLogger("nexrender");

export type * from "../template-render.js";

/** Nexrender job statuses that mean "still working — keep polling". */
const PROCESSING_STATUSES = new Set([
  "created",
  "queued",
  "picked",
  "started",
  "rendering",
  "downloading",
  "uploading",
  "encoding",
]);
const FINISHED_STATUSES = new Set(["finished", "done", "success"]);
const FAILED_STATUSES = new Set(["error", "failed", "cancelled", "canceled"]);

function mapState(status: string): TemplateRenderState {
  if (FINISHED_STATUSES.has(status)) return "completed";
  if (FAILED_STATUSES.has(status)) return "failed";
  if (!PROCESSING_STATUSES.has(status)) {
    log.warn("unmapped Nexrender status — treating as processing", { status });
  }
  return "processing";
}

/** One Nexrender REST call. `version` selects `/api/v2` (register/render) or
 *  `/api/v3` (inspection). */
async function nexrenderFetch(
  path: string,
  init?: RequestInit,
  version: "v2" | "v3" = "v2",
): Promise<unknown> {
  const url = `${env.NEXRENDER_BASE_URL}/api/${version}${path}`;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = {
    Authorization: `Bearer ${env.NEXRENDER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    ...init?.headers,
  };
  const res = await fetchWithRetry(
    url,
    { ...init, headers },
    { label: `nexrender ${path}`, retryOnNetworkError: method === "GET" },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Nexrender ${path} failed: ${res.status} ${redactUrls(text).slice(0, 500)}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

/** Paginated v3 GET (limit max 1000; most templates fit one page). */
async function getAllV3<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = (await nexrenderFetch(
      `${path}?limit=1000&offset=${offset}`,
      undefined,
      "v3",
    )) as T[] | { data?: T[]; items?: T[] };
    const rows = Array.isArray(page) ? page : (page.data ?? page.items ?? []);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Raw Nexrender presigned-upload block (shape varies; read defensively). */
interface RawUploadInfo {
  url?: string;
  method?: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Normalize Nexrender's presigned-upload block into our `TemplateUploadTarget`. */
function toUploadTarget(raw: RawUploadInfo | undefined): TemplateUploadTarget | undefined {
  if (!raw?.url) return undefined;
  return {
    url: raw.url,
    // Nexrender documents the upload method as always PUT.
    method: (raw.method?.toUpperCase() as "PUT" | "POST") ?? "PUT",
    fields: raw.fields ?? {},
  };
}

/** Nexrender Cloud (hosted AE) implementation. */
function createNexrenderCloudProvider(): TemplateRenderProvider {
  return {
    async registerTemplate(
      input: TemplateRegisterInput,
    ): Promise<TemplateRegisterResult> {
      // Register WITHOUT a src — Nexrender returns a presigned upload target the
      // BROWSER PUTs the project bytes straight to (never through our server or
      // Supabase). Nexrender nests the id under `template.id`; the upload block
      // arrives as `uploadInfo` (top-level or under `template`).
      const created = (await nexrenderFetch("/templates", {
        method: "POST",
        body: JSON.stringify({
          type: input.type,
          displayName: input.displayName,
        }),
      })) as {
        id?: string;
        uploadInfo?: RawUploadInfo;
        template?: { id?: string; uploadInfo?: RawUploadInfo };
      };
      const templateId = created.template?.id ?? created.id;
      if (!templateId) {
        throw new Error(
          `Nexrender template create returned no id: ${JSON.stringify(created).slice(0, 400)}`,
        );
      }
      const upload = toUploadTarget(
        created.uploadInfo ?? created.template?.uploadInfo,
      );
      // Returns after upload; introspection is polled via getTemplateStructure
      // (status: awaiting_upload → processing → uploaded). Log the upload SHAPE
      // (keys only, never the signed URL) so a new account's fields are visible.
      log.info("template registered", {
        templateId,
        type: input.type,
        uploadMethod: upload?.method,
        fieldKeys: upload ? Object.keys(upload.fields).join(",") : "",
      });
      return { templateId, upload };
    },

    async uploadTemplateBytes(
      target: TemplateUploadTarget,
      bytes: Uint8Array,
    ): Promise<void> {
      // Nexrender's documented upload: a RAW-body PUT sending ONLY `Content-Type`.
      // The presigned URL signs `host` only, so its other `fields` entries (e.g.
      // `x-amz-meta-custom`) MUST NOT be sent as headers — the store rejects any
      // unsigned `x-amz-*` header (`MalformedSecurityHeader`). The object is a
      // single idempotent target, so a dropped socket is safe to retry; a large
      // .aep transfer gets a generous overall timeout.
      const res = await fetchWithRetry(
        target.url,
        {
          method: target.method,
          headers: {
            "Content-Type": target.fields["Content-Type"] ?? "application/octet-stream",
          },
          // fetch accepts a Uint8Array body at runtime; the cast sidesteps the
          // TS 5.7 `Uint8Array<ArrayBufferLike>` vs `BodyInit` generic mismatch.
          body: bytes as unknown as BodyInit,
        },
        {
          label: "nexrender template upload",
          retryOnNetworkError: true,
          attempts: 4,
          timeoutMs: 300_000,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Nexrender template upload failed: ${res.status} ${redactUrls(text).slice(0, 300)}`,
        );
      }
    },

    async getTemplateStructure(templateId: string): Promise<TemplateStructureRaw> {
      assertNotStubTemplate(templateId, "introspect against");
      const meta = (await nexrenderFetch(
        `/templates/${templateId}`,
        undefined,
        "v3",
      )) as { status?: string };
      const status = meta.status ?? "processing";
      if (status !== "uploaded") {
        return { status, compositions: [], layers: [] };
      }
      const [compositions, layers] = await Promise.all([
        getAllV3<NexComposition>(`/templates/${templateId}/compositions`),
        getAllV3<NexLayer>(`/templates/${templateId}/layers`),
      ]);
      return { status, compositions, layers };
    },

    async submitRender(input: TemplateRenderInput): Promise<TemplateRenderTask> {
      assertNotStubTemplate(input.nexrenderTemplateId, "submit a render to");
      const body = buildRenderJobBody(input);
      log.info("submit render", {
        run: input.referenceTag,
        template: input.nexrenderTemplateId,
        composition: input.composition,
        assets: "assets" in body ? body.assets.length : 0,
        preview: Boolean(input.preview),
      });
      const json = (await nexrenderFetch("/jobs", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { id?: string };
      if (!json.id) {
        throw new Error(`Nexrender submit returned no job id: ${JSON.stringify(json)}`);
      }
      log.info("job created", { run: input.referenceTag, jobId: json.id });
      return { jobId: json.id };
    },

    async pollRender(task: TemplateRenderTask): Promise<TemplateRenderResult> {
      const json = (await nexrenderFetch(`/jobs/${task.jobId}`)) as {
        status?: string;
        outputUrl?: string;
        // The MODIFIED project file, if the job/plan returns one. The exact key
        // isn't documented for our plan — read the likely candidates and log the
        // real result keys so a live render reveals which (if any) is present.
        projectUrl?: string;
        aepUrl?: string;
        project?: { url?: string } | string;
        error?: { message?: string } | string;
      };
      const status = json.status ?? "queued";
      const state = mapState(status);
      log.debug("poll", { jobId: task.jobId, status, state });
      if (state === "completed") {
        if (!json.outputUrl) {
          return {
            state: "failed",
            status,
            error: `Nexrender job ${task.jobId} finished but returned no outputUrl`,
          };
        }
        const projectUrl =
          json.projectUrl ??
          json.aepUrl ??
          (typeof json.project === "string" ? json.project : json.project?.url);
        log.info("render finished", {
          jobId: task.jobId,
          resultKeys: Object.keys(json).join(","),
          hasProject: Boolean(projectUrl),
        });
        return { state, status, videoUrl: json.outputUrl, projectUrl };
      }
      if (state === "failed") {
        const providerMsg =
          typeof json.error === "string" ? json.error : (json.error?.message ?? "");
        return {
          state,
          status,
          error: `Nexrender job ${task.jobId} ${status}${providerMsg ? `: ${providerMsg}` : ""}`,
        };
      }
      return { state, status };
    },
  };
}

// Stub jobId carries the clip URL so pollRender is restart-safe.
/** One entry of a Nexrender job's `assets` array. */
type NexJobAsset =
  | { type: string; composition: string; layerName: string; src: string }
  | {
      type: "function";
      name: string;
      params: Record<string, unknown>;
    };

export type NexJobBody =
  | {
      template: { id: string; composition: string };
      preview: true;
    }
  | {
      template: { id: string; composition: string };
      assets: NexJobAsset[];
      settings: { type: string; quality: string; codec: string };
    };

/**
 * Build the `POST /api/v2/jobs` body. Pure, so the payload shape is pinned by a
 * test rather than discovered in production.
 *
 * `preview` and `settings` are MUTUALLY EXCLUSIVE in the Nexrender API — sending
 * both is rejected. A preview job also carries NO assets, so the template
 * renders its own placeholder content at low resolution.
 */
export function buildRenderJobBody(input: TemplateRenderInput): NexJobBody {
  const template = {
    id: input.nexrenderTemplateId,
    composition: input.composition,
  };
  if (input.preview) return { template, preview: true };

  // The array order is PRESERVED: Nexrender applies assets in sequence, and an
  // `nx:layer-autoscale` must land after the media asset it scales.
  const assets: NexJobAsset[] = input.assets.map((a) => {
    switch (a.kind) {
      case "media":
        return {
          type: a.mediaType,
          composition: a.composition,
          layerName: a.layerName,
          src: a.src,
        };
      case "text":
        return {
          type: "function" as const,
          name: "nx:text-params-set",
          params: {
            composition: a.composition,
            layerName: a.layerName,
            textValue: a.value,
          },
        };
      case "autoscale":
        return {
          type: "function" as const,
          name: "nx:layer-autoscale",
          params: {
            composition: a.composition,
            layerName: a.layerName,
            type: a.fit,
          },
        };
    }
  });
  return {
    template,
    assets,
    settings: {
      type: "video",
      quality: "full",
      codec: "video_h264_vbr_15mbps",
    },
  };
}

/**
 * Every template id the STUB hands out starts with this.
 *
 * The cloud provider refuses to act on one (`assertNotStubTemplate`). Both the
 * run worker and the template worker claim rows from the DATABASE, so a second
 * process pointed at the same database — a `pnpm dev` server that hot-reloaded,
 * a rolling deploy, a stray instance — will happily pick up rows a stub-mode
 * process created. Without this guard, a process holding real credentials
 * submits a real, paid job for a template that only ever existed in a stub.
 * Real Nexrender ids are 26-char ULIDs (`^[A-Z0-9]{26}$`), so these can never
 * collide.
 */
export const STUB_TEMPLATE_ID_PREFIX = "stub-template-";

export function isStubTemplateId(id: string): boolean {
  return id.startsWith(STUB_TEMPLATE_ID_PREFIX);
}

function assertNotStubTemplate(id: string, op: string): void {
  if (!isStubTemplateId(id)) return;
  throw new Error(
    `Refusing to ${op} the real Nexrender API for stub template "${id}". ` +
      "This row was created by a stub-mode process; a real-credential process " +
      "is now driving it (two servers sharing one database). Set NEXRENDER_STUB=true " +
      "here, or delete the stub rows.",
  );
}

const STUB_PREFIX = "stub:";

/** Stub renderer — no Nexrender account needed. Canned structure + clip echo. */
function createStubTemplateRenderProvider(): TemplateRenderProvider {
  return {
    async registerTemplate(
      input: TemplateRegisterInput,
    ): Promise<TemplateRegisterResult> {
      log.warn("STUB — pretending to register template", { filename: input.filename });
      // No `upload` — the client skips the upload step and polls the canned
      // structure straight away.
      // Deliberately non-random: a stub template is a fixture, and the id must
      // be recognisable as one by `assertNotStubTemplate` in the cloud provider.
      return { templateId: `${STUB_TEMPLATE_ID_PREFIX}${input.type}` };
    },
    async uploadTemplateBytes(): Promise<void> {
      log.warn("STUB — skipping template upload (no real target)");
    },
    async getTemplateStructure(): Promise<TemplateStructureRaw> {
      // A REPRESENTATIVE template, not a minimal one: the stub is the only thing
      // that exercises `buildStructure` in local dev + the free smoke test, so
      // it deliberately contains every slot shape the classifier must get right.
      //
      //  - a 30s main comp, LONGER than the 15s master. Nothing gets trimmed:
      //    the graphics simply fill the timeline the footage does not cover.
      //  - THREE video slots as placeholder precomps whose child comps declare
      //    7s, 2s and 2s. This is the case the slice planner exists for.
      //  - an audio layer, so the master's voiceover has somewhere to live and
      //    the slices can be muted.
      //  - a logo image       → imageClass "brand"       → never AI-filled
      //  - a background image → imageClass "decorative"  → never AI-filled
      //  - a product still    → imageClass "content"     → generated
      //  - a placeholder precomp holding a STILL, which v1 misread as VIDEO
      //  - a text layer whose `data` bag carries a font, to exercise the probe
      return {
        status: "uploaded",
        compositions: [
          {
            aeid: 1,
            name: "main",
            width: 1920,
            height: 1080,
            duration: 30,
            frame_rate: 30,
          },
          // The child comps ARE the slot lengths. Only these carry a duration —
          // Nexrender's layers response has no time fields at all.
          { aeid: 2, name: "PH_HERO_comp", width: 1920, height: 1080, duration: 7 },
          { aeid: 3, name: "PH_CUT_A_comp", width: 960, height: 540, duration: 2 },
          { aeid: 4, name: "PH_CUT_B_comp", width: 960, height: 540, duration: 2 },
          { aeid: 5, name: "PH_STILL_comp", width: 640, height: 360 },
        ],
        layers: [
          // ── three video slots, each a placeholder precomp ──
          { composition_id: 1, aeid: 10, name: "PH_HERO", layer_type: "av", source_type: "comp", source_comp_id: 2, width: 1920, height: 1080 },
          { composition_id: 2, aeid: 11, name: "hero-clip.mp4", layer_type: "av", source_type: "file", source_comp_id: null, width: 1920, height: 1080 },
          { composition_id: 1, aeid: 12, name: "PH_CUT_A", layer_type: "av", source_type: "comp", source_comp_id: 3, width: 960, height: 540 },
          { composition_id: 3, aeid: 13, name: "cutaway-a.mp4", layer_type: "av", source_type: "file", source_comp_id: null, width: 960, height: 540 },
          { composition_id: 1, aeid: 14, name: "PH_CUT_B", layer_type: "av", source_type: "comp", source_comp_id: 4, width: 960, height: 540 },
          { composition_id: 4, aeid: 15, name: "cutaway-b.mp4", layer_type: "av", source_type: "file", source_comp_id: null, width: 960, height: 540 },

          // ── the template's own audio layer: takes the master's voiceover ──
          { composition_id: 1, aeid: 20, name: "voiceover.mp3", layer_type: "av", source_type: "file", source_comp_id: null },

          // ── text ──
          { composition_id: 1, aeid: 30, name: "Headline", layer_type: "text", source_type: null, source_comp_id: null, width: 1200, height: 120, data: { font: "Montserrat-SemiBold", fontSize: 72 } },
          { composition_id: 1, aeid: 31, name: "Subhead", layer_type: "text", source_type: null, source_comp_id: null, width: 900, height: 60 },

          // ── images: one of each class ──
          { composition_id: 1, aeid: 40, name: "logo.png", layer_type: "av", source_type: "file", source_comp_id: null, width: 180, height: 60 },
          { composition_id: 1, aeid: 41, name: "background.jpg", layer_type: "av", source_type: "file", source_comp_id: null, width: 1920, height: 1080 },
          { composition_id: 1, aeid: 42, name: "product-photo.jpg", layer_type: "av", source_type: "file", source_comp_id: null, width: 800, height: 800 },
          // A placeholder precomp holding a STILL — v1 called this VIDEO.
          { composition_id: 1, aeid: 43, name: "PH_STILL", layer_type: "av", source_type: "comp", source_comp_id: 5, width: 640, height: 360 },
          { composition_id: 5, aeid: 44, name: "hero-shot.jpg", layer_type: "av", source_type: "file", source_comp_id: null, width: 640, height: 360 },
        ],
      };
    },
    async submitRender(input: TemplateRenderInput): Promise<TemplateRenderTask> {
      // Echo the first media src (the generated clip) back as the "render".
      let clip = "";
      for (const a of input.assets) {
        if (a.kind === "media" && a.src) {
          clip = a.src;
          break;
        }
      }
      // A preview job carries no assets (the template renders its own
      // placeholder content), so there is no clip to echo. Hand back a real,
      // tiny MP4 instead: the preview stage then genuinely downloads it,
      // re-hosts it, and pulls a poster frame out of it, all for free.
      if (input.preview) {
        log.warn("STUB — returning a canned preview clip", {
          template: input.referenceTag,
        });
        return {
          jobId:
            STUB_PREFIX +
            Buffer.from(STUB_PREVIEW_MP4_DATA_URL).toString("base64url"),
        };
      }
      log.warn("STUB — echoing input clip as render output", {
        run: input.referenceTag,
      });
      return { jobId: STUB_PREFIX + Buffer.from(clip).toString("base64url") };
    },
    async pollRender(task: TemplateRenderTask): Promise<TemplateRenderResult> {
      const clipUrl = Buffer.from(
        task.jobId.slice(STUB_PREFIX.length),
        "base64url",
      ).toString("utf8");
      return { state: "completed", status: "finished", videoUrl: clipUrl };
    },
  };
}

/** Factory — stub when no API key or NEXRENDER_STUB=true; else Cloud. */
export function createNexrenderProvider(): TemplateRenderProvider {
  if (env.NEXRENDER_STUB || !env.NEXRENDER_API_KEY) {
    log.info("using STUB template renderer", {
      reason: env.NEXRENDER_STUB ? "NEXRENDER_STUB=true" : "no NEXRENDER_API_KEY",
    });
    return createStubTemplateRenderProvider();
  }
  return createNexrenderCloudProvider();
}
