// In-process change bus for the SSE endpoints.
//
// The Hono server and the background worker run in the SAME Node process
// (see index.ts: serve() + startWorker()), so a plain EventEmitter is enough to
// push run state to connected clients the moment the worker writes it — no DB
// polling loop, no Supabase Realtime (which we can't use until RLS/auth land).
//
// The bus only carries a SIGNAL ("run X changed" / "the list changed"), never a
// payload: the SSE handler re-reads the authoritative RunDetail / Run[] from the
// DB when it sees a signal. That keeps the DB the single source of truth, so a
// dropped emit (or a second worker process) can only delay an update, never
// desync one — the handler's low-frequency backstop re-read covers that case.

import { EventEmitter } from "node:events";

/** Fired on any run row/asset/step change for a specific run. */
const runEvent = (runId: string) => `run:${runId}`;
/** Fired whenever the run LIST could have changed (create/delete/status). */
const LIST_EVENT = "list";

// One emitter for the whole process. No listener cap: every open tab adds a
// listener per stream it watches, and that's expected — not a leak.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/**
 * Signal that a single run changed (status, step event, or a new asset). Also
 * bumps the list (a status change repaints the sidebar dot). Cheap + synchronous
 * — safe to call from any persist chokepoint.
 */
export function notifyRunChanged(runId: string): void {
  emitter.emit(runEvent(runId), runId);
  emitter.emit(LIST_EVENT);
}

/** Signal that the run list changed without a specific run subscriber caring
 *  (run created or deleted). */
export function notifyListChanged(): void {
  emitter.emit(LIST_EVENT);
}

export function onRunChanged(runId: string, cb: () => void): void {
  emitter.on(runEvent(runId), cb);
}

export function offRunChanged(runId: string, cb: () => void): void {
  emitter.off(runEvent(runId), cb);
}

export function onListChanged(cb: () => void): void {
  emitter.on(LIST_EVENT, cb);
}

export function offListChanged(cb: () => void): void {
  emitter.off(LIST_EVENT, cb);
}
