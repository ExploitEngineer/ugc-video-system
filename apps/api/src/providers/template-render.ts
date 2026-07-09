// Shared template-render boundary — After Effects template rendering via Nexrender.
//
// SEPARATE from the VideoProvider boundary (`./video.ts`): that one is
// prompt-driven Seedance generation; this one introspects a designed .aep
// template and composites assets into it. The Template Agent depends on this
// interface only, never on the Nexrender REST shape, so the renderer stays
// swappable (and stubbable for local tests). Async: register a template →
// introspect → submit a render job → poll until ready.

/**
 * Raw Nexrender v3 composition object (from GET …/templates/{id}/compositions).
 * `duration` (seconds) and `frame_rate` are returned by the API today; they are
 * what let the pipeline generate a clip as long as the template rather than a
 * fixed 15s.
 */
export interface NexComposition {
  aeid: string | number;
  name: string;
  width?: number;
  height?: number;
  duration?: number;
  frame_rate?: number;
  /** Undocumented parser metadata (`additionalProperties: true`). */
  data?: Record<string, unknown>;
}

/**
 * Raw Nexrender v3 layer object (from GET …/templates/{id}/layers).
 * The `top`/`left`/`width`/`height` box is what sizes a generated image to its
 * slot and separates an icon-sized logo layer from a full-bleed backdrop.
 */
export interface NexLayer {
  composition_id: number | string;
  aeid: number;
  name: string;
  layer_type: string | null;
  source_type: string | null;
  source_comp_id: number | null;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
  /**
   * Undocumented parser metadata (`additionalProperties: true`). May carry a
   * text layer's font/size — Nexrender documents neither, and no endpoint
   * reports which fonts a template needs. Probed defensively via `extractFont`
   * and dumped by `scripts/inspect-nexrender-layers.ts`.
   */
  data?: Record<string, unknown>;
}

/** The raw introspection of a registered template, once Nexrender has parsed it. */
export interface TemplateStructureRaw {
  /** Nexrender template status (`processing` | `uploaded` | `error` | …). */
  status: string;
  compositions: NexComposition[];
  layers: NexLayer[];
}

/**
 * One resolved asset a render job injects. A media swap targets a layer by
 * composition+layerName with a URL; a text asset carries a value the provider
 * turns into an `nx:text-params-set` function asset (works across nested comps).
 */
export type TemplateJobAssetInput =
  | {
      kind: "media";
      mediaType: "video" | "image" | "audio";
      composition: string;
      layerName: string;
      src: string;
    }
  | { kind: "text"; composition: string; layerName: string; value: string };

export interface TemplateRenderInput {
  /** Nexrender Cloud template id (from `registerTemplate`). */
  nexrenderTemplateId: string;
  /** The composition to render (goes in the job's `template.composition`). */
  composition: string;
  /** The resolved assets to inject (media swaps + text). */
  assets: TemplateJobAssetInput[];
  /** Stable tag for logs + idempotency (the runId). */
  referenceTag?: string;
}

export interface TemplateRenderTask {
  /** Provider job id — persisted (`runs.nexrenderJobId`) for idempotent resume. */
  jobId: string;
}

export type TemplateRenderState = "processing" | "completed" | "failed";

export interface TemplateRenderResult {
  state: TemplateRenderState;
  /** Raw provider status behind the coarse `state`, surfaced for logs. */
  status?: string;
  /** Present when `state === "completed"` — the Nexrender-hosted output mp4. */
  videoUrl?: string;
  /**
   * Present when the render also emitted the MODIFIED project file — the
   * editable `.aep` Nexrender produced. Captured + re-hosted alongside the mp4
   * when available (best-effort; not every job/plan returns one).
   */
  projectUrl?: string;
  error?: string;
}

/** A user-uploaded template project to register with the renderer. Only metadata
 *  is sent — the project BYTES upload separately (browser → the presigned
 *  `upload` target the register returns), never through this call. */
export interface TemplateRegisterInput {
  filename: string;
  displayName: string;
  type: "aep" | "zip" | "mogrt";
}

/**
 * A presigned target the raw project bytes are uploaded to (browser-direct, or
 * our server-side fallback). Kept off Supabase entirely — the file goes straight
 * to the renderer's own object store.
 */
export interface TemplateUploadTarget {
  url: string;
  method: "PUT" | "POST";
  /**
   * Nexrender's raw `uploadInfo.fields` map. Only `Content-Type` is actually
   * sent on the PUT — the presigned URL signs `host` only, so its other entries
   * (e.g. `x-amz-meta-custom`) MUST NOT be sent as headers or the store rejects
   * them (`MalformedSecurityHeader`).
   */
  fields: Record<string, string>;
}

export interface TemplateRegisterResult {
  /** The provider template id to reference in later calls. */
  templateId: string;
  /** Where to upload the project bytes. Absent for the stub (no upload needed). */
  upload?: TemplateUploadTarget;
}

export interface TemplateRenderProvider {
  /**
   * Register a user-uploaded template project → returns a provider template id.
   * Returns as soon as the upload is accepted; introspection is polled via
   * `getTemplateStructure` (not blocked on here).
   */
  registerTemplate(
    input: TemplateRegisterInput,
  ): Promise<TemplateRegisterResult>;
  /**
   * Upload the raw project bytes to the presigned target from `registerTemplate`.
   * Nexrender's documented flow: a raw-body PUT sending ONLY `Content-Type`
   * (its presigned URL signs `host` only, so any extra `x-amz-*` header is
   * rejected). Runs server-side — the object store blocks cross-origin browser
   * uploads, and the bytes must never touch our own storage.
   */
  uploadTemplateBytes(
    target: TemplateUploadTarget,
    bytes: Uint8Array,
  ): Promise<void>;
  /**
   * Fetch a registered template's raw structure (status + compositions + layers).
   * `status` is `processing` until Nexrender finishes introspecting.
   */
  getTemplateStructure(templateId: string): Promise<TemplateStructureRaw>;
  /** Submit a template render → returns a job to poll. */
  submitRender(input: TemplateRenderInput): Promise<TemplateRenderTask>;
  /** Poll a previously submitted render job. */
  pollRender(task: TemplateRenderTask): Promise<TemplateRenderResult>;
}
