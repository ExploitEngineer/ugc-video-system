"use client";

// Client-side run history. There is no run-list endpoint and no auth, so the
// sidebar's "chats" come from localStorage: each run created or opened in this
// browser is recorded here, newest first. The sidebar fetches each run's live
// detail through the existing /api/runs/:id proxy.

import { useSyncExternalStore } from "react";

const KEY = "adverra:runs";
const CAP = 50;
const EMPTY: RunHistoryEntry[] = [];

export type RunHistoryEntry = {
  id: string;
  prompt: string;
  createdAt: string;
};

const listeners = new Set<() => void>();
let cache: RunHistoryEntry[] | null = null;

function read(): RunHistoryEntry[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RunHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function emit() {
  for (const l of listeners) l();
}

function write(next: RunHistoryEntry[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore quota / disabled storage
  }
  emit();
}

function getSnapshot(): RunHistoryEntry[] {
  if (cache === null) cache = read();
  return cache;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Keep tabs in sync — another tab writing the key invalidates our cache.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = read();
      emit();
    }
  });
}

/**
 * Record a run. New runs are prepended; a run that already exists keeps its
 * position and is only rewritten when its prompt actually changed — this avoids
 * reorder thrash and render loops when called from a polling effect.
 */
export function addRun(entry: RunHistoryEntry) {
  const cur = getSnapshot();
  const idx = cur.findIndex((r) => r.id === entry.id);
  if (idx === -1) {
    write([entry, ...cur].slice(0, CAP));
    return;
  }
  const existing = cur[idx];
  if (
    existing.prompt === entry.prompt &&
    existing.createdAt === entry.createdAt
  ) {
    return;
  }
  const next = cur.slice();
  next[idx] = { ...existing, ...entry };
  write(next);
}

export function removeRun(id: string) {
  write(getSnapshot().filter((r) => r.id !== id));
}

/** Reactive, newest-first list of recorded runs. */
export function useRunHistory(): RunHistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
