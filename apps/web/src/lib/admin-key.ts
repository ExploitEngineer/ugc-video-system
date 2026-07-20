"use client";

// The admin key, held in localStorage. A SOFT GUARD, not authentication: the API
// checks it against `ADMIN_API_KEY`, which stops a stranger who finds the URL
// from uploading a 200MB .aep and burning Nexrender credits. F8 replaces it with
// real Supabase RBAC.
//
// Same `useSyncExternalStore` shape as `studio-pipeline-tab.ts`, so it renders
// correctly on the server (empty) and hydrates without a flash.

import { useSyncExternalStore } from "react";

const KEY = "adverra:admin-key";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(KEY, key);
  else localStorage.removeItem(KEY);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

const read = (): string =>
  typeof window === "undefined" ? "" : (localStorage.getItem(KEY) ?? "");

export function useAdminKey(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}
