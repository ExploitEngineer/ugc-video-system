"use client";

import { ImageUpIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export function ImageDropzone({
  label,
  file,
  onFile,
  required = false,
  hint,
}: {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  required?: boolean;
  hint?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(next: File | null) {
    setError(null);
    if (!next) {
      onFile(null);
      return;
    }
    if (!ACCEPT.includes(next.type)) {
      setError("Use a PNG, JPEG, WebP, or AVIF image.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("Image must be under 12 MB.");
      return;
    }
    onFile(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {label}
          {required ? (
            <span className="text-destructive ml-1">*</span>
          ) : (
            <span className="text-muted-foreground ml-1 font-normal">
              (optional)
            </span>
          )}
        </span>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps a real file input */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors",
          dragging
            ? "border-brand bg-accent/40"
            : "border-border hover:border-brand/50 hover:bg-accent/20",
          error && "border-destructive",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT.join(",")}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0] ?? null)}
        />

        {preview ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: object-URL preview, not a remote asset */}
            <img
              src={preview}
              alt={`${label} preview`}
              className="h-full w-full object-contain"
            />
            <button
              type="button"
              onClick={() => {
                accept(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="bg-background/80 hover:bg-background absolute top-2 right-2 flex size-7 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors"
              aria-label={`Remove ${label}`}
            >
              <XIcon className="size-4" />
            </button>
          </>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center gap-2 px-4 py-8 text-center"
          >
            <span className="bg-accent text-accent-foreground group-hover:bg-brand-gradient group-hover:text-brand-foreground flex size-11 items-center justify-center rounded-xl transition-colors">
              <ImageUpIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">
              Drop an image or click to upload
            </span>
            {hint && (
              <span className="text-muted-foreground text-xs">{hint}</span>
            )}
          </label>
        )}
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
