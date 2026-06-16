"use client";

// Live run-LIST updates over SSE — replaces the sidebar's 10s list poll.
//
// Opens an EventSource to the same-origin proxy and writes each pushed `Run[]`
// into the ["runs"] query cache. Fires whenever any run is created, deleted, or
// changes status, so the sidebar (history + status dots) stays live without
// polling. The browser auto-reconnects on a dropped connection.

import { useQueryClient } from "@tanstack/react-query";
import type { Run } from "@ugc/shared";
import { useEffect } from "react";

export function useRunsStream(enabled = true): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/runs/events");

    es.addEventListener("snapshot", (e) => {
      try {
        const runs = JSON.parse((e as MessageEvent).data) as Run[];
        queryClient.setQueryData(["runs"], runs);
      } catch {
        // Ignore a malformed frame; the next snapshot/backstop corrects it.
      }
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        void queryClient.invalidateQueries({ queryKey: ["runs"] });
      }
    };

    return () => es.close();
  }, [enabled, queryClient]);
}
