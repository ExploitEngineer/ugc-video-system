"use client";

// The admin template console. Deliberately unpolished: upload an .aep, watch it
// reach `ready`, read what the introspection found, and pick it up in the studio.
//
// The key gate is a soft guard, not auth. F8 replaces it with Supabase RBAC.

import type { TemplateAdmin } from "@ugc/shared";
import { LayoutTemplateIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { setAdminKey, useAdminKey } from "@/lib/admin-key";
import { ADMIN_KEY_HEADER, adminFetch } from "@/lib/api";

const NON_TERMINAL = ["registering", "introspecting", "previewing"];

const STATUS_STYLE: Record<string, string> = {
  ready: "text-success border-success/40 bg-success/10",
  failed: "text-destructive border-destructive/40 bg-destructive/10",
};

function StatusPill({ status }: { status: string }) {
  const style =
    STATUS_STYLE[status] ??
    "text-brand border-brand/40 bg-brand/10 animate-pulse";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${style}`}
    >
      {status}
    </span>
  );
}

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

function SlotTable({ template }: { template: TemplateAdmin }) {
  if (!template.slots.length) return null;
  return (
    <div className="border-border/60 mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground bg-white/[0.03]">
          <tr>
            {["kind", "layer", "composition", "detail"].map((h) => (
              <th key={h} className="px-3 py-1.5 font-mono font-normal">
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
              <td className="text-foreground px-3 py-1.5 font-mono">
                {s.asset}
              </td>
              <td className="px-3 py-1.5 font-mono">{s.jobLayerName}</td>
              <td className="text-muted-foreground px-3 py-1.5 font-mono">
                {s.composition}
              </td>
              <td className="text-muted-foreground px-3 py-1.5">
                {s.asset === "VIDEO" &&
                  (s.durationSec
                    ? `${s.durationSec}s slice`
                    : "length unknown — even split")}
                {s.asset === "IMAGE" &&
                  (s.imageClass === "content"
                    ? "generated"
                    : `${s.imageClass} — template's own art`)}
                {s.asset === "TEXT" &&
                  (s.charBudget ? `max ${s.charBudget} chars` : "written")}
                {s.asset === "AUDIO" && "receives the voiceover"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminTemplatesView() {
  const key = useAdminKey();
  const [rows, setRows] = useState<TemplateAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!key) return;
    const res = await adminFetch("/templates", key);
    if (res.status === 401) {
      setAdminKey(""); // stale key — re-gate rather than silently failing
      return;
    }
    if (!res.ok) {
      setError(
        (await res.json().catch(() => null))?.error ?? "Failed to load.",
      );
      return;
    }
    setError(null);
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

  // XHR, not fetch: `fetch` cannot report upload progress, and these are 200MB.
  const upload = (file: File) => {
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.append("file", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/templates");
    xhr.setRequestHeader(ADMIN_KEY_HEADER, key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 400) {
        setError(
          (JSON.parse(xhr.responseText || "{}") as { error?: string }).error ??
            `Upload failed (${xhr.status})`,
        );
      }
      void load();
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed.");
    };
    xhr.send(form);
  };

  const act = async (id: string, path: string, method: string) => {
    await adminFetch(`/templates/${id}${path}`, key, { method });
    void load();
  };

  if (!key) return <KeyGate />;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-display text-2xl">Template admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload an After Effects project. Users pick from what reaches{" "}
            <span className="text-success font-mono">ready</span>.
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

      <div className="border-border/70 bg-card/40 rounded-xl border p-5 backdrop-blur">
        <input
          ref={fileRef}
          type="file"
          accept=".aep,.zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="brand"
            onClick={() => fileRef.current?.click()}
            disabled={progress !== null}
          >
            {progress !== null
              ? `Uploading ${progress}%`
              : "Upload .aep or .zip"}
          </Button>
          <p className="text-muted-foreground text-xs">
            Collect Files into a .zip if the project links external footage.
            .mogrt is not supported.
          </p>
        </div>
        {progress !== null && (
          <div className="bg-border/60 mt-3 h-1 w-full overflow-hidden rounded">
            <div
              className="bg-brand h-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
      </div>

      <div className="mt-6 space-y-4">
        {rows === null && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {rows?.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No templates yet. Upload one above.
          </p>
        )}
        {rows?.map((t) => (
          <div
            key={t.id}
            className="border-border/70 bg-card/40 rounded-xl border p-5 backdrop-blur"
          >
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={t.status} />
              <span className="text-foreground font-medium">
                {t.displayName}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {t.durationSec ? `${t.durationSec}s` : "—"} ·{" "}
                {t.aspectRatio ?? "—"}
              </span>
              {t.slotCounts && (
                <span className="text-muted-foreground font-mono text-xs">
                  {t.slotCounts.video}v {t.slotCounts.image}i{" "}
                  {t.slotCounts.text}t {t.slotCounts.audio}a
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(t.id, "/preview", "DELETE")}
                  title="Throw the preview away and re-render it"
                >
                  <RefreshCwIcon className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(t.id, "", "DELETE")}
                  title="Archive"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>

            {t.error && (
              <p className="text-destructive mt-3 text-sm">{t.error}</p>
            )}

            {t.previewVideoUrl && (
              <video
                src={t.previewVideoUrl}
                poster={t.previewPosterUrl ?? undefined}
                controls
                muted
                playsInline
                className="bg-media mt-3 max-h-56 rounded-lg"
              />
            )}

            <SlotTable template={t} />
          </div>
        ))}
      </div>
    </div>
  );
}
