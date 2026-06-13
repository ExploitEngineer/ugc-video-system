"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ensureAudioTrack, fetchRun, uploadEditedVideo } from "@/lib/api";
import type { OnSaved } from "@/lib/cesdk";

// Heavy, browser-only WASM editor — loaded lazily and never server-rendered, so
// it stays off the run view's bundle and only this route pays the cost.
const CesdkEditor = dynamic(
  () => import("@/components/studio/edit/cesdk-editor"),
  {
    ssr: false,
    loading: () => <EditorMessage>Loading editor…</EditorMessage>,
  },
);

export function EditVideoView({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    data: run,
    isPending,
    isError,
    error,
  } = useQuery({
    // Same key the run view primes, so the final-video URL is usually cached.
    queryKey: ["run", runId] as const,
    queryFn: () => fetchRun(runId),
    retry: (count) => count < 2,
  });

  const onSaved = useCallback<OnSaved>(
    async (video, scene) => {
      try {
        const updated = await uploadEditedVideo(runId, video, scene);
        queryClient.setQueryData(["run", runId], updated);
        toast.success("Saved to chat");
        router.push(`/studio/${runId}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn’t save the edited video",
        );
      }
    },
    [runId, queryClient, router],
  );

  const finalVideo = run?.assets.find((a) => a.kind === "final_video");
  // Resume the most recent saved edit, if any (newest `editor_scene` wins).
  const latestScene = run?.assets
    .filter((a) => a.kind === "editor_scene")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  // Fresh edits get the audio on its own timeline lane: ask the API to extract
  // it (lazy, idempotent) before mounting the editor. Skipped when resuming a
  // saved scene (it already encodes the split). On failure we mount anyway and
  // fall back to the video's baked-in audio.
  const needsAudio =
    run?.status === "completed" && !!finalVideo && !latestScene;
  const audioQuery = useQuery({
    queryKey: ["run-audio", runId] as const,
    queryFn: () => ensureAudioTrack(runId),
    enabled: needsAudio,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  let content: ReactNode;
  if (isError && (error as Error).message === "not-found") {
    content = (
      <EditorMessage>
        <TriangleAlertIcon className="text-muted-foreground size-7" />
        This chat doesn’t exist or has been removed.
      </EditorMessage>
    );
  } else if (isPending || !run) {
    content = <EditorMessage>Loading…</EditorMessage>;
  } else if (run.status !== "completed" || !finalVideo) {
    content = (
      <EditorMessage>
        <TriangleAlertIcon className="text-muted-foreground size-7" />
        This chat’s video isn’t ready to edit yet.
      </EditorMessage>
    );
  } else if (needsAudio && audioQuery.isPending) {
    // Hold the mount until the audio track is ready, so the editor builds the
    // scene once with a stable audioUrl rather than re-creating when it arrives.
    content = <EditorMessage>Preparing audio track…</EditorMessage>;
  } else {
    content = (
      <CesdkEditor
        sourceVideoUrl={finalVideo.url}
        sceneUrl={latestScene?.url ?? null}
        // Null when resuming a saved scene (split already baked in) or if
        // extraction failed — the editor then keeps the video's native audio.
        audioUrl={latestScene ? null : (audioQuery.data?.url ?? null)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/studio/${runId}`}>
            <ArrowLeftIcon className="size-4" />
            Back to chat
          </Link>
        </Button>
        <span className="text-sm font-medium">Edit video</span>
        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          Export saves the edit back to this chat
        </span>
      </header>
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}

function EditorMessage({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm">
      {children}
    </div>
  );
}
