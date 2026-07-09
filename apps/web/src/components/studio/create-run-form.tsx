"use client";

import type { AdTypeMenuItem, AspectRatio, Duration, Mode } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircleIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ClockIcon,
  FilmIcon,
  GaugeIcon,
  ImageIcon,
  ListChecksIcon,
  Loader2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SlidersHorizontalIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createRun, fetchAdTypes } from "@/lib/api";
import { addRun } from "@/lib/run-history";
import { cn } from "@/lib/utils";

const MAX = 2000;
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/avif"];

const MODE_LABEL: Record<Mode, string> = {
  automatic: "Auto",
  confirm: "Step-by-step",
};

// Temporary UI locks while we tune 15s-clip quality. Every run is a single ~15s
// automatic clip for now, so the duration + mode controls are HIDDEN (not
// removed) — the toggles still exist and wire up. Flip a flag to bring one back
// once 15s is solid. Aspect ratio + brand guidelines stay user-facing.
const SHOW_DURATION_CONTROL = false;
const SHOW_MODE_CONTROL = false;

export function CreateRunForm({
  initialPrompt = "",
  autoFocus = false,
  template,
}: {
  initialPrompt?: string;
  autoFocus?: boolean;
  /** Present only for a template-pipeline brief (see /studio/template-new) —
   *  adds the template-info line above the composer and wires `pipeline` +
   *  `templateId` into the submitted FormData. Every other control/behavior
   *  is identical to the normal pipeline's composer. */
  template?: {
    templateId: string;
    suggestedAspectRatio: AspectRatio | null;
    infoLabel: string;
  };
}) {
  const router = useRouter();
  const [productFile, setProductFile] = useState<File | null>(null);
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<Mode>("automatic");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    template?.suggestedAspectRatio ?? "16:9",
  );
  const [duration, setDuration] = useState<Duration>("15s");
  // Default to auto — the LLM detector selects the ad type from the prompt + the
  // attached assets (product/person). A manual dropdown pick still overrides and
  // LOCKS the type. "auto" never blocks submit (no product-required gate).
  const [adType, setAdType] = useState<string>("auto");
  // Optional brand guidelines (tone, palette, wording) — injected into the prompts.
  const [brandText, setBrandText] = useState("");
  // Character On/Off toggle (Chunk 4) — whether a main on-screen character is
  // generated (uploaded or synthesized). Defaults from the picked ad-type and
  // re-syncs when the type changes.
  const [characterEnabled, setCharacterEnabled] = useState(true);
  const [adTypes, setAdTypes] = useState<AdTypeMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load the registry-driven ad-type menu once (best-effort — the dropdown is
  // empty until it lands, then defaults to the testimonial pick).
  useEffect(() => {
    let active = true;
    fetchAdTypes().then((list) => {
      if (active) setAdTypes(list);
    });
    return () => {
      active = false;
    };
  }, []);

  // Reset the character toggle to the picked type's default when the type
  // changes (and once the menu first loads). A later manual toggle persists —
  // this only refires when adType/adTypes change. In auto the flag isn't sent
  // (the server derives it), so keep it on to expose the optional person upload.
  useEffect(() => {
    if (adType === "auto") {
      setCharacterEnabled(true);
      return;
    }
    const t = adTypes.find((o) => o.id === adType);
    if (t) setCharacterEnabled(t.characterDefault);
  }, [adType, adTypes]);

  // Per-type asset requirement — drives whether the product upload is required
  // and the hint shown. The user always picks a type; it requires a product only
  // when its policy says so. Person is never a required upload (synthesized when
  // needed). `selectedType` is null only briefly while the menu is still loading.
  const selectedType = adTypes.find((o) => o.id === adType) ?? null;
  const productRequired = selectedType?.assetPolicy.product === "required";
  // Service synthesizes its cast in the creative brief, so the toggle + person
  // upload are moot there — hide both. For product types the toggle decides
  // whether the person upload shows.
  const isService = adType === "service";
  const showCharacterControl = !isService && Boolean(selectedType);
  const showPersonUpload = !isService && characterEnabled;

  // Drop a stale person file when the upload is hidden (toggle off / service) so
  // it is never sent for a character-off run.
  useEffect(() => {
    if (!showPersonUpload) setPersonFile(null);
  }, [showPersonUpload]);
  const assetHint = !selectedType
    ? "Add a product and/or person image, or none for a text-only ad type."
    : selectedType.assetPolicy.product === "required"
      ? `${selectedType.displayName} needs a product image · person optional`
      : selectedType.assetPolicy.person === "required"
        ? `${selectedType.displayName} centres on a person (uploaded or auto-generated) · product optional`
        : `${selectedType.displayName} needs no images — just describe it in your prompt`;

  const canSubmit =
    (!productRequired || Boolean(productFile)) &&
    prompt.trim().length > 0 &&
    !pending;

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
    if (productRequired && !productFile) {
      setError(
        `The "${selectedType?.displayName ?? "selected"}" ad type needs a product image.`,
      );
      return;
    }
    if (prompt.trim().length === 0) {
      setError("Add a prompt describing the ad.");
      return;
    }

    const fd = new FormData();
    if (productFile) fd.set("productImage", productFile);
    if (showPersonUpload && personFile) fd.set("personImage", personFile);
    fd.set("prompt", prompt.trim());
    fd.set("mode", mode);
    fd.set("aspectRatio", aspectRatio);
    fd.set("duration", duration);
    fd.set("adType", adType);
    // Auto mode: omit the character flag so the server applies its default
    // (character on — a person is synthesized when none is uploaded). A manual
    // pick sends the toggle as chosen, honoring that type's default/override.
    if (adType !== "auto") fd.set("characterEnabled", String(characterEnabled));
    if (brandText.trim()) fd.set("brandText", brandText.trim());
    if (template) {
      fd.set("pipeline", "template");
      fd.set("templateId", template.templateId);
    }

    startTransition(async () => {
      try {
        const detail = await createRun(fd);
        addRun({
          id: detail.id,
          prompt: prompt.trim(),
          createdAt: detail.createdAt,
          pipeline: template ? "template" : "video",
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
      {template && (
        <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
          <span>Template: {template.infoLabel}</span>
          <Link
            href="/studio/template-new"
            className="hover:text-foreground underline"
          >
            Change template
          </Link>
        </div>
      )}

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
          <div className="flex flex-wrap items-center gap-1.5">
            <AdTypeSelect
              value={adType}
              onChange={setAdType}
              options={adTypes}
            />
            <AttachButton
              label="Product"
              icon={ImageIcon}
              file={productFile}
              onFile={setProductFile}
              onError={setError}
              required={productRequired}
            />
            {showCharacterControl && (
              <CharacterChip
                value={characterEnabled}
                onChange={setCharacterEnabled}
              />
            )}
            {showPersonUpload && (
              <AttachButton
                label="Person"
                icon={UserIcon}
                file={personFile}
                onFile={setPersonFile}
                onError={setError}
              />
            )}
            <OptionsMenu
              mode={mode}
              onMode={setMode}
              aspectRatio={aspectRatio}
              onAspect={setAspectRatio}
              duration={duration}
              onDuration={setDuration}
              brandText={brandText}
              onBrandText={setBrandText}
            />
            <span className="text-muted-foreground hidden items-center pl-1 font-mono text-[11px] tabular-nums sm:inline-flex">
              {duration} · {aspectRatio} · {MODE_LABEL[mode]}
            </span>
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

      {/* Per-type asset guidance — tells the user which uploads (if any) this
          ad type needs, so no-image types don't look broken. */}
      <p className="text-muted-foreground/80 flex items-center gap-1.5 px-1 text-[11px]">
        <ImageIcon className="size-3 shrink-0 opacity-70" />
        {assetHint}
      </p>

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
        className="border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground hover:bg-brand/10 inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors"
      >
        <Icon className="size-3.5" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </button>
    </>
  );
}

/** One Options popover — collapses mode / aspect / duration into a single
 *  trigger so the composer reads cleanly. Picks stay visible via the inline
 *  summary next to it. */
function OptionsMenu({
  mode,
  onMode,
  aspectRatio,
  onAspect,
  duration,
  onDuration,
  brandText,
  onBrandText,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  aspectRatio: AspectRatio;
  onAspect: (r: AspectRatio) => void;
  duration: Duration;
  onDuration: (d: Duration) => void;
  brandText: string;
  onBrandText: (v: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-border/60 bg-background/40 text-muted-foreground hover:border-brand/40 hover:text-foreground hover:bg-brand/10 data-[state=open]:border-brand/50 data-[state=open]:text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
        >
          <SlidersHorizontalIcon className="size-3.5" />
          Options
          <ChevronDownIcon className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="ring-glow w-80 rounded-2xl border-border/70 p-4"
      >
        <div className="flex flex-col gap-4">
          {SHOW_DURATION_CONTROL && (
            <Field label="Duration">
              <DurationToggle value={duration} onChange={onDuration} />
            </Field>
          )}
          <Field label="Aspect ratio">
            <AspectRatioToggle value={aspectRatio} onChange={onAspect} />
          </Field>
          {SHOW_MODE_CONTROL && (
            <Field label="Mode">
              <ModeToggle value={mode} onChange={onMode} />
            </Field>
          )}
          <Field label="Brand guidelines">
            <textarea
              value={brandText}
              onChange={(e) => onBrandText(e.target.value)}
              rows={3}
              placeholder="Optional — tone, colours, words to use/avoid, do/don'ts…"
              className="border-border/60 bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus:border-brand/50 w-full resize-none rounded-xl border px-3 py-2 text-xs outline-none"
            />
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Labelled row inside the Options popover. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.12em] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Ad-type dropdown. Defaults to "Auto" — the detector picks the type from the
 *  prompt + attached assets. Any manual pick LOCKS the type for the run (the
 *  detector still infers adStyle + hooks). Themed shadcn DropdownMenu (not a
 *  native select) so the open list matches the dark theme; scrolls and scales
 *  cleanly from 2 to 16+ types. */
function AdTypeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (t: string) => void;
  options: AdTypeMenuItem[];
}) {
  const label =
    value === "auto"
      ? "Auto"
      : (options.find((o) => o.id === value)?.displayName ?? value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Ad type — Auto lets the AI pick from your prompt + uploads, or choose one to lock it."
          className="border-border/60 bg-background/40 text-foreground hover:border-brand/40 data-[state=open]:border-brand/50 inline-flex max-w-[12rem] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors"
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="ring-glow max-h-64 min-w-[13rem] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-2xl border-border/70"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem
            value="auto"
            title="Let the AI choose the ad type from your prompt and uploads."
            className="text-xs"
          >
            Auto (let AI decide)
          </DropdownMenuRadioItem>
          {options.map((o) => (
            <DropdownMenuRadioItem
              key={o.id}
              value={o.id}
              title={o.whenToUse}
              className="text-xs"
            >
              {o.displayName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact Character On/Off chip for the composer bar — On → solid brand, Off →
 *  dashed muted, mirroring the AttachButton chips. Toggles a main on-screen
 *  character (uploaded if a person is added, else synthesized). */
function CharacterChip({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      title={
        value
          ? "Character on — one main on-screen character (uploaded or synthesized). Click to turn off."
          : "Character off — product/scene-only ad. Click to turn on."
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        value
          ? "border-brand/50 bg-brand/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:border-brand/40 hover:text-foreground hover:bg-brand/10 border-dashed",
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <UserIcon className="size-3.5" />
        {!value && (
          <span className="bg-current pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full" />
        )}
      </span>
      Character {value ? "on" : "off"}
    </button>
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
    <div className="border-border/60 bg-background/40 relative inline-flex w-full items-center rounded-full border p-0.5">
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
              "relative isolate inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:bg-brand/10 hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="mode-pill"
                className="bg-brand/20 ring-1 ring-inset ring-brand/30 absolute inset-0 -z-10 rounded-full"
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

/** Compact segmented control for the ad length — single 15s clip vs merged 60s. */
function DurationToggle({
  value,
  onChange,
}: {
  value: Duration;
  onChange: (d: Duration) => void;
}) {
  const opts: Array<{
    value: Duration;
    label: string;
    title: string;
    icon: typeof GaugeIcon;
  }> = [
    {
      value: "15s",
      label: "15s",
      title: "One ~15s ad clip",
      icon: ClockIcon,
    },
    {
      value: "30s",
      label: "30s",
      title: "Two storyboard rows → two 15s clips merged into one 30s ad",
      icon: FilmIcon,
    },
    {
      value: "45s",
      label: "45s",
      title: "Three storyboard rows → three 15s clips merged into one 45s ad",
      icon: FilmIcon,
    },
    {
      value: "60s",
      label: "60s",
      title:
        "Four storyboard rows → four 15s clips merged into one 60s ad (longer render)",
      icon: FilmIcon,
    },
  ];
  return (
    <div className="border-border/60 bg-background/40 relative inline-flex w-full items-center rounded-full border p-0.5">
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
              "relative isolate inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:bg-brand/10 hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="duration-pill"
                className="bg-brand/20 ring-1 ring-inset ring-brand/30 absolute inset-0 -z-10 rounded-full"
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
    <div className="border-border/60 bg-background/40 relative inline-flex w-full items-center rounded-full border p-0.5">
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
              "relative isolate inline-flex flex-1 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:bg-brand/10 hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="ratio-pill"
                className="bg-brand/20 ring-1 ring-inset ring-brand/30 absolute inset-0 -z-10 rounded-full"
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
