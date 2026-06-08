"use client";

import type { AspectRatio, Mode } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  GaugeIcon,
  ImageIcon,
  ListChecksIcon,
  Loader2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createRun } from "@/lib/api";
import { addRun } from "@/lib/run-history";
import { cn } from "@/lib/utils";

const MAX = 2000;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export function CreateRunForm({
  initialPrompt = "",
  autoFocus = false,
}: {
  initialPrompt?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [productFile, setProductFile] = useState<File | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<Mode>("automatic");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit =
    Boolean(productFile) && prompt.trim().length > 0 && !pending;

  // Auto-grow the composer up to a cap, then scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: prompt drives the resize; the ref isn't a dependency
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
  }, [prompt]);

  function submit() {
    setError(null);
    if (!productFile) {
      setError("A product image is required.");
      return;
    }
    if (prompt.trim().length === 0) {
      setError("Add a prompt describing the ad.");
      return;
    }

    const fd = new FormData();
    fd.set("productImage", productFile);
    if (personFile) fd.set("personImage", personFile);
    fd.set("prompt", prompt.trim());
    fd.set("mode", mode);
    fd.set("aspectRatio", aspectRatio);

    startTransition(async () => {
      try {
        const detail = await createRun(fd);
        addRun({
          id: detail.id,
          prompt: prompt.trim(),
          createdAt: detail.createdAt,
        });
        router.push(`/studio/${detail.id}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not start the run.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="ring-glow bg-card/80 focus-within:border-brand/50 relative flex flex-col gap-2 rounded-3xl border border-border/60 p-2.5 shadow-xl backdrop-blur transition-shadow">
        <textarea
          ref={taRef}
          // biome-ignore lint/a11y/noAutofocus: opt-in only, off by default
          autoFocus={autoFocus}
          value={prompt}
          maxLength={MAX}
          rows={1}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter (or IME composition) inserts a newline.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              if (canSubmit) submit();
            }
          }}
          placeholder="Describe the ad you want to generate — hint a style if you like…"
          className="placeholder:text-muted-foreground max-h-[260px] w-full resize-none bg-transparent px-3 pt-2.5 text-[15px] leading-relaxed outline-none"
        />

        <div className="flex items-end justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-1">
            <AttachButton
              label="Product"
              icon={ImageIcon}
              file={productFile}
              onFile={setProductFile}
              onError={setError}
              required
            />
            <AttachButton
              label="Person"
              icon={UserIcon}
              file={personFile}
              onFile={setPersonFile}
              onError={setError}
            />
            <ModeToggle value={mode} onChange={setMode} />
            <AspectRatioToggle value={aspectRatio} onChange={setAspectRatio} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden font-mono text-[11px] tabular-nums xl:inline">
              {prompt.length}/{MAX}
            </span>
            <Button
              type="button"
              variant="brand"
              size="icon"
              className="size-9 rounded-full"
              onClick={submit}
              disabled={!canSubmit}
              aria-label="Generate ad video"
            >
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-5 items-center justify-between px-1">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="err"
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-destructive flex items-center gap-1.5 text-xs"
            >
              <AlertCircleIcon className="size-3.5 shrink-0" />
              {error}
            </motion.p>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-muted-foreground text-xs"
            >
              Press{" "}
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{" "}
              to generate ·{" "}
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                Shift+Enter
              </kbd>{" "}
              for a new line
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Compact attach control — a chip that turns into a thumbnail once set. */
function AttachButton({
  label,
  icon: Icon,
  file,
  onFile,
  onError,
  required = false,
}: {
  label: string;
  icon: typeof ImageIcon;
  file: File | null;
  onFile: (f: File | null) => void;
  onError: (msg: string | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

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
    onError(null);
    if (!next) return onFile(null);
    if (!ACCEPT.includes(next.type)) {
      return onError("Use a PNG, JPEG, WebP, or AVIF image.");
    }
    if (next.size > MAX_BYTES) return onError("Image must be under 12 MB.");
    onFile(next);
  }

  if (file && preview) {
    return (
      <span className="border-border/60 bg-background/60 group inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-1">
        {/* biome-ignore lint/performance/noImgElement: object-URL preview, not a remote asset */}
        <img
          src={preview}
          alt={`${label} preview`}
          className="size-6 rounded-full object-cover"
        />
        <span className="text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={() => {
            accept(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          aria-label={`Remove ${label} image`}
          className="hover:bg-muted text-muted-foreground hover:text-foreground flex size-5 items-center justify-center rounded-full transition-colors"
        >
          <XIcon className="size-3" />
        </button>
      </span>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground hover:bg-accent/40 inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors"
      >
        <Icon className="size-3.5" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </button>
    </>
  );
}

/** Compact two-state run-mode segmented control. */
function ModeToggle({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  const opts: Array<{ value: Mode; label: string; icon: typeof GaugeIcon }> = [
    { value: "automatic", label: "Auto", icon: GaugeIcon },
    { value: "confirm", label: "Step-by-step", icon: ListChecksIcon },
  ];
  return (
    <div className="border-border/60 bg-background/40 relative inline-flex items-center rounded-full border p-0.5">
      {opts.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            title={
              opt.value === "automatic"
                ? "Run end-to-end with no gating"
                : "Pause after each artifact for your feedback to approve or revise"
            }
            className={cn(
              "relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="mode-pill"
                className="bg-accent absolute inset-0 -z-10 rounded-full"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <opt.icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control for the output aspect ratio — landscape vs vertical. */
function AspectRatioToggle({
  value,
  onChange,
}: {
  value: AspectRatio;
  onChange: (r: AspectRatio) => void;
}) {
  const opts: Array<{
    value: AspectRatio;
    label: string;
    title: string;
    icon: typeof GaugeIcon;
  }> = [
    {
      value: "16:9",
      label: "16:9",
      title: "Landscape — YouTube, web, TV",
      icon: RectangleHorizontalIcon,
    },
    {
      value: "9:16",
      label: "9:16",
      title: "Portrait — TikTok, Reels, Shorts",
      icon: RectangleVerticalIcon,
    },
  ];
  return (
    <div className="border-border/60 bg-background/40 relative inline-flex items-center rounded-full border p-0.5">
      {opts.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            title={opt.title}
            className={cn(
              "relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              selected ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="ratio-pill"
                className="bg-accent absolute inset-0 -z-10 rounded-full"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <opt.icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
