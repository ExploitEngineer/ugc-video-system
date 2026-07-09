"use client";

// Phase 1 of the template pipeline: upload an After Effects template + let
// Nexrender register/introspect it BEFORE any run or ad brief exists. This is
// the cost-safety point of the whole redesign — a bad/incompatible template
// file fails fast here, at near-zero cost, instead of after a full AI
// generation. No manual field-mapping form (unlike the old bring-your-own
// template editor) — the AI fills every text field automatically once the ad
// clip is generated (see the brief form + the `template_fill` step).

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  FileVideoIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchTemplateStructure, registerTemplate } from "@/lib/api";

const ACCEPT = [".aep", ".zip", ".mogrt"];
const MAX_BYTES = 200 * 1024 * 1024; // 200MB — mirrors the API's own cap

type Phase = "upload" | "analyzing" | "ready" | "invalid" | "failed";

export function TemplateUploadView() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registerMutation = useMutation({
    mutationFn: (file: File) => registerTemplate(file),
    onSuccess: ({ nexrenderTemplateId }) => {
      setTemplateId(nexrenderTemplateId);
      setPhase("analyzing");
    },
    onError: (err) => {
      setError(
        err instanceof Error ? err.message : "Failed to upload the template.",
      );
      setPhase("failed");
    },
  });

  const structureQuery = useQuery({
    queryKey: ["tmpl-structure", templateId],
    queryFn: () => fetchTemplateStructure(templateId as string),
    enabled: templateId !== null && phase === "analyzing",
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3000 : false,
  });

  // Derive the terminal phase once the poll lands, outside render.
  const structureStatus = structureQuery.data?.status;
  useEffect(() => {
    if (phase !== "analyzing" || !structureQuery.data) return;
    if (structureStatus === "failed") {
      setError(
        structureQuery.data.error ?? "Nexrender couldn't read this template.",
      );
      setPhase("failed");
    } else if (structureStatus === "ready") {
      const hasVideo = structureQuery.data.slots.some(
        (slot) => slot.asset === "VIDEO",
      );
      setPhase(hasVideo ? "ready" : "invalid");
    }
  }, [phase, structureQuery.data, structureStatus]);

  function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!ACCEPT.some((ext) => name.endsWith(ext))) {
      setError("Use a .aep, .zip, or .mogrt file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Template exceeds the 200MB limit.");
      return;
    }
    registerMutation.mutate(file);
  }

  function startOver() {
    setPhase("upload");
    setTemplateId(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const textCount =
    structureQuery.data?.slots.filter((s) => s.asset === "TEXT").length ?? 0;
  const videoCount =
    structureQuery.data?.slots.filter((s) => s.asset === "VIDEO").length ?? 0;

  return (
    <Card className="ring-glow">
      <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
        {(phase === "upload" || phase === "analyzing") && (
          <>
            <span className="border-brand/30 bg-brand/10 text-brand flex size-14 items-center justify-center rounded-2xl border">
              {registerMutation.isPending || phase === "analyzing" ? (
                <Loader2Icon className="size-6 animate-spin" />
              ) : (
                <UploadIcon className="size-6" />
              )}
            </span>
            <div>
              <h2 className="font-semibold">
                Upload your After Effects template
              </h2>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
                {registerMutation.isPending
                  ? "Uploading and registering with Nexrender…"
                  : phase === "analyzing"
                    ? "Reading the template's compositions and layers…"
                    : "We check it's renderable before you spend anything on ad generation — a .aep, .zip (project + assets), or .mogrt file."}
              </p>
            </div>
            {phase === "upload" && !registerMutation.isPending && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT.join(",")}
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  variant="brand"
                  onClick={() => inputRef.current?.click()}
                >
                  <UploadIcon className="size-4" />
                  Choose a file
                </Button>
              </>
            )}
          </>
        )}

        {phase === "ready" && (
          <>
            <span className="border-success/30 bg-success/10 text-success flex size-14 items-center justify-center rounded-2xl border">
              <FileVideoIcon className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">Template ready</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Found {textCount} text field{textCount === 1 ? "" : "s"} and{" "}
                {videoCount} video slot{videoCount === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={startOver}>
                Use a different file
              </Button>
              <Button
                variant="brand"
                onClick={() =>
                  router.push(
                    `/studio/template-new/brief?templateId=${encodeURIComponent(templateId ?? "")}`,
                  )
                }
              >
                Continue
                <ArrowRightIcon className="size-4" />
              </Button>
            </div>
          </>
        )}

        {phase === "invalid" && (
          <>
            <span className="border-warning/30 bg-warning/10 text-warning flex size-14 items-center justify-center rounded-2xl border">
              <TriangleAlertIcon className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">No spot for a video</h2>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
                This template doesn't have anywhere to put your generated ad
                clip. Upload a template with a video/footage placeholder layer.
              </p>
            </div>
            <Button variant="brand" onClick={startOver}>
              Upload a different template
            </Button>
          </>
        )}

        {phase === "failed" && (
          <>
            <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl border">
              <AlertCircleIcon className="size-6" />
            </span>
            <div>
              <h2 className="font-semibold">Couldn't read this template</h2>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
                {error ?? "Something went wrong reading the template file."}
              </p>
            </div>
            <Button variant="brand" onClick={startOver}>
              Try again
            </Button>
          </>
        )}

        {error && phase === "upload" && (
          <p className="text-destructive flex items-center gap-1.5 text-xs">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
