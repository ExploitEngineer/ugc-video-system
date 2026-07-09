"use client";

// Which pipeline the studio sidebar is showing — "video" (normal) or
// "template" (Nexrender). Persisted in localStorage (same shape as
// run-history.ts) so switching tabs is instant and survives a refresh; it
// isn't a URL query param because the switch lives in the persistent sidebar
// layout, visible across every /studio/* route, not scoped to one page.

import { useSyncExternalStore } from "react";

const KEY = "adverra:studio-pipeline-tab";

export type PipelineTab = "video" | "template";

const listeners = new Set<() => void>();
let cache: PipelineTab | null = null;

function read(): PipelineTab {
  if (typeof window === "undefined") return "video";
  const raw = window.localStorage.getItem(KEY);
  return raw === "template" ? "template" : "video";
}

function getSnapshot(): PipelineTab {
  if (cache === null) cache = read();
  return cache;
}

function getServerSnapshot(): PipelineTab {
  return "video";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = read();
      for (const l of listeners) l();
    }
  });
}

export function setPipelineTab(tab: PipelineTab) {
  cache = tab;
  try {
    window.localStorage.setItem(KEY, tab);
  } catch {
    // ignore quota / disabled storage
  }
  for (const l of listeners) l();
}

/** Reactive current pipeline tab, SSR-safe (defaults to "video" on the server). */
export function usePipelineTab(): PipelineTab {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
