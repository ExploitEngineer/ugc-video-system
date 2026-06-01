"use client";

import type { Asset } from "@ugc/shared";
import { ExpandIcon, PlayIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ArtifactCard({
  asset,
  title,
}: {
  asset: Asset;
  title: string;
}) {
  const isVideo = asset.kind === "final_video";
  const isRealVideo = asset.mime.startsWith("video/");

  if (isVideo && isRealVideo) {
    return (
      <div className="overflow-hidden rounded-xl border">
        {/* biome-ignore lint/a11y/useMediaCaption: mock artifact, no captions */}
        <video
          src={asset.url}
          controls
          className="aspect-video w-full bg-media"
        />
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group relative block w-full overflow-hidden rounded-xl border"
        >
          {/* biome-ignore lint/performance/noImgElement: local mock SVG artifact */}
          <img
            src={asset.url}
            alt={title}
            className="aspect-video w-full bg-muted object-cover"
          />
          <span className="bg-background/0 group-hover:bg-background/40 absolute inset-0 flex items-center justify-center transition-colors">
            <span className="bg-background/90 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {isVideo ? (
                <PlayIcon className="size-3.5" />
              ) : (
                <ExpandIcon className="size-3.5" />
              )}
              {isVideo ? "Preview" : "View full size"}
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {/* biome-ignore lint/performance/noImgElement: local mock SVG artifact */}
        <img
          src={asset.url}
          alt={title}
          className="max-h-[75vh] w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
