"use client";

// The admin template console: upload an After Effects project, watch it reach
// `ready`, read what the introspection found, and retire the ones that failed.
//
// A LIST, not a stack of cards. Every template shows the same four things at a
// glance — where it is in its lifecycle, what it is, what it can be filled with,
// and why it failed — and hides its slot table until asked. The admin's job here
// is triage, and triage needs density.
//
// Every action names itself, and the two that cost something say so: re-rendering
// a preview bills a Nexrender render, and deleting removes a template from the
// library. No icon-only destructive buttons.
//
// The key gate is a soft guard, not auth. F8 replaces it with Supabase RBAC.

import type { TemplateAdmin } from "@ugc/shared";
import { formatBytes, MAX_TEMPLATE_BYTES } from "@ugc/shared";
import {
  ChevronDownIcon,
  CloudUploadIcon,
  EllipsisIcon,
  FilmIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { setAdminKey, useAdminKey } from "@/lib/admin-key";
import { ADMIN_KEY_HEADER, adminFetch, TEMPLATE_BYTES_HEADER } from "@/lib/api";
import { cn } from "@/lib/utils";

const NON_TERMINAL = ["registering", "introspecting", "previewing"];

const isTemplateFile = (name: string) => /\.(aep|zip)$/i.test(name);

/** The API always answers `{ error }`. A proxy or a crash may not. */
function parseError(body: string): string | null {
  try {
    return (JSON.parse(body || "{}") as { error?: string }).error ?? null;
  } catch {
    return null;
  }
}

// ── status ───────────────────────────────────────────────────────────────────

/** Each lifecycle stage said in words, because `introspecting` is our jargon. */
const STATUS: Record<string, { label: string; className: string }> = {
  registering: {
    label: "Registering",
    className: "text-brand border-brand/40 bg-brand/10",
  },
  introspecting: {
    label: "Reading the project",
    className: "text-brand border-brand/40 bg-brand/10",
  },
  previewing: {
    label: "Rendering preview",
    className: "text-brand border-brand/40 bg-brand/10",
  },
  ready: {
    label: "Ready",
    className: "text-success border-success/40 bg-success/10",
  },
  failed: {
    label: "Failed",
    className: "text-destructive border-destructive/40 bg-destructive/10",
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? {
    label: status,
    className: "text-muted-foreground border-border",
  };
  const working = NON_TERMINAL.includes(status);
  return (
    <Badge variant="outline" className={cn("gap-1.5", s.className)}>
      {working && (
        <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
      )}
      {s.label}
    </Badge>
  );
}

// ── one template ─────────────────────────────────────────────────────────────

/** "4 video, 5 text" — never `4v 0i 5t 0a`, and never a zero. */
function slotSummary(counts: TemplateAdmin["slotCounts"]): string | null {
  if (!counts) return null;
  const parts = [
    counts.video && `${counts.video} video`,
    counts.image && `${counts.image} image`,
    counts.text && `${counts.text} text`,
    counts.audio && `${counts.audio} audio`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "no fillable slots";
}

/** Only the facts we actually have. A template that failed early has none. */
function metaLine(t: TemplateAdmin): string | null {
  const parts = [
    t.durationSec ? `${t.durationSec.toFixed(1)}s` : null,
    t.aspectRatio,
    slotSummary(t.slotCounts),
    t.useCount > 0
      ? `used in ${t.useCount} ad${t.useCount > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join("  ·  ") : null;
}

function Thumb({ t }: { t: TemplateAdmin }) {
  // A CSS background rather than <img>: the poster is a remote Supabase URL, and
  // next/image would need a per-host allowlist for a thumbnail. Same reasoning as
  // the template brief page.
  if (t.previewPosterUrl) {
    return (
      <div
        aria-hidden
        className="bg-media border-border/60 hidden aspect-video w-28 shrink-0 rounded-md border bg-cover bg-center sm:block"
        style={{ backgroundImage: `url(${t.previewPosterUrl})` }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="bg-media border-border/60 text-muted-foreground/40 hidden aspect-video w-28 shrink-0 place-items-center rounded-md border sm:grid"
    >
      <FilmIcon className="size-5" />
    </div>
  );
}

function SlotTable({ template }: { template: TemplateAdmin }) {
  if (!template.slots.length) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing fillable was found in this project.
      </p>
    );
  }
  return (
    <div className="border-border/60 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground bg-white/[0.03]">
          <tr>
            {["kind", "layer", "composition", "what goes here"].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {template.slots.map((s) => (
            <tr
              key={`${s.asset}-${s.composition}-${s.jobLayerName}`}
              className="border-border/40 border-t"
            >
              <td className="text-foreground px-3 py-2 font-mono">{s.asset}</td>
              <td className="px-3 py-2 font-mono">
                {s.jobLayerName}
                {/* An unnamed layer is reached by its stacking position: the name
                    Nexrender reports for it belongs to its source. */}
                {s.targetBy === "index" && (
                  <span className="text-muted-foreground">{` #${s.layerIndex}`}</span>
                )}
              </td>
              <td className="text-muted-foreground px-3 py-2 font-mono">
                {s.composition}
              </td>
              <td className="text-muted-foreground px-3 py-2">
                {s.asset === "VIDEO" &&
                  (s.durationSec
                    ? `${s.durationSec.toFixed(1)}s slice @ ${(s.startSec ?? 0).toFixed(1)}s`
                    : "length unknown, even split")}
                {s.asset === "IMAGE" &&
                  (s.imageClass === "content"
                    ? "generated"
                    : `${s.imageClass}, the template's own art`)}
                {s.asset === "TEXT" &&
                  (s.charBudget
                    ? `up to ${s.charBudget} characters`
                    : "written")}
                {s.asset === "AUDIO" && "receives the voiceover"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  t: TemplateAdmin;
  busy: boolean;
  onAct: (path: string, method: string, success: string) => void;
  onDelete: () => void;
}

function TemplateRow({ t, busy, onAct, onDelete }: RowProps) {
  const [open, setOpen] = useState(false);
  const meta = metaLine(t);
  const hasDetails = Boolean(t.previewVideoUrl) || t.slots.length > 0;
  // A rejected template's project is deleted from Nexrender the moment we refuse
  // it, so there is nothing left to re-read or re-render. The DTO maps the
  // cleared id to "".
  const onNexrender = Boolean(t.nexrenderTemplateId);

  return (
    <li>
      <div className="flex items-start gap-4 p-4">
        <Thumb t={t} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusBadge status={t.status} />
            <h3 className="text-foreground truncate font-medium">
              {t.displayName}
            </h3>
          </div>

          {meta && (
            <p className="text-muted-foreground mt-1.5 font-mono text-xs">
              {meta}
            </p>
          )}

          {t.error && (
            <p className="text-destructive mt-2 flex items-start gap-1.5 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{t.error}</span>
            </p>
          )}

          {/* The admin should be able to SEE that we cleaned up after ourselves,
              rather than take it on trust. */}
          {t.status === "failed" && !onNexrender && (
            <p className="text-muted-foreground mt-1.5 pl-5 text-xs">
              Its upload was removed from Nexrender.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {hasDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              Details
              <ChevronDownIcon
                className={cn(
                  "transition-transform duration-200 motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`Actions for ${t.displayName}`}
              >
                {busy ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <EllipsisIcon />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {/* Both of these act on the project Nexrender holds. Once that is
                  gone, offering them would only ever produce an error toast. */}
              {onNexrender && (
                <>
                  <DropdownMenuItem
                    className="whitespace-nowrap"
                    onSelect={() =>
                      onAct("/reintrospect", "POST", "Structure re-read.")
                    }
                  >
                    <ScanSearchIcon />
                    Re-read structure
                    <DropdownMenuShortcut>free</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="whitespace-nowrap"
                    onSelect={() =>
                      onAct("/preview", "DELETE", "Re-rendering the preview.")
                    }
                  >
                    <RefreshCwIcon />
                    Re-render preview
                    <DropdownMenuShortcut>costs a render</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2Icon />
                Delete template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {open && hasDetails && (
        <div className="border-border/60 animate-in fade-in slide-in-from-top-1 border-t px-4 pt-4 pb-5 duration-200 motion-reduce:animate-none">
          <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            {t.previewVideoUrl && (
              // `relative z-10` is load-bearing, not decoration. The panel's
              // `backdrop-blur` opens a backdrop root, and Brave then refuses to
              // hit-test a <video> inside it: every click on the native controls
              // lands on the panel instead, so the preview looks unplayable. A
              // positioned, z-indexed video paints above the backdrop root and
              // takes its own clicks. Chrome is unaffected either way.
              // The aspect box also stops the element collapsing to 0x0 (and the
              // row jumping) while metadata loads.
              <video
                src={t.previewVideoUrl}
                poster={t.previewPosterUrl ?? undefined}
                controls
                muted
                playsInline
                preload="metadata"
                className={cn(
                  "bg-media relative z-10 w-full rounded-lg",
                  t.aspectRatio === "9:16"
                    ? "mx-auto aspect-[9/16] max-w-[12rem]"
                    : "aspect-video",
                )}
              />
            )}
            <SlotTable template={t} />
          </div>
        </div>
      )}
    </li>
  );
}

// ── upload ───────────────────────────────────────────────────────────────────

interface UploadProps {
  progress: number | null;
  error: string | null;
  onFile: (file: File) => void;
}

function UploadPanel({ progress, error, onFile }: UploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const uploading = progress !== null;

  return (
    <section>
      <input
        ref={fileRef}
        type="file"
        accept=".aep,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {/* The whole panel is the control, so a drop and a click land in the same
          place and the keyboard reaches it. Drag-and-drop is the enhancement;
          the button is the accessible path. */}
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={cn(
          "focus-visible:ring-ring/50 group block w-full rounded-xl border border-dashed p-6 text-center transition-colors duration-200 outline-none focus-visible:ring-[3px] motion-reduce:transition-none",
          uploading && "cursor-default",
          dragging
            ? "border-brand bg-brand/5"
            : "border-border/70 bg-card/40 backdrop-blur hover:border-brand/50",
        )}
      >
        {uploading ? (
          <span className="mx-auto block max-w-sm">
            <span className="text-foreground block text-sm font-medium">
              {progress < 100
                ? `Uploading ${progress}%`
                : "Registering with Nexrender…"}
            </span>
            <span className="bg-border/60 mt-3 block h-1 w-full overflow-hidden rounded">
              <span
                className="bg-brand block h-full transition-all duration-200 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </span>
          </span>
        ) : (
          <>
            <CloudUploadIcon
              className={cn(
                "mx-auto size-6 transition-colors",
                dragging ? "text-brand" : "text-muted-foreground/60",
              )}
            />
            <span className="text-foreground mt-3 block text-sm">
              <span className="text-brand font-medium underline-offset-4 group-hover:underline">
                Choose a project
              </span>{" "}
              <span className="text-muted-foreground">or drop it here</span>
            </span>
            <span className="text-muted-foreground mx-auto mt-1.5 block max-w-md text-xs">
              An .aep, or a .zip if the project links external footage (After
              Effects → File → Dependencies → Collect Files). Up to{" "}
              {formatBytes(MAX_TEMPLATE_BYTES)}. .mogrt is not supported.
            </span>
          </>
        )}
      </button>

      {error && (
        <p className="text-destructive mx-auto mt-4 flex max-w-lg items-start justify-center gap-1.5 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="text-left">{error}</span>
        </p>
      )}
    </section>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

function KeyGate() {
  const [value, setValue] = useState("");
  return (
    <div className="border-border/70 bg-card/40 mx-auto mt-20 max-w-md rounded-xl border p-8 backdrop-blur">
      <LayoutTemplateIcon className="text-brand mx-auto mb-4 size-6" />
      <h1 className="text-display mb-1 text-center text-xl">Template admin</h1>
      <p className="text-muted-foreground mb-6 text-center text-sm">
        Enter the admin key from <code>apps/api/.env</code> (
        <code>ADMIN_API_KEY</code>).
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) setAdminKey(value.trim());
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ADMIN_API_KEY"
          className="border-border bg-background/60 focus:border-brand flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
        />
        <Button type="submit" variant="brand" disabled={!value.trim()}>
          Unlock
        </Button>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center">
      <LayoutTemplateIcon className="text-muted-foreground/40 mx-auto size-7" />
      <p className="text-foreground mt-4 text-sm font-medium">
        No templates yet
      </p>
      <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm">
        Upload an After Effects project above. It is registered with Nexrender,
        read for fillable layers, and rendered once as a preview. Only templates
        that reach <span className="text-success font-mono">Ready</span> appear
        in the picker.
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <ul>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="border-border/60 flex items-start gap-4 border-t p-4 first:border-t-0"
        >
          <Skeleton className="hidden aspect-video w-28 shrink-0 sm:block" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminTemplatesView() {
  const key = useAdminKey();
  const [rows, setRows] = useState<TemplateAdmin[] | null>(null);
  // Two errors, two lifetimes. A LIST error is transient and heals on the next
  // poll; an UPLOAD error must survive until the admin tries again. Sharing one
  // state made every server rejection flash and vanish, because the `load()`
  // that follows an upload cleared it a few hundred milliseconds later.
  const [listError, setListError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TemplateAdmin | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!key) return;
    const res = await adminFetch("/templates", key);
    if (res.status === 401) {
      setAdminKey(""); // stale key — re-gate rather than silently failing
      return;
    }
    if (!res.ok) {
      setListError(
        (await res.json().catch(() => null))?.error ?? "Failed to load.",
      );
      return;
    }
    setListError(null);
    setRows((await res.json()) as TemplateAdmin[]);
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  // Nexrender introspects and renders the preview asynchronously with no
  // webhook, so poll while anything is still working.
  useEffect(() => {
    if (!rows?.some((r) => NON_TERMINAL.includes(r.status))) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [rows, load]);

  // XHR, not fetch: `fetch` cannot report upload progress, and a Collect Files
  // archive runs to hundreds of megabytes. The body is the RAW file, not a
  // FormData envelope, so the API can stream it to disk rather than buffer it;
  // its metadata rides in the query string.
  const upload = (file: File) => {
    setUploadError(null);

    // Refuse locally rather than spend minutes uploading something the API will
    // reject on arrival. Drag-and-drop bypasses the input's `accept`, so the
    // extension is checked here too.
    if (!isTemplateFile(file.name)) {
      setUploadError(
        `${file.name} is not a template. Upload a .aep, or a .zip of a Collect Files folder.`,
      );
      return;
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      setUploadError(
        `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_TEMPLATE_BYTES)}.`,
      );
      return;
    }

    setProgress(0);
    const query = new URLSearchParams({ filename: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/templates?${query}`);
    xhr.setRequestHeader(ADMIN_KEY_HEADER, key);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader(TEMPLATE_BYTES_HEADER, String(file.size));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 400) {
        // A rejected upload changed nothing server-side, so do NOT reload the
        // list: its success would wipe this message off the screen.
        setUploadError(
          parseError(xhr.responseText) ?? `Upload failed (${xhr.status}).`,
        );
        return;
      }
      toast.success(
        xhr.status === 200
          ? "That template is already in the library."
          : "Template uploaded.",
      );
      void load();
    };
    xhr.onerror = () => {
      setProgress(null);
      setUploadError("Upload failed: the connection dropped.");
    };
    xhr.send(file);
  };

  const act = async (
    id: string,
    path: string,
    method: string,
    success: string,
  ) => {
    setBusyId(id);
    try {
      const res = await adminFetch(`/templates/${id}${path}`, key, { method });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? `That didn't work (${res.status}).`);
        return;
      }
      toast.success(success);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!key) return <KeyGate />;

  const count = rows?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-display text-2xl">Template admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {rows === null
              ? "Loading the library…"
              : count === 0
                ? "The library is empty."
                : `${count} template${count > 1 ? "s" : ""} in the library. Users pick from the ones that are Ready.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdminKey("")}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          Lock
        </button>
      </header>

      <UploadPanel progress={progress} error={uploadError} onFile={upload} />

      {listError && (
        <p className="text-destructive mt-6 text-sm">{listError}</p>
      )}

      <div className="border-border/70 bg-card/40 mt-6 overflow-hidden rounded-xl border backdrop-blur">
        {rows === null ? (
          <LoadingRows />
        ) : count === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((t) => (
              <TemplateRow
                key={t.id}
                t={t}
                busy={busyId === t.id}
                onAct={(path, method, success) =>
                  void act(t.id, path, method, success)
                }
                onDelete={() => setConfirmDelete(t)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Deleting is the one action that cannot be undone from this screen, so
          it is the one action that asks. */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.displayName}”?</DialogTitle>
            <DialogDescription>
              It disappears from the library and users can no longer pick it.
              Ads already made with it keep their own copy and keep working. You
              can upload the same file again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const t = confirmDelete;
                setConfirmDelete(null);
                if (t) void act(t.id, "", "DELETE", "Template deleted.");
              }}
            >
              <Trash2Icon />
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
