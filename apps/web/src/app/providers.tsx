"use client";

// App-wide client providers:
//  - next-themes: dark/light/system theme via a `class` on <html>.
//  - TanStack Query: the single source of truth for *server* state (run
//    status, artifacts), fetched by polling the route handler / Hono api.
//  - sonner <Toaster />: global toasts (confirm/reject/cancel feedback).
// Client-only UI state stays in local component state. No global store
// (zustand) — see SPEC §4.1.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
