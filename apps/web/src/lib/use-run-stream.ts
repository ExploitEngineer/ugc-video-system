"use client";

// Live run updates over SSE — replaces the run view's polling.
//
// Opens an EventSource to the same-origin proxy and writes each pushed
// `RunDetail` into the ["run", runId] query cache — the SAME key the run view
// (and sidebar) read — so the UI updates with no re-fetch. The browser
// auto-reconnects on a dropped connection; the server closes the stream with a
// terminal `done` event once the final video has landed. Pass `enabled=false`
// (e.g. once a run is confirmed missing) to stop a 404 reconnect loop.

import { useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { useEffect } from "react";

export function useRunStream(runId: string, enabled = true): void {
  const queryClient = useQueryClient();

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
  }, [runId, enabled, queryClient]);
}
