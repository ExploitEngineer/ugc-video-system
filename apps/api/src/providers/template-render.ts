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
   * Where this layer's source time 0 sits on ITS composition's timeline. For a
   * nested comp, adding this to a child layer's time converts the child into the
   * parent's clock — which is how `timeline.ts` resolves a placeholder buried
   * three comps deep into an absolute window on the main composition.
   */
  start_time?: number;
  /** When the layer becomes visible, on its own composition's timeline. */
  in_point?: number;
  /** When it stops being visible, same clock. */
  out_point?: number;
  /**
   * Undocumented parser metadata (`additionalProperties: true`). EMPTY (`{}`) on
   * every layer of every real project we have introspected — no font, no size,
   * no timing. Do not build on it; `scripts/inspect-nexrender-layers.ts` dumps
   * it if that ever changes.
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
      /** Used when `layerIndex` is absent, and kept for logs regardless. */
      layerName: string;
      /**
       * 1-based stacking index. Present when the layer has no name of its own —
       * the usual case for a designer's footage placeholder — because Nexrender
       * matches the STORED name, and an unnamed layer has none. Sent INSTEAD of
       * `layerName`, never alongside it.
       */
      layerIndex?: number;
      src: string;
    }
  | { kind: "text"; composition: string; layerName: string; value: string }
  /**
   * Scale an injected layer to its composition. Our generated media rarely
   * matches the designer's layer exactly — the aspect is clamped for the image
   * model, and Seedance only renders 16:9 or 9:16 — so without this the layer
   * keeps the SOURCE's dimensions and sits at the wrong size in the frame.
   *
   * `fill` covers the composition and crops the overflow; `fit` letterboxes.
   * Fill, always: cropped edges beat black bars in an ad.
   *
   * ONLY for a layer with a real name: `nx:layer-autoscale` takes a `layerName`
   * and offers no index form, so an unnamed layer cannot be autoscaled. Its
   * media is pre-sized to the original source's dimensions instead, which keeps
   * the layer's authored transform correct.
   *
   * ORDER MATTERS. Nexrender applies assets in array order, so this must come
   * AFTER the media asset it scales, or it scales the placeholder that is about
   * to be replaced.
   */
  | {
      kind: "autoscale";
      composition: string;
      layerName: string;
      fit: "fill" | "fit";
    };

// NOTE: there is deliberately no `compDuration` variant. Nothing trims the
// composition. Each video slot receives a slice of the master cut to that slot's
// own length, so a 30s template renders 30 seconds with its outro intact.

export interface TemplateRenderInput {
  /** Nexrender Cloud template id (from `registerTemplate`). */
  nexrenderTemplateId: string;
  /** The composition to render (goes in the job's `template.composition`). */
  composition: string;
  /** The resolved assets to inject (media swaps + text). */
  assets: TemplateJobAssetInput[];
  /** Stable tag for logs + idempotency (the runId, or the templateId). */
  referenceTag?: string;
  /**
   * This render is the template library's own preview, not a user's ad.
   *
   * It changes NOTHING about the job we submit: the library's preview is an
   * ordinary render whose `assets` array is empty, so the template composites its
   * own placeholder content. The flag exists so the stub provider can hand back a
   * canned clip rather than pretend to composite, and so the logs say which of
   * the two kinds of render this was.
   *
   * It is NOT Nexrender's `preview` parameter, which we never send: that one
   * truncates the output — a 12.03s template came back as 3.7 seconds — and the
   * library card would then misreport how long the template runs. Hence the
   * name: this is the library's preview, not the renderer's.
   *
   * Rendering a preview is also a genuine validation gate. It is the same
   * template through the same engine, so if the preview fails, the deliverable
   * would too.
   */
  libraryPreview?: boolean;
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

/** A spooled upload on local disk, streamed to the provider from there. */
export interface TemplateUploadFile {
  path: string;
  size: number;
  contentType: string;
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
   * Upload the project to the presigned target from `registerTemplate`.
   * Nexrender's documented flow: a raw-body PUT sending ONLY `Content-Type`
   * (its presigned URL signs `host` only, so any extra `x-amz-*` header is
   * rejected). Runs server-side — the object store blocks cross-origin browser
   * uploads, and the bytes must never touch our own storage.
   *
   * Takes a PATH, not bytes: a Collect Files archive is hundreds of megabytes
   * and is streamed off disk so the heap never holds it.
   */
  uploadTemplateFile(
    target: TemplateUploadTarget,
    file: TemplateUploadFile,
  ): Promise<void>;
  /**
   * Remove a registered template from the provider.
   *
   * Called for a template we are throwing away — one the provider could not
   * parse, one our own validation refuses, or one the admin deleted. A project
   * we will never render has no business occupying the provider's store.
   *
   * Idempotent from our side: a template that is already gone is a success, not
   * an error. It throws only when the provider REFUSES (e.g. an active job still
   * holds the template), because the caller must not then forget the id.
   */
  deleteTemplate(templateId: string): Promise<void>;
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
