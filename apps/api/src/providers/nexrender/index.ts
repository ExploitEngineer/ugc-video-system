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
      const assets = input.assets.map((a) =>
        a.kind === "text"
          ? {
              type: "function",
              name: "nx:text-params-set",
              params: {
                composition: a.composition,
                layerName: a.layerName,
                textValue: a.value,
              },
            }
          : {
              type: a.mediaType,
              composition: a.composition,
              layerName: a.layerName,
              src: a.src,
            },
      );
      const body = {
        template: { id: input.nexrenderTemplateId, composition: input.composition },
        assets,
        settings: { type: "video", quality: "full", codec: "video_h264_vbr_15mbps" },
      };
      log.info("submit render", {
        run: input.referenceTag,
        template: input.nexrenderTemplateId,
        composition: input.composition,
        assets: assets.length,
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
      return { templateId: `stub-template-${input.type}` };
    },
    async uploadTemplateBytes(): Promise<void> {
      log.warn("STUB — skipping template upload (no real target)");
    },
    async getTemplateStructure(): Promise<TemplateStructureRaw> {
      // A REPRESENTATIVE template, not a minimal one: the stub is the only thing
      // that exercises `buildStructure` in local dev + the free smoke test, so
      // it deliberately contains every slot shape the classifier must get right.
      //
      //  - a 12s comp (a real Seedance duration, and NOT the old hardcoded 15s)
      //  - one video slot (the render gate rejects a template without one)
      //  - a logo image      → imageClass "brand"      → never AI-filled
      //  - a background image → imageClass "decorative" → never AI-filled
      //  - a product still    → imageClass "content"    → generated
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
            duration: 12,
            frame_rate: 30,
          },
          { aeid: 2, name: "PH_1_comp", width: 640, height: 360 },
        ],
        layers: [
          {
            composition_id: 1,
            aeid: 10,
            name: "your-clip.mp4",
            layer_type: "av",
            source_type: "file",
            source_comp_id: null,
            width: 1920,
            height: 1080,
          },
          {
            composition_id: 1,
            aeid: 11,
            name: "Headline",
            layer_type: "text",
            source_type: null,
            source_comp_id: null,
            width: 1200,
            height: 120,
            data: { font: "Montserrat-SemiBold", fontSize: 72 },
          },
          {
            composition_id: 1,
            aeid: 12,
            name: "Subhead",
            layer_type: "text",
            source_type: null,
            source_comp_id: null,
            width: 900,
            height: 60,
          },
          {
            composition_id: 1,
            aeid: 13,
            name: "logo.png",
            layer_type: "av",
            source_type: "file",
            source_comp_id: null,
            width: 180,
            height: 60,
          },
          {
            composition_id: 1,
            aeid: 14,
            name: "background.jpg",
            layer_type: "av",
            source_type: "file",
            source_comp_id: null,
            width: 1920,
            height: 1080,
          },
          {
            composition_id: 1,
            aeid: 15,
            name: "product-photo.jpg",
            layer_type: "av",
            source_type: "file",
            source_comp_id: null,
            width: 800,
            height: 800,
          },
          {
            composition_id: 1,
            aeid: 16,
            name: "PH_1",
            layer_type: "av",
            source_type: "comp",
            source_comp_id: 2,
            width: 640,
            height: 360,
          },
          {
            composition_id: 2,
            aeid: 20,
            name: "hero-shot.jpg",
            layer_type: "av",
            source_type: "file",
            source_comp_id: null,
            width: 640,
            height: 360,
          },
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
