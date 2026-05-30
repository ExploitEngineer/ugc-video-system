"use client";

// App-wide client providers. Currently just TanStack Query — the single
// source of truth for *server* state (run status, artifacts), fetched by
// polling the Hono api. Client-only UI state stays in local component
// state; add a Context provider here only when a real cross-cutting need
// appears (e.g. global toasts). No global store (zustand) — see SPEC §4.1.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session; created lazily so it's stable across
  // re-renders and never shared between requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Run state lives server-side; don't refetch on every focus.
            refetchOnWindowFocus: false,
            staleTime: 5_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
