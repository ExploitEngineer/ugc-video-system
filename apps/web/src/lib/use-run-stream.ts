"use client";

// Live run updates over SSE — replaces the run view's polling.
//
// Opens an EventSource to the same-origin proxy and writes each pushed
// `RunDetail` into the ["run", runId] query cache — the SAME key the run view
// (and sidebar) read — so the UI updates with no re-fetch. The server closes
// the stream with a terminal `done` event once a run settles (`failed`, or
// `completed` with its final video landed) and we close our end too, so a
// finished run's tab doesn't poll forever.
//
// That close is permanent, though — nothing here would ever reopen it. A
// regenerate action (regenerate-video / regenerate-template) flips a settled
// run back to `running` via a one-shot mutation response, which briefly shows
// the new status, but with the stream dead no further progress (step events,
// the eventual re-completion or re-failure) ever arrives — the UI looks stuck
// exactly where the one-shot update left it. `settled` is the caller's OWN
// read of the run's current status (same query, so it flips the instant a
// regenerate mutation writes the cache); including it in the effect's deps
// tears down the dead connection and opens a fresh one the moment it flips
// back to false.
//
// Pass `enabled=false` (e.g. once a run is confirmed missing) to stop a 404
// reconnect loop.

import { useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { useEffect } from "react";

export function useRunStream(
  runId: string,
  enabled = true,
  settled = false,
): void {
  const queryClient = useQueryClient();

  // `settled` is a deliberate RE-SUBSCRIBE TRIGGER, not a value this effect
  // reads. The server closes the SSE stream once a run settles; when a
  // regenerate flips it back to `running`, this dep tears down the dead
  // connection and opens a fresh one (see the header note). Biome's autofix
  // would drop it and silently restore the "UI looks stuck after regenerate" bug.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` is a re-subscribe trigger, not a read value — see above.
  useEffect(() => {
    if (!enabled || !runId) return;

    const es = new EventSource(`/api/runs/${runId}/events`);

    es.addEventListener("snapshot", (e) => {
      try {
        const detail = JSON.parse((e as MessageEvent).data) as RunDetail;
        queryClient.setQueryData(["run", runId], detail);
      } catch {
        // Ignore a malformed frame; the next snapshot/backstop corrects it.
      }
    });

    // Terminal — the server is done pushing. Close so EventSource doesn't
    // immediately reconnect to a stream that would just re-send `done`.
    es.addEventListener("done", () => es.close());

    es.onerror = () => {
      // EventSource reconnects on its own. If it's permanently closed, nudge a
      // one-shot refetch so the cache can't go stale behind a dead stream.
      if (es.readyState === EventSource.CLOSED) {
        void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      }
    };

    return () => es.close();
  }, [runId, enabled, queryClient, settled]);
}
