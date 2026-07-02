"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FilmIcon,
  Loader2Icon,
  SparklesIcon,
  StarIcon,
  TriangleAlertIcon,
  Wand2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  acceptPlainlyClip,
  fetchPlainlyDesigns,
  fetchPlainlyTemplates,
  fetchRun,
  finalizePlainly,
  type PlainlyDesign,
  type PlainlyTemplateParam,
  type PlainlyTemplates,
  pollPlainlyRender,
  skipPlainly,
  submitPlainlyRender,
} from "@/lib/api";

/** Plainly's public catalog — linked so users can browse every ready-made design. */
const PLAINLY_CATALOG_URL = "https://www.plainlyvideos.com/templates";

/** A run clip the user can brand (newest asset per segment index). */
interface Clip {
  segmentIndex: number;
  url: string;
  branded: boolean;
}

/** True for a template parameter that takes a video footage URL (the clip slot). */
function isVideoParam(p: PlainlyTemplateParam): boolean {
  return (
    (p.layerType ?? "").toUpperCase() === "MEDIA" &&
    (p.mediaType ?? "").toLowerCase() === "video"
  );
}

/** Turn a raw template layer name into a readable label (YourProduct → Your Product). */
function humanizeLabel(name: string): string {
  return (
    name
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || name
  );
}

/** Template-internal / noise params hidden from the primary list — colors, media
 *  (image/logo/music) URL slots, and junk layer names (Null1, BG layer, empty text,
 *  price codes, lorem-ipsum body text). Keeps the demo to just real text fields. */
function isNoiseParam(p: PlainlyTemplateParam): boolean {
  const t = (p.layerType ?? "").toUpperCase();
  if (t === "MEDIA" || t === "SOLID_COLOR" || t === "COLOR") return true;
  const n = p.name;
  if (n.length > 24) return true; // lorem-ipsum-style body text
  return (
    /^(null\d*|bg.?layer|emptytextlayer|mixkit)$/i.test(n) ||
    /^p[0-9a-f]{3,}$/i.test(n) // price codes / hashes
  );
}

/** Newest-per-segmentIndex segment clips, with their branded flag. */
function clipsFromRun(run: RunDetail): Clip[] {
  const byIndex = new Map<number, Clip & { createdAt: string }>();
  for (const a of run.assets) {
    if (a.kind !== "segment_video") continue;
    const idx = Number(a.meta?.segmentIndex ?? Number.NaN);
    if (Number.isNaN(idx)) continue;
    const prev = byIndex.get(idx);
    if (!prev || a.createdAt > prev.createdAt) {
      byIndex.set(idx, {
        segmentIndex: idx,
        url: a.url,
        branded: a.meta?.plainly === true,
        createdAt: a.createdAt,
      });
    }
  }
  return [...byIndex.values()].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/** Pick the variant that matches the run's aspect ratio (Story for 9:16). */
function defaultVariantId(design: PlainlyDesign, aspect: string): string {
  const want = aspect === "9:16" ? "STORY" : "SQUARE";
  const match = design.variants.find((v) => v.aspectRatio === want);
  return (match ?? design.variants[0])?.templateId ?? "";
}

/** The preview MP4 to show on a design card — the variant matching the run's
 *  aspect if it has one, else the first variant with any preview. */
function designPreview(design: PlainlyDesign, aspect: string): string | null {
  const want = aspect === "9:16" ? "STORY" : "SQUARE";
  const match = design.variants.find(
    (v) => v.aspectRatio === want && v.previewUrl,
  );
  return (
    match?.previewUrl ??
    design.variants.find((v) => v.previewUrl)?.previewUrl ??
    null
  );
}

/** True when a design is tagged for the run's ad type — drives the "Recommended" badge. */
function isRecommended(design: PlainlyDesign, adType: string): boolean {
  return Boolean(adType) && (design.suggestedAdTypes ?? []).includes(adType);
}

/** Seed the parameter map for a clip: image = this clip, keep prior values. */
function seedParams(
  t: PlainlyTemplates,
  clipUrl: string,
  prior: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const p of t.params) {
    if (isVideoParam(p)) {
      next[p.name] = clipUrl;
      continue;
    }
    next[p.name] = prior[p.name] ?? p.defaultValue ?? "";
  }
  return next;
}

export function PlainlyEditView({ runId }: { runId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const runKey = ["run", runId] as const;

  const { data: run, isPending } = useQuery({
    queryKey: runKey,
    queryFn: () => fetchRun(runId),
    retry: (count) => count < 2,
  });
  const { data: designs } = useQuery({
    queryKey: ["plainly-designs"],
    queryFn: fetchPlainlyDesigns,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Which clip is being branded (its segmentIndex), or null at the gallery.
  const [editing, setEditing] = useState<Clip | null>(null);
  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState<PlainlyTemplates | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  // Original clip voice. ON (default) keeps the Seedance voice; OFF mutes the clip
  // so the rendered template has only its own audio.
  const [muteClipAudio, setMuteClipAudio] = useState(false);

  const clips = useMemo(() => (run ? clipsFromRun(run) : []), [run]);

  // Designs the run's ad type suits first, so the best fit is easy to spot.
  const sortedDesigns = useMemo(() => {
    const list = designs ?? [];
    const adType = run?.adType ?? "";
    return [...list].sort(
      (a, b) =>
        Number(isRecommended(b, adType)) - Number(isRecommended(a, adType)),
    );
  }, [designs, run?.adType]);

  async function loadTemplate(
    pid: string,
    tid: string,
    clipUrl: string,
    prior: Record<string, string>,
  ): Promise<void> {
    setLoadingTemplate(true);
    setTemplateError(null);
    try {
      const t = await fetchPlainlyTemplates(runId, pid, tid);
      setTemplate(t);
      setProjectId(t.projectId ?? pid);
      setTemplateId(t.templateId ?? tid);
      setParams(seedParams(t, clipUrl, prior));
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : "Failed to load the template.",
      );
    } finally {
      setLoadingTemplate(false);
    }
  }

  function startEditing(clip: Clip): void {
    if (!run || !designs?.length) return;
    setEditing(clip);
    setRenderId(null);
    setShowOptional(false);
    // Restore prior branding for this segment, else default design + matching format.
    const prior = run.plainlyEdit?.segments?.[String(clip.segmentIndex)];
    setMuteClipAudio(prior?.muteClipAudio ?? false);
    const pid = prior?.projectId ?? designs[0].projectId;
    const design = designs.find((d) => d.projectId === pid) ?? designs[0];
    const tid = prior?.templateId ?? defaultVariantId(design, run.aspectRatio);
    void loadTemplate(pid, tid, clip.url, prior?.params ?? {});
  }

  function closeEditing(): void {
    setEditing(null);
    setRenderId(null);
    setTemplate(null);
  }

  const renderStatus = useQuery({
    queryKey: ["plainly-render", runId, renderId],
    queryFn: () => pollPlainlyRender(runId, renderId as string),
    enabled: Boolean(renderId),
    refetchInterval: (query) =>
      query.state.data?.state === "processing" ? 4000 : false,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      acceptPlainlyClip(runId, {
        renderId: renderId as string,
        segmentIndex: editing?.segmentIndex as number,
        projectId,
        templateId,
        parameters: params,
        muteClipAudio,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(runKey, detail);
      toast.success(`Segment ${(editing?.segmentIndex ?? 0) + 1} branded`);
      closeEditing();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn’t accept."),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizePlainly(runId),
    onSuccess: (detail) => {
      queryClient.setQueryData(runKey, detail);
      toast.message("Merging your clips…");
      router.push(`/studio/${runId}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn’t finish."),
  });

  const skipMutation = useMutation({
    mutationFn: () => skipPlainly(runId),
    onSuccess: (detail) => {
      queryClient.setQueryData(runKey, detail);
      toast.message("Merging the raw clips…");
      router.push(`/studio/${runId}`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn’t skip."),
  });

  async function submitRender(): Promise<void> {
    if (!projectId || !templateId) {
      toast.error("Pick a template first.");
      return;
    }
    setSubmitting(true);
    try {
      const { renderId: rid } = await submitPlainlyRender(runId, {
        projectId,
        templateId,
        parameters: params,
        muteClipAudio,
      });
      setRenderId(rid);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn’t start the render.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function setParam(name: string, value: string): void {
    setParams((prev) => ({ ...prev, [name]: value }));
  }

  if (isPending || !run) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (run.status !== "awaiting_edit") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <TriangleAlertIcon className="text-muted-foreground size-8" />
          <div>
            <h2 className="font-semibold">Not awaiting a Plainly edit</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              This run isn’t paused for Plainly
              {run.status === "completed" ? " — it’s already finished." : "."}
            </p>
          </div>
          <Button asChild variant="brand">
            <Link href={`/studio/${runId}`}>Back to the chat</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const brandedCount = clips.filter((c) => c.branded).length;
  const selectedDesign = designs?.find((d) => d.projectId === projectId);
  const state = renderStatus.data?.state;
  const rendering =
    submitting ||
    state === "processing" ||
    (Boolean(renderId) && !renderStatus.data);
  const previewUrl =
    state === "completed" ? renderStatus.data?.previewUrl : null;
  const renderError = state === "failed" ? renderStatus.data?.error : null;

  // Clip slot is implicit (auto-filled). Show real text fields up front; tuck
  // colors / media URLs / internal layer noise under an "advanced" toggle.
  const controls = (template?.params ?? []).filter((p) => !isVideoParam(p));
  const primary = controls.filter((p) => !isNoiseParam(p));
  const extra = controls.filter(isNoiseParam);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2Icon className="text-brand size-5" />
          <h1 className="text-lg font-semibold">Customize with Plainly</h1>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/studio/${runId}`}>
            <ArrowLeftIcon className="size-4" />
            Back
          </Link>
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Wrap any of your {clips.length} clips in a ready-made template
        (headline, logo, brand colors). The branded clip replaces that segment;
        the rest stay raw. Then merge them all into your final video.{" "}
        <a
          href={PLAINLY_CATALOG_URL}
          target="_blank"
          rel="noreferrer"
          className="text-brand inline-flex items-center gap-0.5 hover:underline"
        >
          Browse all templates on Plainly
          <ExternalLinkIcon className="size-3" />
        </a>
      </p>

      {run.aspectRatio === "16:9" && (
        <div className="border-amber-500/40 bg-amber-500/5 text-muted-foreground flex items-start gap-2 rounded-xl border px-3 py-2 text-xs">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          These templates render square or vertical — in a 16:9 video the
          branded clips will be letterboxed.
        </div>
      )}

      {/* Clip gallery */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {clips.map((clip) => (
          <Card
            key={clip.segmentIndex}
            className={
              editing?.segmentIndex === clip.segmentIndex
                ? "border-brand/60"
                : undefined
            }
          >
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Segment {clip.segmentIndex + 1}
                </span>
                {clip.branded ? (
                  <span className="border-brand/40 bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                    <SparklesIcon className="size-3" /> Branded
                  </span>
                ) : (
                  <span className="border-border/60 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium">
                    Raw
                  </span>
                )}
              </div>
              {/* biome-ignore lint/a11y/useMediaCaption: generated clip preview */}
              <video
                src={clip.url}
                controls
                muted
                className="bg-media max-h-56 w-full rounded-lg object-contain"
              />
              <Button
                variant={clip.branded ? "outline" : "brand"}
                size="sm"
                onClick={() => startEditing(clip)}
                disabled={!designs?.length}
              >
                <Wand2Icon className="size-4" />
                {clip.branded ? "Re-brand" : "Brand this clip"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-clip editor */}
      {editing && (
        <Card className="border-brand/40">
          <CardContent className="flex flex-col gap-4 py-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Branding segment {editing.segmentIndex + 1}
              </h2>
              <Button variant="ghost" size="sm" onClick={closeEditing}>
                Close
              </Button>
            </div>

            {/* Template picker — card grid with live previews from Plainly */}
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.12em] uppercase">
                Template
              </span>
              {sortedDesigns.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No templates available — check the Plainly connection.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sortedDesigns.map((d) => {
                    const active = d.projectId === projectId;
                    const preview = designPreview(d, run.aspectRatio);
                    const recommended = isRecommended(d, run.adType);
                    return (
                      <button
                        key={d.projectId}
                        type="button"
                        onClick={() =>
                          void loadTemplate(
                            d.projectId,
                            defaultVariantId(d, run.aspectRatio),
                            editing.url,
                            params,
                          )
                        }
                        className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${
                          active
                            ? "border-brand ring-brand/30 ring-2"
                            : "border-border/60 hover:border-brand/50"
                        }`}
                      >
                        <div className="bg-media relative aspect-square w-full overflow-hidden">
                          {preview ? (
                            <video
                              src={preview}
                              muted
                              loop
                              playsInline
                              autoPlay
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="text-muted-foreground flex size-full items-center justify-center">
                              <FilmIcon className="size-6" />
                            </div>
                          )}
                          {recommended && (
                            <span className="bg-brand text-background absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
                              <StarIcon className="size-2.5" /> Recommended
                            </span>
                          )}
                          {active && (
                            <span className="bg-brand text-background absolute top-1.5 right-1.5 rounded-full p-0.5">
                              <CheckCircle2Icon className="size-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 p-2">
                          <span className="text-xs font-semibold">
                            {d.name}
                          </span>
                          {d.description && (
                            <span className="text-muted-foreground line-clamp-2 text-[10px] leading-snug">
                              {d.description}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Format variant (aspect + duration) */}
            {selectedDesign && (
              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.12em] uppercase">
                  Format
                </span>
                <Select
                  value={templateId || undefined}
                  onValueChange={(tid) =>
                    void loadTemplate(projectId, tid, editing.url, params)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedDesign.variants.map((v) => (
                      <SelectItem key={v.templateId} value={v.templateId}>
                        {v.label} · {v.durationSec}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* What exactly gets applied — makes it clear it's deterministic. */}
            {selectedDesign && templateId && (
              <p className="text-muted-foreground text-xs">
                Segment {editing.segmentIndex + 1} will be wrapped with{" "}
                <span className="text-foreground font-medium">
                  {selectedDesign.name}
                </span>{" "}
                <span className="font-mono text-[10px]">
                  ({projectId}/{templateId})
                </span>
                .
              </p>
            )}
            {templateError && (
              <span className="text-destructive text-xs">{templateError}</span>
            )}

            {/* Primary text controls */}
            {primary.map((p) => (
              <ParamInput
                key={p.name}
                param={p}
                value={params[p.name] ?? ""}
                onChange={(v) => setParam(p.name, v)}
              />
            ))}
            {template && primary.length === 0 && (
              <p className="text-muted-foreground text-xs">
                This template has no plain text fields to edit.
              </p>
            )}

            {/* Advanced — colors, media URLs, internal layers */}
            {extra.length > 0 && (
              <div className="border-border/50 flex flex-col gap-3 rounded-xl border border-dashed p-3">
                <button
                  type="button"
                  onClick={() => setShowOptional((v) => !v)}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium"
                >
                  <ChevronDownIcon
                    className={`size-3.5 transition-transform ${showOptional ? "" : "-rotate-90"}`}
                  />
                  More fields — colors, media, advanced ({extra.length})
                </button>
                {showOptional && (
                  <>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Blank text/colors are hidden in the render. Image/logo
                      URLs replace the template’s built-in default. A{" "}
                      <span className="text-foreground font-medium">music</span>{" "}
                      URL becomes the clip’s only audio — the template’s default
                      song and the clip’s own voice are both removed. (The
                      in-app preview is the raw template render; the saved clip
                      uses only your music.)
                    </p>
                    {extra.map((p) => (
                      <ParamInput
                        key={p.name}
                        param={p}
                        value={params[p.name] ?? ""}
                        onChange={(v) => setParam(p.name, v)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Original-voice toggle — OFF mutes the clip so only the template's
                audio is in the render. Toggling invalidates the current preview. */}
            <div className="border-border/60 flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
              <div className="flex flex-col">
                <span className="text-xs font-medium">Original voice</span>
                <span className="text-muted-foreground text-[11px]">
                  {muteClipAudio
                    ? "Off — only the template’s audio plays"
                    : "On — keep the clip’s spoken audio"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!muteClipAudio}
                aria-label="Keep the clip’s original voice"
                onClick={() => {
                  setMuteClipAudio((v) => !v);
                  setRenderId(null); // preview no longer matches → force a re-render
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  muteClipAudio ? "bg-border" : "bg-brand"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
                    muteClipAudio ? "left-0.5" : "left-[18px]"
                  }`}
                />
              </button>
            </div>

            <div>
              <Button
                variant="brand"
                size="sm"
                onClick={submitRender}
                disabled={rendering || loadingTemplate || !templateId}
              >
                {rendering ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Wand2Icon className="size-4" />
                )}
                {renderId ? "Render again" : "Render preview"}
              </Button>
            </div>

            {/* Render status / preview */}
            {renderId && (
              <div className="flex flex-col gap-3">
                {rendering && (
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2Icon className="size-4 animate-spin" />
                    Rendering…{" "}
                    <span className="font-mono text-xs">
                      {renderStatus.data?.rawState ?? "submitting"}
                    </span>
                  </div>
                )}
                {renderError && (
                  <div className="border-destructive/40 bg-destructive/5 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <TriangleAlertIcon className="text-destructive size-4 shrink-0" />
                    <span className="text-muted-foreground">{renderError}</span>
                  </div>
                )}
                {previewUrl && (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2Icon className="text-success size-4" />
                      Preview ready
                    </div>
                    {/* biome-ignore lint/a11y/useMediaCaption: generated ad preview */}
                    <video
                      src={previewUrl}
                      controls
                      className="bg-media mx-auto max-h-[70vh] w-full rounded-xl border object-contain"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => acceptMutation.mutate()}
                        disabled={acceptMutation.isPending}
                      >
                        {acceptMutation.isPending ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2Icon className="size-4" />
                        )}
                        Use for segment {editing.segmentIndex + 1}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={submitRender}
                        disabled={rendering}
                      >
                        Render again
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Finish actions */}
      <div className="flex flex-col items-center gap-2 border-t pt-5">
        <Button
          variant="brand"
          onClick={() => finalizeMutation.mutate()}
          disabled={finalizeMutation.isPending || skipMutation.isPending}
        >
          {finalizeMutation.isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <FilmIcon className="size-4" />
          )}
          Merge &amp; finish
          {brandedCount > 0 ? ` (${brandedCount} branded)` : ""}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => skipMutation.mutate()}
          disabled={skipMutation.isPending || finalizeMutation.isPending}
        >
          Skip Plainly — merge the raw clips
        </Button>
      </div>
    </div>
  );
}

/** One template parameter control (clip slot is handled outside). */
function ParamInput({
  param,
  value,
  onChange,
}: {
  param: PlainlyTemplateParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const isMedia = (param.layerType ?? "").toUpperCase() === "MEDIA";
  const placeholder = isMedia
    ? `${param.mediaType ?? "media"} URL`
    : param.name.toLowerCase().includes("color")
      ? "#hex"
      : "text";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-xs font-medium">
        {humanizeLabel(param.name)}
        {param.mandatory && <span className="text-destructive">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border/60 bg-background/40 focus:border-brand/50 w-full rounded-xl border px-3 py-2 text-sm outline-none"
      />
    </div>
  );
}
